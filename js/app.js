// js/app.js
// Sovelluksen pääalustus, keskitetty tila (state) ja päätason event listenerit.
// Ei globaaleja window-muuttujia: kaikki tila kulkee tämän moduulin sisällä ja
// välitetään funktioille argumentteina.

import { t, getActiveLanguage } from "./i18n.js";
import { checkBackendStatus, fetchRoute, geocodeAddress, WORKER_URL } from "./api.js";
import {
  initMap,
  createWaypointMarker,
  renderPolyline,
  updateVisibleMarkers,
  locateUser,
  createLocateControl,
  disableMapEventsOn,
} from "./map.js";
import { importGpxFiles, downloadGpx } from "./gpx.js";
import { totalDistance, formatKm, debounce, uid, haversineDistance } from "./utils.js";

// ---------------------------------------------------------------------------
// Keskitetty sovellustila
// ---------------------------------------------------------------------------
const state = {
  map: null,
  routesLayer: null, // L.layerGroup - omistaa KAIKKI reittien markerit ja polylinet, jotta "Tyhjennä kaikki" voi tyhjentää kaikki tasot yhdellä varmalla kutsulla
  routes: [], // { id, name, points:[{id,lat,lng}], segments:[{geometry,distanceMeters}], polyline, markers:{}, imported, finalized }
  activeRouteId: null,
  readOnly: false,
  pendingDelete: null, // { routeId, pointId } odottaa modaalin vahvistusta
  pendingDownloadRouteId: null,
};

const ROUTE_COLORS = ["#2f6f4f", "#c9622a", "#2a5fa5", "#7a3f9d", "#b0392f", "#22807a"];

function el(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Reittilogiikka (segmenttipohjainen malli)
// ---------------------------------------------------------------------------

function routeColor(route) {
  const idx = state.routes.findIndex((r) => r.id === route.id);
  return ROUTE_COLORS[idx % ROUTE_COLORS.length];
}

function flattenGeometry(route) {
  if (route.points.length === 1) {
    return [{ lat: route.points[0].lat, lng: route.points[0].lng }];
  }
  const geo = [];
  route.segments.forEach((seg, i) => {
    const pts = seg.geometry;
    if (i === 0) {
      geo.push(...pts);
    } else {
      // Vältetään segmenttien liitoskohdan duplikaattipiste.
      geo.push(...pts.slice(1));
    }
  });
  return geo;
}

function routeTotalDistanceMeters(route) {
  return route.segments.reduce((sum, s) => sum + s.distanceMeters, 0);
}

function createNewRoute() {
  const route = {
    id: uid(),
    name: null,
    points: [],
    segments: [],
    polyline: null,
    markers: {},
    imported: false,
    finalized: false,
  };
  state.routes.push(route);
  state.activeRouteId = route.id;
  return route;
}

function getActiveRoute() {
  if (!state.activeRouteId) return null;
  return state.routes.find((r) => r.id === state.activeRouteId) || null;
}

async function computeSegmentBetween(a, b, fallbackStraightLine) {
  try {
    const { geometry, distanceMeters } = await fetchRoute([a, b]);
    return { geometry, distanceMeters };
  } catch (err) {
    console.error("Reititys epäonnistui, käytetään suoraa viivaa.", err);
    const geometry = [
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
    ];
    return { geometry, distanceMeters: haversineDistance(a, b) };
  }
}

function addMarkerForPoint(route, point) {
  const marker = createWaypointMarker(state.map, point, {
    onDelete: (pointId) => requestDeletePoint(route.id, pointId),
    onDragEnd: (pointId, latlng) => handlePointDragged(route.id, pointId, latlng),
  });
  route.markers[point.id] = marker;
  // Rekisteröidään markeri pysyvästi routesLayer-ryhmään (kertaalleen),
  // jotta "Tyhjennä kaikki" löytää sen varmasti riippumatta siitä onko se
  // juuri sillä hetkellä näkyvissä dynaamisen zoom/bounds-suodatuksen takia.
  state.routesLayer.addLayer(marker);
  updateVisibleMarkers(state.map, route.points, route.markers);
}

function redrawRoutePolyline(route) {
  const geometry = flattenGeometry(route);
  if (geometry.length < 2) {
    if (route.polyline) {
      state.routesLayer.removeLayer(route.polyline);
      route.polyline = null;
    }
    return;
  }
  route.polyline = renderPolyline(state.map, route.polyline, geometry, routeColor(route));
  state.routesLayer.addLayer(route.polyline);
}

/**
 * Lisää uuden pisteen aktiiviseen reittiin (tai luo uuden reitin jos
 * aktiivista/keskeneräistä reittiä ei ole - kattaa erityissäännöt 2 ja 3).
 * @param {{lat:number,lng:number}} latlng
 */
async function addPointToActiveRoute(latlng) {
  if (state.readOnly) return;

  let route = getActiveRoute();
  if (!route || route.finalized) {
    route = createNewRoute();
  }

  const newPoint = { id: uid(), lat: latlng.lat, lng: latlng.lng };
  const prevPoint = route.points[route.points.length - 1];
  route.points.push(newPoint);
  addMarkerForPoint(route, newPoint);

  if (prevPoint) {
    const seg = await computeSegmentBetween(prevPoint, newPoint);
    route.segments.push(seg);
    redrawRoutePolyline(route);
  }

  renderAll();
}

/**
 * Käsittelee reittipisteen raahauksen: laskee viereiset segmentit uudelleen.
 */
async function handlePointDragged(routeId, pointId, latlng) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return;

  const idx = route.points.findIndex((p) => p.id === pointId);
  if (idx === -1) return;

  const tasks = [];

  if (idx > 0) {
    tasks.push(
      computeSegmentBetween(route.points[idx - 1], route.points[idx]).then((seg) => {
        route.segments[idx - 1] = seg;
      })
    );
  }
  if (idx < route.points.length - 1) {
    tasks.push(
      computeSegmentBetween(route.points[idx], route.points[idx + 1]).then((seg) => {
        route.segments[idx] = seg;
      })
    );
  }

  await Promise.all(tasks);
  redrawRoutePolyline(route);
  renderAll();
}

/**
 * Kysyy vahvistuksen modaalissa ennen pisteen poistoa.
 */
function requestDeletePoint(routeId, pointId) {
  state.pendingDelete = { routeId, pointId };
  openConfirmModal();
}

/**
 * ERITYISSÄÄNTÖ 1: jos poistettava piste on reitin alku tai loppu, ei
 * reititetä koko uraa uusiksi vaan leikataan vain viimeinen/ensimmäinen
 * segmentti pois. Sisäisen pisteen poisto reitittää ympäröivän välin uusiksi.
 */
async function confirmDeletePoint() {
  const pending = state.pendingDelete;
  state.pendingDelete = null;
  if (!pending) return;

  const route = state.routes.find((r) => r.id === pending.routeId);
  if (!route) return;

  const idx = route.points.findIndex((p) => p.id === pending.pointId);
  if (idx === -1) return;

  // Poista markeri kartalta.
  const marker = route.markers[pending.pointId];
  if (marker) {
    state.routesLayer.removeLayer(marker);
    delete route.markers[pending.pointId];
  }

  const isFirst = idx === 0;
  const isLast = idx === route.points.length - 1;

  if (isFirst) {
    route.points.shift();
    if (route.segments.length > 0) route.segments.shift();
  } else if (isLast) {
    route.points.pop();
    if (route.segments.length > 0) route.segments.pop();
  } else {
    const before = route.points[idx - 1];
    const after = route.points[idx + 1];
    const newSeg = await computeSegmentBetween(before, after);
    // Korvaa kaksi vanhaa segmenttiä yhdellä uudella.
    route.segments.splice(idx - 1, 2, newSeg);
    route.points.splice(idx, 1);
  }

  if (route.points.length === 0) {
    removeRoute(route.id);
  } else {
    redrawRoutePolyline(route);
  }

  renderAll();
}

function removeRoute(routeId) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return;

  Object.values(route.markers).forEach((m) => state.routesLayer.removeLayer(m));
  if (route.polyline) state.routesLayer.removeLayer(route.polyline);

  state.routes = state.routes.filter((r) => r.id !== routeId);
  if (state.activeRouteId === routeId) state.activeRouteId = null;
}

/**
 * Yhdistää kaikki itsenäiset urat kartalla yhdeksi yhtenäiseksi reitiksi,
 * reitittäen urien väliin jäävät aukot automaattisesti.
 */
async function mergeAllRoutes() {
  if (state.routes.length < 2 || state.readOnly) return;

  const ordered = state.routes.slice();
  const merged = {
    id: uid(),
    name: null,
    points: [],
    segments: [],
    polyline: null,
    markers: {},
    imported: false,
    finalized: true,
  };

  for (let i = 0; i < ordered.length; i++) {
    const route = ordered[i];
    if (i > 0) {
      const prevLast = merged.points[merged.points.length - 1];
      const nextFirst = route.points[0];
      const gapSeg = await computeSegmentBetween(prevLast, nextFirst);
      merged.segments.push(gapSeg);
    }
    merged.points.push(...route.points);
    merged.segments.push(...route.segments);
  }

  // Poista vanhat reitit kartalta ja tilasta.
  ordered.forEach((route) => {
    Object.values(route.markers).forEach((m) => state.routesLayer.removeLayer(m));
    if (route.polyline) state.routesLayer.removeLayer(route.polyline);
  });
  state.routes = [];

  // Lisää uudet markerit yhdistetylle reitille.
  state.routes.push(merged);
  merged.points.forEach((p) => addMarkerForPoint(merged, p));
  redrawRoutePolyline(merged);

  // Uusi klikkaus kartalle aloittaa aina uuden reitin yhdistämisen jälkeen.
  state.activeRouteId = null;

  renderAll();
}

function clearAllRoutes() {
  // Tyhjennetään koko routesLayer-ryhmä yhdellä varmalla kutsulla - tämä
  // poistaa kaikki markerit JA polylinet kartalta riippumatta siitä onko
  // jokin niistä juuri sillä hetkellä piilotettuna dynaamisen zoom/bounds-
  // suodatuksen takia tai muusta tilan epäsynkronoinnista.
  if (state.routesLayer) state.routesLayer.clearLayers();
  state.routes.forEach((route) => {
    route.markers = {};
    route.polyline = null;
  });
  state.routes = [];
  state.activeRouteId = null;
  renderAll();
}

// ---------------------------------------------------------------------------
// GPX-tuonti ja -vienti
// ---------------------------------------------------------------------------

async function handleGpxImport(fileList) {
  if (state.readOnly) return;
  const imported = await importGpxFiles(fileList);

  imported.forEach(({ name, points, rawPoints, indices }) => {
    const route = {
      id: uid(),
      name: name || null,
      points: points.map((p) => ({ id: uid(), lat: p.lat, lng: p.lng })),
      segments: [],
      polyline: null,
      markers: {},
      imported: true,
      finalized: true, // ERITYISSÄÄNTÖ 2/3: seuraava klikkaus aloittaa uuden reitin
    };

    // Jokaisen kahden peräkkäisen editointipisteen väliin rakennetaan
    // segmentti käyttäen ALKUPERÄISEN GPX-jäljen tarkkaa pätkää (rawPoints-
    // taulukosta indices[i]..indices[i+1]), ei suoraa viivaa. Näin karttaan
    // piirretty reitti seuraa täsmälleen alkuperäistä kulkureittiä, vaikka
    // vain harva osa pisteistä on muokattavia (raahattavia) reittipisteitä.
    for (let i = 1; i < indices.length; i++) {
      const startIdx = indices[i - 1];
      const endIdx = indices[i];
      const slice = rawPoints.slice(startIdx, endIdx + 1).map((p) => ({ lat: p.lat, lng: p.lng }));
      route.segments.push({
        geometry: slice,
        distanceMeters: totalDistance(slice),
      });
    }

    state.routes.push(route);
    route.points.forEach((p) => addMarkerForPoint(route, p));
    redrawRoutePolyline(route);
  });

  state.activeRouteId = null;

  if (imported.length && state.map) {
    const last = state.routes[state.routes.length - 1];
    const bounds = L.latLngBounds(last.points.map((p) => [p.lat, p.lng]));
    if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [40, 40] });
  }

  renderAll();
}

function requestGpxDownload(routeId) {
  state.pendingDownloadRouteId = routeId;
  const route = state.routes.find((r) => r.id === routeId);
  el("route-name-input").value = (route && route.name) || "";
  openRouteNameModal();
}

function confirmGpxDownload() {
  const routeId = state.pendingDownloadRouteId;
  state.pendingDownloadRouteId = null;
  closeRouteNameModal();

  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return;

  const name = el("route-name-input").value.trim() || t("routeLabel", "Route");
  route.name = name;

  const geometry = flattenGeometry(route);
  downloadGpx(geometry, name);
  renderRouteList();
}

// ---------------------------------------------------------------------------
// Osoitehaku (Nominatim)
// ---------------------------------------------------------------------------

const runGeocodeSearch = debounce(async (query) => {
  const resultsBox = el("address-suggestions");
  resultsBox.innerHTML = "";

  if (!query || query.trim().length < 3) {
    resultsBox.classList.remove("visible");
    return;
  }

  try {
    const results = await geocodeAddress(query);
    if (results.length === 0) {
      resultsBox.classList.remove("visible");
      return;
    }

    results.forEach((r) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "address-suggestion-item";
      item.textContent = r.label;
      item.addEventListener("click", () => {
        resultsBox.classList.remove("visible");
        el("address-input").value = r.label;
        // Säilytetään zoom-taso ennallaan, keskitetään vain kartta.
        state.map.panTo([r.lat, r.lng]);
        addPointToActiveRoute({ lat: r.lat, lng: r.lng });
      });
      resultsBox.appendChild(item);
    });

    resultsBox.classList.add("visible");
  } catch (err) {
    console.error("Osoitehaku epäonnistui", err);
    resultsBox.classList.remove("visible");
  }
}, 400);

// ---------------------------------------------------------------------------
// Renderöinti / UI-päivitykset
// ---------------------------------------------------------------------------

function renderAll() {
  renderRouteList();
  updateSidebarButtonVisibility();
}

function updateSidebarButtonVisibility() {
  el("merge-routes-btn").style.display = state.routes.length >= 2 ? "" : "none";
  el("download-gpx-btn").style.display = state.routes.length >= 1 ? "" : "none";
}

function renderRouteList() {
  const container = el("route-list-container");
  container.innerHTML = "";

  if (state.routes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "route-list-empty";
    empty.textContent = t("noRoutes");
    container.appendChild(empty);
    updateTotalDistanceDisplay(0);
    return;
  }

  let grandTotal = 0;

  state.routes.forEach((route, idx) => {
    const meters = routeTotalDistanceMeters(route);
    grandTotal += meters;

    const item = document.createElement("div");
    item.className = "route-list-item";
    item.style.borderLeftColor = routeColor(route);

    const label = document.createElement("span");
    label.className = "route-list-label";
    label.textContent = (route.name || t("routeLabel") + " " + (idx + 1)) + " — " + formatKm(meters) + " " + t("kmUnit");
    item.appendChild(label);

    const meta = document.createElement("span");
    meta.className = "route-list-meta";
    meta.textContent = t("pointCount", { count: route.points.length });
    item.appendChild(meta);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "route-list-delete";
    delBtn.setAttribute("aria-label", t("deleteRouteAria"));
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", () => {
      removeRoute(route.id);
      renderAll();
    });
    item.appendChild(delBtn);

    container.appendChild(item);
  });

  updateTotalDistanceDisplay(grandTotal);
}

function updateTotalDistanceDisplay(meters) {
  const totalEl = el("total-distance-value");
  if (totalEl) totalEl.textContent = formatKm(meters) + " " + t("kmUnit");
}

/**
 * Kääntää kaikki staattiset DOM-elementit aktiivisen kielen mukaan.
 * index.html pysyy täysin kielivapaana - kaikki tekstit tulevat tästä.
 */
function translateDOM() {
  document.title = t("appTitle");
  if (el("app-title")) el("app-title").textContent = t("appTitle");
  if (el("sidebar-title")) el("sidebar-title").textContent = t("sidebarTitle");
  if (el("address-input")) el("address-input").placeholder = t("addressPlaceholder");
  if (el("import-gpx-btn")) el("import-gpx-btn").textContent = t("importGpx");
  if (el("merge-routes-btn")) el("merge-routes-btn").textContent = t("mergeRoutes");
  if (el("download-gpx-btn")) el("download-gpx-btn").textContent = t("downloadGpx");
  if (el("clear-all-btn")) el("clear-all-btn").textContent = t("clearAll");
  if (el("contact-title")) el("contact-title").textContent = t("contactTitle", "Contact");
  if (el("readonly-banner")) el("readonly-banner").textContent = t("readOnlyBanner");
  if (el("route-list-title")) el("route-list-title").textContent = t("routeListTitle");
  if (el("total-distance-label")) el("total-distance-label").textContent = t("totalDistance");
  if (el("confirm-delete-title")) el("confirm-delete-title").textContent = t("confirmDeleteTitle");
  if (el("confirm-delete-body")) el("confirm-delete-body").textContent = t("confirmDeleteBody");
  if (el("confirm-yes-btn")) el("confirm-yes-btn").textContent = t("confirmYes");
  if (el("confirm-no-btn")) el("confirm-no-btn").textContent = t("confirmNo");
  if (el("route-name-modal-title")) el("route-name-modal-title").textContent = t("routeNameModalTitle");
  if (el("route-name-input")) el("route-name-input").placeholder = t("routeNamePlaceholder");
  if (el("route-name-save-btn")) el("route-name-save-btn").textContent = t("save");
  if (el("route-name-cancel-btn")) el("route-name-cancel-btn").textContent = t("cancel");
  if (el("hamburger-btn")) el("hamburger-btn").setAttribute("aria-label", t("hamburgerAria"));
  if (el("sidebar-close-btn")) el("sidebar-close-btn").setAttribute("aria-label", t("closeAria"));

  renderRouteList();
}

// ---------------------------------------------------------------------------
// Modaalit
// ---------------------------------------------------------------------------

function openConfirmModal() {
  el("confirm-delete-modal").classList.add("visible");
}
function closeConfirmModal() {
  el("confirm-delete-modal").classList.remove("visible");
  state.pendingDelete = null;
}
function openRouteNameModal() {
  el("route-name-modal").classList.add("visible");
}
function closeRouteNameModal() {
  el("route-name-modal").classList.remove("visible");
}

// ---------------------------------------------------------------------------
// Sidebar / Bottom sheet
// ---------------------------------------------------------------------------

function toggleSidebar(forceState) {
  const sidebar = el("sidebar");
  const shouldOpen = forceState !== undefined ? forceState : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", shouldOpen);
  el("sidebar-overlay").classList.toggle("visible", shouldOpen);
}

function toggleBottomSheet() {
  el("info-widget").classList.toggle("expanded");
}

// ---------------------------------------------------------------------------
// Backend-tilan tarkistus (Read-Only-tila)
// ---------------------------------------------------------------------------

async function initBackendStatus() {
  const ok = await checkBackendStatus();
  state.readOnly = !ok;
  el("readonly-banner").style.display = ok ? "none" : "flex";
}

// ---------------------------------------------------------------------------
// Alustus
// ---------------------------------------------------------------------------

function bindEventListeners() {
  state.map.on("click", (e) => {
    addPointToActiveRoute({ lat: e.latlng.lat, lng: e.latlng.lng });
  });

  state.map.on("moveend zoomend", () => {
    state.routes.forEach((route) => updateVisibleMarkers(state.map, route.points, route.markers));
  });

  el("hamburger-btn").addEventListener("click", () => toggleSidebar(true));
  el("sidebar-close-btn").addEventListener("click", () => toggleSidebar(false));
  el("sidebar-overlay").addEventListener("click", () => toggleSidebar(false));

  el("address-input").addEventListener("input", (e) => runGeocodeSearch(e.target.value));

  el("import-gpx-input").addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length) {
      handleGpxImport(e.target.files);
      e.target.value = "";
    }
  });
  el("import-gpx-btn").addEventListener("click", () => el("import-gpx-input").click());

  el("merge-routes-btn").addEventListener("click", () => mergeAllRoutes());
  el("clear-all-btn").addEventListener("click", () => clearAllRoutes());

  el("download-gpx-btn").addEventListener("click", () => {
    const routeId = state.routes.length ? state.routes[state.routes.length - 1].id : null;
    if (routeId) requestGpxDownload(routeId);
  });

  el("confirm-yes-btn").addEventListener("click", () => {
    // TÄRKEÄÄ: confirmDeletePoint() lukee state.pendingDelete:n, joten se
    // pitää kutsua ENNEN closeConfirmModal():ia (joka nollaa pendingDelete:n).
    // Väärä kutsujärjestys aiheutti sen, ettei piste koskaan poistunut.
    confirmDeletePoint();
    closeConfirmModal();
  });
  el("confirm-no-btn").addEventListener("click", () => closeConfirmModal());

  el("route-name-save-btn").addEventListener("click", () => confirmGpxDownload());
  el("route-name-cancel-btn").addEventListener("click", () => {
    state.pendingDownloadRouteId = null;
    closeRouteNameModal();
  });

  el("bottom-sheet-header").addEventListener("click", () => {
    if (window.innerWidth <= 768) toggleBottomSheet();
  });

  disableMapEventsOn(state.map, el("info-widget"));
  disableMapEventsOn(state.map, el("sidebar"));
}

function init() {
  state.map = initMap("map");
  state.routesLayer = L.layerGroup().addTo(state.map);
  translateDOM();
  bindEventListeners();
  initBackendStatus();

  // Automaattinen ensimmäinen yritys (voi epäonnistua ilman käyttäjän
  // klikkausta joissakin selaimissa/ympäristöissä - siksi myös oma
  // "Paikanna minut" -painike alla, joka toimii aina).
  locateUser(state.map);
  createLocateControl(state.map, () => locateUser(state.map));

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
