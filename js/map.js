import { state } from './app.js';
import { fetchRouteSegment } from './api.js';
import { calculateGpxGeometricDistance, findClosestCoordinateIndex } from './utils.js';

export let map;

export function initMap() {
    map = L.map('map', { tap: false, zoomControl: false }).setView([64.0, 26.0], 5);
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

export function setupMapEvents() {
    map.on('moveend', renderDynamicWaypoints);
    map.on('zoomend', renderDynamicWaypoints);
    map.on('click', async (e) => {
        document.getElementById('sidebar').classList.remove('open');
        await handleMapClick(e.latlng);
    });
}

// 7. GEOLOKAATIO - Paikannetaan käyttäjä kartalle sykkivällä sinisellä pallolla
export function locateUser() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                map.setView([lat, lng], 13);

                const blueBallIcon = L.divIcon({
                    className: 'user-location-icon',
                    html: `<div class="user-location-ball"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                if (state.userLocationMarker) map.removeLayer(state.userLocationMarker);
                state.userLocationMarker = L.marker([lat, lng], { icon: blueBallIcon }).addTo(map);
            },
            () => { console.log("Sijaintipaikannus evätty tai ei saatavilla."); },
            { enableHighAccuracy: true, timeout: 7000 }
        );
    }
}

// Klikkaamalla lisätään uusia reittipisteitä
export async function handleMapClick(latlng) {
    if (state.isReadOnly) return;
    const newPoint = [latlng.lat, latlng.lng];
    let activeRoute = state.routes[state.routes.length - 1];

    // ERITYISSÄÄNTÖ 2: Jos edellinen toiminto oli GPX-tuonti, klikkaus aloittaa kokonaan uuden itsenäisen uran
    if (!activeRoute || state.lastActionWasImport) {
        const color = state.colorPalette[state.colorIndex % state.colorPalette.length];
        state.colorIndex++;
        const routeId = 'custom_' + Date.now();
        const layer = L.polyline([], { color: color, weight: 6, opacity: 0.85 }).addTo(map);

        activeRoute = { id: routeId, name: 'Oma reitti', waypoints: [], coords: [], color: color, layer: layer };
        state.routes.push(activeRoute);
        state.lastActionWasImport = false;
    }

    activeRoute.waypoints.push(newPoint);
    if (activeRoute.coords.length === 0) {
        activeRoute.coords.push(newPoint);
    } else {
        const lastWp = activeRoute.waypoints[activeRoute.waypoints.length - 2];
        const segment = await fetchRouteSegment(lastWp, newPoint);
        activeRoute.coords.push(...segment.slice(1));
    }

    activeRoute.layer.setLatLngs(activeRoute.coords);
    updateInterfaceRouteLists();
    renderDynamicWaypoints();
}

// 6. DYNAAMINEN REITTIPISTEIDEN KARSINTA JA ZOOM-AUTOMATIIKKA
export function renderDynamicWaypoints() {
    state.clickMarkers.forEach(m => map.removeLayer(m));
    state.clickMarkers = [];
    if (state.routes.length === 0) return;
    
    const bounds = map.getBounds();
    const currentZoom = map.getZoom();

    // Määritetään suodatettavien waypointtien enimmäismäärä zoom-tason perusteella
    let maxInsidePoints = 6; 
    if (currentZoom >= 16) maxInsidePoints = 40; 
    else if (currentZoom >= 14) maxInsidePoints = 20;
    else if (currentZoom >= 11) maxInsidePoints = 12;

    state.routes.forEach(route => {
        if (!route.waypoints || route.waypoints.length === 0) return;

        let insideIndices = [];
        for (let i = 0; i < route.waypoints.length; i++) {
            if (bounds.contains(L.latLng(route.waypoints[i][0], route.waypoints[i][1]))) {
                insideIndices.push(i);
            }
        }

        let targetIndices = new Set();
        if (insideIndices.length > 0) {
            const step = Math.max(1, Math.floor(insideIndices.length / maxInsidePoints));
            
            for (let i = 0; i < insideIndices.length; i += step) {
                targetIndices.add(insideIndices[i]);
            }
            targetIndices.add(insideIndices[insideIndices.length - 1]);

            // Säännönmukaisesti: näytetään vähintään yksi piste näkymärajojen ulkopuolelta ennen ja jälkeen reittiosuuden
            const firstInsideIndex = insideIndices[0];
            if (firstInsideIndex > 0) targetIndices.add(firstInsideIndex - 1);

            const lastInsideIndex = insideIndices[insideIndices.length - 1];
            if (lastInsideIndex < route.waypoints.length - 1) targetIndices.add(lastInsideIndex + 1);
        } else {
            // Jos reitti on kokonaan näkymän ulkopuolella, pidetään vain alku- ja loppupisteet kartalla ladattuina
            targetIndices.add(0);
            targetIndices.add(route.waypoints.length - 1);
        }

        targetIndices.forEach(idx => {
            const coord = route.waypoints[idx];
            if (!coord) return;

            const flagIcon = L.divIcon({
                className: 'custom-flag-icon',
                html: `<div class="flag-icon-container"><div class="flag-pole"></div><div class="flag-cloth" style="background-color: ${route.color};"></div></div>`,
                iconSize: [24, 30],
                iconAnchor: [1, 30]
            });

            const flagMarker = L.marker([coord[0], coord[1]], { icon: flagIcon, draggable: !state.isReadOnly }).addTo(map);
            
            // Avaa varmistusmodaali klikatessa
            flagMarker.on('click', (evt) => {
                L.DomEvent.stopPropagation(evt);
                state.pendingDeletion = { routeId: route.id, waypointIndex: idx };
                document.getElementById('confirm-modal').classList.add('active');
            });

            // Raahattavat markerit (Draggable) - Laske reittiosuus lennossa uudestaan
            flagMarker.on('dragend', async (evt) => {
                const newLatLng = evt.target.getLatLng();
                route.waypoints[idx] = [newLatLng.lat, newLatLng.lng];
                await recalculateWholeRouteGeometry(route);
                renderDynamicWaypoints();
            });
            state.clickMarkers.push(flagMarker);
        });
    });
}

// Reitin osittainen ja täydellinen geometrian uudelleenlaskenta
export async function recalculateWholeRouteGeometry(route, deletedIndex = null, wasEdge = false) {
    // ERITYISSÄÄNTÖ 1: Jos alku- tai loppupiste poistetaan, ei lasketa reittiä kokonaan uusiksi, vaan poistetaan vain katkennut segmentti seuraavaan/edelliseen pisteeseen ast
    if (wasEdge && deletedIndex !== null && route.coords.length > 0) {
        if (deletedIndex === 0) {
            const nextWp = route.waypoints[0];
            let closestIdx = findClosestCoordinateIndex(route.coords, nextWp);
            route.coords = route.coords.slice(closestIdx);
        } else {
            const prevWp = route.waypoints[route.waypoints.length - 1];
            let closestIdx = findClosestCoordinateIndex(route.coords, prevWp);
            route.coords = route.coords.slice(0, closestIdx + 1);
        }
    } else {
        let newCoords = [];
        if (route.waypoints.length === 1) {
            newCoords = [route.waypoints[0]];
        } else {
            for (let i = 0; i < route.waypoints.length - 1; i++) {
                const segment = await fetchRouteSegment(route.waypoints[i], route.waypoints[i+1]);
                if (i === 0) newCoords.push(...segment);
                else newCoords.push(...segment.slice(1));
            }
        }
        route.coords = newCoords;
    }
    route.layer.setLatLngs(route.coords);
    updateInterfaceRouteLists();
}

// 5. ERITYISSÄÄNTÖ: Itsenäisten urien yhdistäminen automaattireitityksellä
export async function handleRouteMerge() {
    if (state.routes.length < 2) return;
    const finalMergedCoords = [];
    const finalWaypoints = [];
    
    for (let i = 0; i < state.routes.length; i++) {
        const currentRoute = state.routes[i];
        finalWaypoints.push(...currentRoute.waypoints);

        if (finalMergedCoords.length === 0) {
            finalMergedCoords.push(...currentRoute.coords);
        } else {
            const lastPt = finalMergedCoords[finalMergedCoords.length - 1];
            const firstPt = currentRoute.coords[0];
            // Täytetään urien väliin jäävä aukko automaattisesti reitityksellä
            const bridge = await fetchRouteSegment(lastPt, firstPt);
            finalMergedCoords.push(...bridge.slice(1));
            finalMergedCoords.push(...currentRoute.coords.slice(1));
        }
    }

    state.routes.forEach(r => map.removeLayer(r.layer));
    const newColor = state.colorPalette[state.colorIndex % state.colorPalette.length];
    state.colorIndex++;
    const newRouteId = 'merged_' + Date.now();
    const newLayer = L.polyline(finalMergedCoords, { color: newColor, weight: 6, opacity: 0.9 }).addTo(map);

    state.routes = [{ id: newRouteId, name: 'Yhdistetty reitti', waypoints: finalWaypoints, coords: finalMergedCoords, color: newColor, layer: newLayer }];
    state.lastActionWasImport = false;

    updateInterfaceRouteLists();
    zoomToFitAllRoutes();
    renderDynamicWaypoints();
    document.getElementById('sidebar').classList.remove('open');
}

export function updateInterfaceRouteLists() {
    const listEl = document.getElementById('gpx-route-list');
    listEl.innerHTML = '';
    
    const mergeBtn = document.getElementById('merge-routes-btn');
    const exportBtn = document.getElementById('export-gpx-btn');
    
    const hasMultipleRoutes = state.routes.length >= 2;
    const hasAnyRoutes = state.routes.length >= 1;

    mergeBtn.style.display = hasMultipleRoutes ? 'block' : 'none';
    exportBtn.style.display = hasAnyRoutes ? 'block' : 'none';

    if (state.routes.length === 0) {
        listEl.innerHTML = `<li class="route-item" style="color: #64748b; font-style: italic; border: none;">${state.isReadOnly ? 'Vain katselutila käytössä' : 'Ei aktiivisia reittejä'}</li>`;
        return;
    }

    state.routes.forEach(route => {
        const currentDistance = calculateGpxGeometricDistance(route.coords);
        const li = document.createElement('li');
        li.className = 'route-item';
        li.innerHTML = `
            <div class="route-meta">
                <span class="color-indicator" style="background-color: ${route.color}"></span>
                <span class="route-name" title="${route.name}">${route.name}</span>
            </div>
            <span class="route-distance">${currentDistance.toFixed(1)} km</span>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn'; delBtn.innerHTML = '&times;';
        delBtn.onclick = (evt) => { evt.stopPropagation(); removeWholeRoute(route.id); };
        li.appendChild(delBtn);
        listEl.appendChild(li);
    });
}

export function removeWholeRoute(id) {
    const routeToRemove = state.routes.find(r => r.id === id);
    if (routeToRemove) {
        map.removeLayer(routeToRemove.layer);
        state.routes = state.routes.filter(r => r.id !== id);
        updateInterfaceRouteLists();
        renderDynamicWaypoints();
        if (state.routes.length > 0) zoomToFitAllRoutes();
    }
}

export function zoomToFitAllRoutes() {
    if (state.routes.length === 0) return;
    const group = new L.featureGroup(state.routes.map(r => r.layer));
    map.fitBounds(group.getBounds().pad(0.05));
}

export function clearAllRoutes() {
    state.routes.forEach(r => map.removeLayer(r.layer));
    state.clickMarkers.forEach(m => map.removeLayer(m)); 
    state.routes = []; state.clickMarkers = []; state.colorIndex = 0; state.lastActionWasImport = false;
    updateInterfaceRouteLists();
    renderDynamicWaypoints();
    document.getElementById('sidebar').classList.remove('open');
}
