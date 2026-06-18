import { t } from './i18n.js';
import { calculateHaversineDistanceInKm } from './utils.js';

let map = null;
let layerGroup = null;
let stateRef = null;
let onWaypointChangeCallback = null;
let onWaypointClickCallback = null;

const colors = ['#007bc4', '#e67e22', '#2ecc71', '#9b59b6', '#f1c40f', '#e74c3c'];

export function initializeLeafletMapInstance(id, state, onWaypointChange, onWaypointClick) {
    stateRef = state;
    onWaypointChangeCallback = onWaypointChange;
    onWaypointClickCallback = onWaypointClick;

    map = L.map(id, { zoomControl: false }).setView([60.1699, 24.9384], 13);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);

    map.on('moveend', handleViewPortBoundsMarkersPruning);
    map.on('zoomend', handleViewPortBoundsMarkersPruning);

    return map;
}

export function renderGPXLocationPulseMarker(lat, lng) {
    const pulseIcon = L.divIcon({
        className: 'gps-pulse-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
    L.marker([lat, lng], { icon: pulseIcon }).addTo(map);
    map.setView([lat, lng], 14);
}

function handleViewPortBoundsMarkersPruning() {
    if (!stateRef) return;
    renderAllMapLayersAndTracks();
}

export function renderAllMapLayersAndTracks() {
    layerGroup.clearLayers();
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();

    let maxVisibleMarkers = 6;
    if (currentZoom >= 16) maxVisibleMarkers = 40;
    else if (currentZoom >= 14) maxVisibleMarkers = 20;
    else if (currentZoom >= 11) maxVisibleMarkers = 12;

    stateRef.tracks.forEach((track, trackIndex) => {
        const color = colors[trackIndex % colors.length];

        if (track.routeGeometry && track.routeGeometry.length > 0) {
            L.polyline(track.routeGeometry, { color: color, weight: 5, opacity: 0.75 }).addTo(layerGroup);
        }

        const wps = track.waypoints;
        if (wps.length === 0) return;

        const indicesToRender = new Set();
        indicesToRender.add(0);
        indicesToRender.add(wps.length - 1);

        const insideBoundsIndices = [];
        for (let i = 1; i < wps.length - 1; i++) {
            if (bounds.contains(wps[i].getLatLng())) {
                insideBoundsIndices.push(i);
            }
        }

        const step = Math.max(1, Math.ceil(insideBoundsIndices.length / maxVisibleMarkers));
        for (let i = 0; i < insideBoundsIndices.length; i += step) {
            indicesToRender.add(insideBoundsIndices[i]);
        }

        let firstInsideIndex = -1;
        let lastInsideIndex = -1;
        for (let i = 0; i < wps.length; i++) {
            if (bounds.contains(wps[i].getLatLng())) {
                if (firstInsideIndex === -1) firstInsideIndex = i;
                lastInsideIndex = i;
            }
        }

        if (firstInsideIndex > 0) indicesToRender.add(firstInsideIndex - 1);
        if (lastInsideIndex !== -1 && lastInsideIndex < wps.length - 1) indicesToRender.add(lastInsideIndex + 1);

        wps.forEach((wp, wpIndex) => {
            if (indicesToRender.has(wpIndex)) {
                wp.options.icon.options.html = `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`;
                wp.addTo(layerGroup);

                wp.off('dragend');
                wp.on('dragend', (e) => {
                    onWaypointChangeCallback(trackIndex, wpIndex, e.target.getLatLng());
                });

                wp.off('click');
                wp.on('click', () => {
                    onWaypointClickCallback(trackIndex, wpIndex);
                });
            }
        });
    });
}

export function createInteractiveWaypointMarker(latLng) {
    const icon = L.divIcon({
        className: 'custom-wp-icon',
        html: '<div></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
    return L.marker(latLng, { draggable: !stateRef.readOnlyMode, icon: icon });
}

export function calculateTrackGeometryTotalDistance(geometry) {
    let dist = 0;
    for (let i = 0; i < geometry.length - 1; i++) {
        dist += calculateHaversineDistanceInKm(
            geometry[i][0], geometry[i][1],
            geometry[i+1][0], geometry[i+1][1]
        );
    }
    return dist;
}
