// js/map.js
// Leaflet-kartan alustus, markerien hallinta, dynaaminen näkyvyyssuodatus
// zoomin/bounds:in mukaan, raahattavat reittipisteet, popupit (Street View +
// poisto) sekä geolokaatio.
//
// Tila (kielitieto) tuodaan i18n-moduulista tiukalla import-sidonnalla,
// window-globaaleja ei käytetä.

import { t } from "./i18n.js";

let locationMarker = null;
let locationPulseLayer = null;
let locationWatchId = null;

/**
 * Alustaa Leaflet-kartan annettuun containeriin, lisää taustakartan,
 * zoom-kontrollin oikeaan yläkulmaan ja Instagram-brändilinkin attribuutioon.
 * @param {string} containerId
 * @returns {L.Map}
 */
export function initMap(containerId) {
  const map = L.map(containerId, {
    center: [60.1699, 24.9384], // Helsinki oletuskeskipiste
    zoom: 12,
    zoomControl: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Zoom-painikkeet oikeaan yläkulmaan.
  L.control.zoom({ position: "topright" }).addTo(map);

  addInstagramAttribution(map);

  return map;
}

/**
 * Lisää värikkään Instagram-linkin (@kaffe_racer) kartan attribuutiopalkkiin
 * aidolla brändigradientilla SVG:n kautta, ja pakottaa sen näkyviin myös
 * mobiililaitteilla.
 * @param {L.Map} map
 */
function addInstagramAttribution(map) {
  const svgIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:3px;">
      <defs>
        <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#FED576"/>
          <stop offset="26%" stop-color="#F47133"/>
          <stop offset="61%" stop-color="#BC3081"/>
          <stop offset="100%" stop-color="#4C63D2"/>
        </linearGradient>
      </defs>
      <path fill="url(#ig-gradient)" d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 2 .3 2.4.5.6.2 1 .5 1.5 1 .4.4.7.9 1 1.5.2.4.4 1.2.5 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 2-.5 2.4-.3.6-.6 1-1 1.5-.4.4-.9.7-1.5 1-.4.2-1.2.4-2.4.5-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-2-.3-2.4-.5-.6-.3-1-.6-1.5-1-.4-.4-.7-.9-1-1.5-.2-.4-.4-1.2-.5-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-2 .5-2.4.3-.6.6-1 1-1.5.4-.4.9-.7 1.5-1 .4-.2 1.2-.4 2.4-.5C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1 .1-1.6.2-1.9.4-.5.2-.8.4-1.1.7-.3.3-.6.7-.7 1.1-.1.3-.3.9-.4 1.9-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1 .2 1.6.4 1.9.2.5.4.8.7 1.1.3.3.7.6 1.1.7.3.1.9.3 1.9.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1-.1 1.6-.2 1.9-.4.5-.2.8-.4 1.1-.7.3-.3.6-.7.7-1.1.1-.3.3-.9.4-1.9.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1-.2-1.6-.4-1.9-.2-.5-.4-.8-.7-1.1-.3-.3-.7-.6-1.1-.7-.3-.1-.9-.3-1.9-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 1.8a2.7 2.7 0 100 5.4 2.7 2.7 0 000-5.4zm5.7-2a1.05 1.05 0 11-2.1 0 1.05 1.05 0 012.1 0z"/>
    </svg>`;

  const igHtml = `<a href="https://www.instagram.com/kaffe_racer" target="_blank" rel="noopener noreferrer" class="ig-attribution-link">${svgIcon}@kaffe_racer</a>`;
  map.attributionControl.addAttribution(igHtml);
}

/**
 * Etsii käyttäjän GPS/WiFi-sijainnin, keskittää kartan siihen (vain
 * ensimmäisellä onnistuneella haulla) ja piirtää/päivittää sykkivän
 * sinisen sijaintipallon. Käyttää watchPosition:ia, jotta pallo pysyy
 * ajan tasalla ja jotta selaimen myöhemmin myöntämä lupa (esim. käyttäjän
 * hyväksyttyä selaimen oma lupakysely) otetaan heti käyttöön.
 *
 * HUOM: monet selaimet (erityisesti muualla kuin localhost-osoitteessa,
 * tai upotetuissa näkymissä) vaativat sijaintipyynnölle käyttäjän oman
 * klikkauksen (user gesture) ennen kuin lupakysely edes avautuu. Tämän
 * takia sovelluksessa on myös oma "Paikanna minut" -painike (ks.
 * createLocateControl), joka kutsuu tätä samaa funktiota klikkauksesta.
 *
 * @param {L.Map} map
 * @param {{center:boolean}} [options] - center: keskitetäänkö kartta löytyessä (oletus true)
 */
export function locateUser(map, options = {}) {
  const shouldCenter = options.center !== false;

  if (!navigator.geolocation) {
    console.warn("Geolokaatio ei ole tämän selaimen/ympäristön tukema.");
    return;
  }

  const onSuccess = (pos) => {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    if (shouldCenter) map.setView(latlng, 15);
    drawPulsingLocation(map, latlng);
  };

  const onError = (err) => {
    // Näkyy devtools-konsolissa jotta ongelma (esim. evätty lupa,
    // ei-turvallinen origin) on helppo diagnosoida - ei kaadeta sovellusta.
    console.warn("Sijaintia ei saatu: " + err.message + " (code " + err.code + ")");
  };

  const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 };

  // Ensimmäinen nopea haku heti.
  navigator.geolocation.getCurrentPosition(onSuccess, onError, geoOptions);

  // Jatkuva seuranta pitää pallon ajan tasalla ja toimii "retry"-mekanismina
  // jos ensimmäinen haku epäonnistui mutta lupa myönnetään hieman myöhemmin.
  if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
  locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      drawPulsingLocation(map, latlng);
    },
    onError,
    geoOptions
  );
}

/**
 * Luo pyöreän "Paikanna minut" -painikkeen kartan oikeaan alakulmaan.
 * Painike takaa käyttäjän oman klikkauksen (user gesture), mikä on monissa
 * selaimissa edellytys sille, että sijaintilupakysely ylipäätään avautuu.
 * @param {L.Map} map
 * @param {Function} onClick - kutsutaan klikkauksesta, esim. () => locateUser(map)
 * @returns {L.Control}
 */
export function createLocateControl(map, onClick) {
  const LocateControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd: function () {
      const btn = L.DomUtil.create("button", "locate-control-btn");
      btn.type = "button";
      btn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", () => onClick());
      return btn;
    },
  });

  const control = new LocateControl();
  control.addTo(map);
  return control;
}

/**
 * Piirtää (tai päivittää) sykkivän sinisen pallon käyttäjän sijaintiin.
 * @param {L.Map} map
 * @param {[number,number]} latlng
 */
function drawPulsingLocation(map, latlng) {
  if (locationMarker) map.removeLayer(locationMarker);
  if (locationPulseLayer) map.removeLayer(locationPulseLayer);

  const pulseIcon = L.divIcon({
    className: "location-pulse-wrapper",
    html: '<div class="location-pulse"></div><div class="location-dot"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  locationMarker = L.marker(latlng, { icon: pulseIcon, interactive: false, zIndexOffset: 500 }).addTo(map);
}

/**
 * Luo popup-sisällön reittipisteelle: otsikko, Street View -painike ja
 * poistopainike. URL rakennetaan turvallisella merkkijonoyhdistelyllä.
 * @param {{lat:number,lng:number}} point
 * @returns {HTMLElement}
 */
function buildPopupContent(point) {
  const wrapper = document.createElement("div");
  wrapper.className = "waypoint-popup";

  const title = document.createElement("h4");
  title.className = "popup-title";
  title.textContent = t("popupWaypoint", "Waypoint");
  wrapper.appendChild(title);

  const streetViewUrl =
    "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + point.lat + "," + point.lng;

  const svBtn = document.createElement("a");
  svBtn.href = streetViewUrl;
  svBtn.target = "_blank";
  svBtn.rel = "noopener noreferrer";
  svBtn.className = "popup-streetview-btn";
  svBtn.textContent = t("popupStreetView", "Street View");
  wrapper.appendChild(svBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "popup-delete-btn";
  delBtn.textContent = t("popupDeletePoint", "Delete point");
  wrapper.appendChild(delBtn);

  return { wrapper, deleteButton: delBtn };
}

/**
 * Luo raahattavan Leaflet-markerin reittipisteelle ja sitoo sille popupin.
 * onDelete-callback kutsutaan kun käyttäjä painaa popupin poistopainiketta.
 * onDragEnd-callback kutsutaan kun raahaus päättyy, uusilla koordinaateilla.
 *
 * HUOM: bindDynamicMarkerEvents on määritelty tässä VAIN KERRAN, eikä sitä
 * dupliseerata muualla tiedostossa.
 *
 * @param {L.Map} map
 * @param {{id:string,lat:number,lng:number}} point
 * @param {Object} callbacks - { onDelete(pointId), onDragEnd(pointId, latlng) }
 * @returns {L.Marker}
 */
export function createWaypointMarker(map, point, callbacks) {
  const marker = L.marker([point.lat, point.lng], {
    draggable: true,
    autoPan: true,
  });

  bindDynamicMarkerEvents(marker, point, callbacks);

  return marker;
}

/**
 * Sitoo markeriin popup-sisällön ja tapahtumakuuntelijat (drag, popup-napit).
 * Tämä funktio on määritelty vain kerran koko tiedostossa.
 * @param {L.Marker} marker
 * @param {{id:string,lat:number,lng:number}} point
 * @param {Object} callbacks
 */
function bindDynamicMarkerEvents(marker, point, callbacks) {
  function refreshPopup(currentPoint) {
    const { wrapper, deleteButton } = buildPopupContent(currentPoint);
    deleteButton.addEventListener("click", () => {
      marker.closePopup();
      if (callbacks.onDelete) callbacks.onDelete(point.id);
    });
    marker.bindPopup(wrapper);
  }

  refreshPopup(point);

  marker.on("dragend", () => {
    const latlng = marker.getLatLng();
    point.lat = latlng.lat;
    point.lng = latlng.lng;
    refreshPopup(point);
    if (callbacks.onDragEnd) callbacks.onDragEnd(point.id, { lat: latlng.lat, lng: latlng.lng });
  });

  marker.on("popupopen", () => {
    // Varmistetaan popup on aina ajantasainen avattaessa (esim. kielenvaihdon jälkeen).
    refreshPopup(point);
  });
}

/**
 * Piirtää (tai päivittää) reitin polylinen kartalle annetun geometrian mukaan.
 * @param {L.Map} map
 * @param {L.Polyline|null} existingPolyline
 * @param {Array<{lat:number,lng:number}>} geometry
 * @param {string} color
 * @returns {L.Polyline}
 */
export function renderPolyline(map, existingPolyline, geometry, color = "#2f6f4f") {
  const latlngs = geometry.map((p) => [p.lat, p.lng]);

  if (existingPolyline) {
    existingPolyline.setLatLngs(latlngs);
    return existingPolyline;
  }

  return L.polyline(latlngs, {
    color,
    weight: 5,
    opacity: 0.85,
    lineJoin: "round",
  }).addTo(map);
}

/**
 * Laskee kuinka monta reittipistettä tulisi näyttää nykyisellä zoom-tasolla.
 * Kaukana (matala zoom) näytetään vain muutama piste, lähempänä enemmän.
 * @param {number} zoom
 * @returns {number}
 */
function maxVisiblePointsForZoom(zoom) {
  if (zoom >= 16) return 40;
  if (zoom >= 14) return 24;
  if (zoom >= 12) return 14;
  return 8; // kauas zoomattuna: 6-10 pistettä
}

/**
 * Suodattaa näytettävät markerit kartan nykyisen näkymän ja zoom-tason
 * mukaan. Näyttää aina vähintään yhden pisteen näkymän ulkopuolelta ennen
 * reitin alkua ja sen jälkeen, jotta reitin jatkuvuus hahmottuu.
 * Kutsutaan moveend- ja zoomend-tapahtumissa.
 *
 * @param {L.Map} map
 * @param {Array<{id:string,lat:number,lng:number}>} points
 * @param {Object<string,L.Marker>} markersById
 */
export function updateVisibleMarkers(map, points, markersById) {
  if (!points || points.length === 0) return;

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const maxVisible = maxVisiblePointsForZoom(zoom);

  const inViewIndices = [];
  points.forEach((p, i) => {
    if (bounds.contains([p.lat, p.lng])) inViewIndices.push(i);
  });

  const visibleSet = new Set(inViewIndices);

  // Karsitaan jos näkymässä olevia pisteitä on enemmän kuin sallittu maksimi:
  // otetaan tasavälinen otos näkyvistä pisteistä (säilyttäen ensimmäinen/viimeinen näkyvä).
  if (inViewIndices.length > maxVisible) {
    const step = Math.ceil(inViewIndices.length / maxVisible);
    const sampled = new Set();
    inViewIndices.forEach((idx, i) => {
      if (i % step === 0) sampled.add(idx);
    });
    sampled.add(inViewIndices[0]);
    sampled.add(inViewIndices[inViewIndices.length - 1]);
    visibleSet.clear();
    sampled.forEach((idx) => visibleSet.add(idx));
  }

  // Näytetään aina vähintään yksi piste ennen näkymää ja yksi sen jälkeen.
  if (inViewIndices.length > 0) {
    const firstInView = inViewIndices[0];
    const lastInView = inViewIndices[inViewIndices.length - 1];
    if (firstInView > 0) visibleSet.add(firstInView - 1);
    if (lastInView < points.length - 1) visibleSet.add(lastInView + 1);
  } else {
    // Näkymässä ei ole yhtään pistettä: näytetään lähin edeltävä/seuraava jos löytyy.
    visibleSet.add(0);
    visibleSet.add(points.length - 1);
  }

  points.forEach((p, i) => {
    const marker = markersById[p.id];
    if (!marker) return;
    const shouldShow = visibleSet.has(i);
    const isOnMap = map.hasLayer(marker);
    if (shouldShow && !isOnMap) marker.addTo(map);
    if (!shouldShow && isOnMap) map.removeLayer(marker);
  });
}

/**
 * Estää kartan pohjatapahtumat (raahaus, tuplaklikkaus, rullaus) leviämästä
 * annetun DOM-elementin (esim. bottom sheet -widgetin) läpi kartalle.
 * @param {L.Map} map
 * @param {HTMLElement} element
 */
export function disableMapEventsOn(map, element) {
  if (!element) return;
  L.DomEvent.disableClickPropagation(element);
  L.DomEvent.disableScrollPropagation(element);
}
