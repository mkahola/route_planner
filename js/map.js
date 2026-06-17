import { fetchORSRoute } from './api.js';
import { simplifyDouglasPeucker, calculateHaversineDistance } from './utils.js';

let map = null, layerGroup = null, userMarker = null, systemTracks = [], stateRef = null;

export function initializeLeafletMapInstance(id, state) {
    stateRef = state;
    map = L.map(id).setView([60.1699, 24.9384], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    layerGroup = L.layerGroup().addTo(map);
    map.on('moveend', handleViewPortBoundsMarkersPruning);
    map.on('zoomend', handleViewPortBoundsMarkersPruning);
    return map;
}
export function synchroniseTracksDataReference(arr) { systemTracks = arr; }

async function computeTrackRoutingPathIntersection(track) {
    if (stateRef.readOnlyMode) return;
    if (track.waypoints.length < 2) {
        if (track.polyline) layerGroup.removeLayer(track.polyline);
        track.routeGeometry = track.waypoints.map(w => [w.getLatLng().lat, w.getLatLng().lng]);
        track.polyline = L.polyline(track.routeGeometry, { color: 'blue', weight: 4 }).addTo(layerGroup);
        stateRef.updateUICallback(); return;
    }
    const payload = track.waypoints.map(m => [m.getLatLng().lng, m.getLatLng().lat]);
    const geojson = await fetchORSRoute(payload, stateRef.avoidHighways);
    if (track.polyline) layerGroup.removeLayer(track.polyline);
    if (geojson?.features?.length > 0) {
        track.routeGeometry = simplifyDouglasPeucker(geojson.features[0].geometry.coordinates.map(c => [c[1], c[0]]), 0.00005);
    } else {
        track.routeGeometry = track.waypoints.map(w => [w.getLatLng().lat, w.getLatLng().lng]);
    }
    track.polyline = L.polyline(track.routeGeometry, { color: 'blue', weight: 4 }).addTo(layerGroup);
    stateRef.updateUICallback(); handleViewPortBoundsMarkersPruning();
}

export function generateWaypointMarkerElement(latlng, track) {
    const marker = L.marker(latlng, { draggable: !stateRef.readOnlyMode });
    if (!stateRef.readOnlyMode) {
        marker.on('dragend', () => computeTrackRoutingPathIntersection(track));
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            stateRef.openConfirmationModalCallback(() => {
                const idx = track.waypoints.indexOf(marker); if (idx === -1) return;
                layerGroup.removeLayer(marker); track.waypoints.splice(idx, 1);
                if (track.isImportedGPX && (idx === 0 || idx === track.waypoints.length)) {
                    if (track.routeGeometry.length > 1) {
                        const chunk = Math.floor(track.routeGeometry.length / (track.waypoints.length + 2));
                        idx === 0 ? track.routeGeometry.splice(0, chunk) : track.routeGeometry.splice(-chunk);
                        if (track.polyline) layerGroup.removeLayer(track.polyline);
                        track.polyline = L.polyline(track.routeGeometry, { color: 'blue', weight: 4 }).addTo(layerGroup);
                    }
                    stateRef.updateUICallback(); handleViewPortBoundsMarkersPruning();
                } else { computeTrackRoutingPathIntersection(track); }
            });
        });
    }
    return marker;
}
export function injectGPXCoordinateTrack(coords) {
    if (!coords.length) return null;
    const opt = simplifyDouglasPeucker(coords, 0.0005);
    const track = { id: Math.random().toString(36).substr(2,5), waypoints: [], polyline: null, routeGeometry: coords, isImportedGPX: true };
    opt.forEach(pt => track.waypoints.push(generateWaypointMarkerElement(pt, track)));
    track.polyline = L.polyline(coords, { color: 'purple', weight: 4 }).addTo(layerGroup);
    systemTracks.push(track); handleViewPortBoundsMarkersPruning(); return track;
}
export function handleViewPortBoundsMarkersPruning() {
    if (!map) return;
    const bounds = map.getBounds(), zoom = map.getZoom();
    let limit = zoom >= 16 ? 40 : (zoom >= 12 ? 20 : 8);
    systemTracks.forEach(t => {
        if (!t.waypoints.length) return;
        const vis = []; t.waypoints.forEach((w, i) => { if (bounds.contains(w.getLatLng())) vis.push(i); });
        const flags = new Array(t.waypoints.length).fill(false), step = Math.ceil(vis.length / limit);
        for (let i = 0; i < vis.length; i += step) flags[vis[i]] = true;
        if (vis.length > 0) {
            if (vis[0] > 0) flags[vis[0] - 1] = true;
            if (vis[vis.length - 1] < t.waypoints.length - 1) flags[vis[vis.length - 1] + 1] = true;
        }
        t.waypoints.forEach((w, i) => flags[i] ? (!layerGroup.hasLayer(w) && layerGroup.addLayer(w)) : (layerGroup.hasLayer(w) && layerGroup.removeLayer(w)));
    });
}
export async function mergeIndependentTracksOnMap() {
    if (systemTracks.length < 2 || stateRef.readOnlyMode) return;
    const pool = [...systemTracks], seq = [pool.shift()];
    while (pool.length > 0) {
        const last = seq[seq.length - 1].waypoints.slice(-1)[0].getLatLng();
        let closeIdx = 0, minDist = Infinity;
        pool.forEach((t, i) => {
            const d = calculateHaversineDistance([last.lat, last.lng], [t.waypoints[0].getLatLng().lat, t.waypoints[0].getLatLng().lng]);
            if (d < minDist) { minDist = d; closeIdx = i; }
        });
        seq.push(pool.splice(closeIdx, 1)[0]);
    }
    const merged = { id: Date.now()+'-m', waypoints: [], polyline: null, routeGeometry: [], isImportedGPX: false };
    systemTracks.forEach(t => { t.polyline && layerGroup.removeLayer(t.polyline); t.waypoints.forEach(w => layerGroup.removeLayer(w)); });
    for (let i = 0; i < seq.length; i++) {
        seq[i].waypoints.forEach(w => merged.waypoints.push(generateWaypointMarkerElement(w.getLatLng(), merged)));
        if (i === 0) { merged.routeGeometry.push(...seq[i].routeGeometry); }
        else {
            const start = merged.waypoints[merged.waypoints.length - seq[i].waypoints.length - 1].getLatLng();
            const end = merged.waypoints[merged.waypoints.length - seq[i].waypoints.length].getLatLng();
            const res = await fetchORSRoute([[start.lng, start.lat], [end.lng, end.lat]], stateRef.avoidHighways);
            if (res?.features?.length > 0) merged.routeGeometry.push(...res.features[0].geometry.coordinates.map(c => [c[1], c[0]]));
            merged.routeGeometry.push(...seq[i].routeGeometry);
        }
    }
    merged.polyline = L.polyline(merged.routeGeometry, { color: 'blue', weight: 4 }).addTo(layerGroup);
    systemTracks.length = 0; systemTracks.push(merged); stateRef.updateUICallback(); handleViewPortBoundsMarkersPruning();
}
export function updateUserCurrentPositionBeaconMarker(latlng) {
    if (!map) return;
    if (userMarker) { userMarker.setLatLng(latlng); } 
    else { userMarker = L.marker(latlng, { icon: L.divIcon({ className: 'user-location-marker', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(layerGroup); }
    map.setView(latlng, 15);
}
export function eraseAllActiveMappingLayers() { layerGroup.clearLayers(); userMarker = null; systemTracks.length = 0; stateRef.updateUICallback(); }
