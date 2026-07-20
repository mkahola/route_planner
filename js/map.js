import { t } from './i18n.js';

let map = null;
let layersControl = null;
let routePolylinesGroup = null;
let waypointsMarkersGroup = null;
let userGpsMarker = null;

export function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView([60.1699, 24.9384], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const osmTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri'
    });

    osmTile.addTo(map);

    const baseMaps = {};
    baseMaps[t('layerMap', 'Kartta')] = osmTile;
    baseMaps[t('layerSatellite', 'Satelliitti')] = esriSatellite;

    layersControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    routePolylinesGroup = L.layerGroup().addTo(map);
    waypointsMarkersGroup = L.layerGroup().addTo(map);

    if (map.attributionControl) {
        const instagramHTML = `
            <a href="https://www.instagram.com/kaffe_racer" target="_blank" rel="noopener noreferrer" 
               style="display: inline-flex; align-items: center; gap: 4px; color: #e1306c; font-weight: bold; text-decoration: none; vertical-align: middle;">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                    <defs>
                        <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="#fdf497" />
                            <stop offset="5%" stop-color="#fdf497" />
                            <stop offset="45%" stop-color="#fd5949" />
                            <stop offset="60%" stop-color="#d6249f" />
                            <stop offset="90%" stop-color="#285AEB" />
                        </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-gradient)"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke="url(#ig-gradient)"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="url(#ig-gradient)"></line>
                </svg>
                @kaffe_racer
            </a>
        `;
        map.attributionControl.addAttribution(instagramHTML);
    }

    return map;
}

export function createInteractiveWaypointMarker(latlng) {
    const customIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        shadowSize: [41, 41],
        shadowAnchor: [12, 41]
    });

    const marker = L.marker(latlng, { draggable: true, icon: customIcon });
    marker.isNewPoint = true;

    updateMarkerPopupContent(marker, latlng);
    return marker;
}

function updateMarkerPopupContent(marker, latlng) {
    const lat = latlng.lat;
    const lng = latlng.lng;
    
    const streetViewUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;

    const labelWaypoint = t('popupWaypoint', 'Reittipiste');
    const labelDelete = t('popupDeletePoint', 'Poista piste');
    const labelStreetView = t('popupStreetView', 'Street View');

    const popupContent = `
        <div style="font-family: sans-serif; padding: 4px; min-width: 130px; text-align: center;">
            <strong style="display: block; margin-bottom: 8px; color: #333; font-size: 13px;">${labelWaypoint}</strong>
            
            <a href="${streetViewUrl}" target="_blank" rel="noopener noreferrer" 
               style="display: flex; align-items: center; justify-content: center; gap: 6px; background-color: #4285F4; color: white; padding: 6px 10px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 11px; margin-bottom: 6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display: inline-block;">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                ${labelStreetView}
            </a>
            
            <button class="popup-delete-btn" 
                    style="display: block; width: 100%; background-color: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;">
                ${labelDelete}
            </button>
        </div>
    `;

    marker.bindPopup(popupContent, {
        offset: [0, -32],
        closeButton: true
    });
}

export function bindDynamicMarkerEvents(marker, globalState) {
    if (!marker || typeof marker.wpId === 'undefined') return;

    marker.off('dragend');
    marker.on('dragend', () => {
        let targetTrackIdx = -1;
        let targetWpIdx = -1;

        for (let i = 0; i < globalState.tracks.length; i++) {
            const idx = globalState.tracks[i].waypoints.findIndex(wp => wp.wpId === marker.wpId);
            if (idx !== -1) {
                targetTrackIdx = i;
                targetWpIdx = idx;
                break;
            }
        }

        if (targetTrackIdx !== -1 && targetWpIdx !== -1) {
            updateMarkerPopupContent(marker, marker.getLatLng());
            
            if (map._onReRoute) {
                map._onReRoute(targetTrackIdx, targetWpIdx, marker.getLatLng());
            }
        }
    });

    marker.off('click');
    marker.on('click', () => {
        marker.openPopup();

        setTimeout(() => {
            const deleteBtn = document.querySelector('.popup-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = () => {
                    let targetTrackIdx = -1;
                    let targetWpIdx = -1;

                    for (let i = 0; i < globalState.tracks.length; i++) {
                        const idx = globalState.tracks[i].waypoints.findIndex(wp => wp.wpId === marker.wpId);
                        if (idx !== -1) {
                            targetTrackIdx = i;
                            targetWpIdx = idx;
                            break;
                        }
                    }

                    if (targetTrackIdx !== -1 && targetWpIdx !== -1 && map._onDeletePrompt) {
                        marker.closePopup();
                        map._onDeletePrompt(targetTrackIdx, targetWpIdx);
                    }
                };
            }
        }, 50);
    });
}

export function updateMarkerVisibility(globalState) {
    waypointsMarkersGroup.clearLayers();
    if (!map) return;

    const bounds = map.getBounds();
    const currentZoom = map.getZoom();

    let maxAllowed = 8;
    if (currentZoom >= 16) maxAllowed = 40;
    else if (currentZoom >= 14) maxAllowed = 20;
    else if (currentZoom >= 12) maxAllowed = 12;

    globalState.tracks.forEach(track => {
        const wps = track.waypoints;
        if (wps.length === 0) return;

        const visibleIndices = [];
        wps.forEach((wp, idx) => {
            if (bounds.contains(wp.marker.getLatLng())) {
                visibleIndices.push(idx);
            }
        });

        const toShowSet = new Set();

        if (visibleIndices.length > 0) {
            const minVis = Math.min(...visibleIndices);
            const maxVis = Math.max(...visibleIndices);

            if (minVis > 0) toShowSet.add(minVis - 1);
            if (maxVis < wps.length - 1) toShowSet.add(maxVis + 1);

            const step = Math.max(1, Math.floor(visibleIndices.length / maxAllowed));
            for (let i = 0; i < visibleIndices.length; i += step) {
                toShowSet.add(visibleIndices[i]);
            }
            toShowSet.add(visibleIndices[visibleIndices.length - 1]);
        } else {
            toShowSet.add(0);
            toShowSet.add(wps.length - 1);
        }

        toShowSet.forEach(idx => {
            if (wps[idx] && wps[idx].marker) {
                waypointsMarkersGroup.addLayer(wps[idx].marker);
            }
        });
    });
}

export function renderRoutePolylines(globalState) {
    routePolylinesGroup.clearLayers();

    globalState.tracks.forEach(track => {
        if (track.geometry && track.geometry.length > 1) {
            const polyline = L.polyline(track.geometry, {
                color: '#007bff',
                weight: 5,
                opacity: 0.8
            });
            routePolylinesGroup.addLayer(polyline);
        }
    });
}

export function setUserLocationMarker(latlng) {
    if (userGpsMarker) {
        userGpsMarker.setLatLng(latlng);
    } else {
        const customGpsIcon = L.divIcon({
            className: 'gps-user-location',
            html: '<div class="gps-pulse-ring"></div><div class="gps-pulse-dot"></div>',
            iconSize: [0, 0]
        });

        userGpsMarker = L.marker(latlng, { icon: customGpsIcon }).addTo(map);
    }
    map.setView(latlng, 14);
}
