let map = null;
let locationMarker = null; 
let trackPolylines = [];   

export function initializeLeafletMapInstance(elementId, globalState, onReRoute, onDeletePrompt) {
    map = L.map(elementId, { zoomControl: false }).setView([64.9146, 26.0672], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Pakotetaan Zoom-kontrolli puhtaasti oikeaan yläkulmaan vaatimusten mukaisesti
    L.control.zoom({ position: 'topright' }).addTo(map);

    map.on('moveend zoomend', () => {
        handleDynamicWaypointPruning(globalState);
    });

    map._onReRoute = onReRoute;
    map._onDeletePrompt = onDeletePrompt;

    return map;
}

export function renderGPXLocationPulseMarker(lat, lon) {
    if (!map) return;
    const latlng = L.latLng(lat, lon);

    const pulseIcon = L.divIcon({
        className: 'gps-pulse-wrapper',
        html: '<div class="gps-pulse-ring"></div><div class="gps-pulse-core"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12] 
    });

    if (locationMarker) {
        locationMarker.setLatLng(latlng);
    } else {
        locationMarker = L.marker(latlng, { icon: pulseIcon }).addTo(map);
        map.setView(latlng, 14);
    }
}

export function renderAllMapLayersAndTracks(globalState) {
    if (!map || !globalState) return;

    trackPolylines.forEach(polyline => map.removeLayer(polyline));
    trackPolylines = [];

    globalState.tracks.forEach((track, trackIdx) => {
        if (track.routeGeometry && track.routeGeometry.length > 0) {
            const polyline = L.polyline(track.routeGeometry, {
                color: track.isImportedGPX ? '#28a745' : '#007bff', 
                weight: 5,
                opacity: 0.75
            }).addTo(map);

            trackPolylines.push(polyline);
        }

        track.waypoints.forEach((wp, wpIdx) => {
            wp.off('dragend');
            wp.on('dragend', () => {
                if (map._onReRoute) map._onReRoute(trackIdx, wpIdx, wp.getLatLng());
            });
            wp.off('click');
            wp.on('click', () => {
                if (map._onDeletePrompt) map._onDeletePrompt(trackIdx, wpIdx);
            });
        });
    });

    handleDynamicWaypointPruning(globalState);
}

export function createInteractiveWaypointMarker(latlng, trackIndex, wpIndex) {
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

    marker.on('dragend', () => {
        if (map._onReRoute) map._onReRoute(trackIndex, wpIndex, marker.getLatLng());
    });

    marker.on('click', () => {
        if (map._onDeletePrompt) map._onDeletePrompt(trackIndex, wpIndex);
    });

    return marker;
}

export function calculateTrackGeometryTotalDistance(routeGeometry) {
    if (!routeGeometry || routeGeometry.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < routeGeometry.length - 1; i++) {
        const p1 = L.latLng(routeGeometry[i][0], routeGeometry[i][1]);
        const p2 = L.latLng(routeGeometry[i+1][0], routeGeometry[i+1][1]);
        dist += p1.distanceTo(p2);
    }
    return dist / 1000; 
}

function handleDynamicWaypointPruning(globalState) {
    if (!map || !globalState || !globalState.tracks) return;
    
    const bounds = map.getBounds();
    const currentZoom = map.getZoom();
    const hasBounds = bounds && typeof bounds.contains === 'function';

    globalState.tracks.forEach((track) => {
        const totalWps = track.waypoints.length;
        
        let maxVisibleMarkers = 10; // Kaukana: Max 6-10 markeria dynaamisesti
        if (currentZoom >= 16) maxVisibleMarkers = 40; // Lähellä: jopa 40 markerikarsinta tuettu tarkkaan editointiin
        else if (currentZoom >= 12) maxVisibleMarkers = 20;

        const skipFactor = Math.ceil(totalWps / maxVisibleMarkers);

        track.waypoints.forEach((wp, wpIdx) => {
            if (wp.isNewPoint) {
                if (!map.hasLayer(wp)) wp.addTo(map);
                return;
            }

            if (!hasBounds) {
                if (!map.hasLayer(wp)) wp.addTo(map);
                return;
            }

            const isEdgePoint = (wpIdx === 0 || wpIdx === totalWps - 1);
            // Säännönmukaisesti vaatimus: Näytä aina vähintään yksi piste näkymän ulkopuolelta ennen alkua ja lopun jälkeen
            const isBufferPoint = (wpIdx === 1 || wpIdx === totalWps - 2);
            const isSampled = (wpIdx % skipFactor === 0);
            const isInBounds = bounds.contains(wp.getLatLng());

            if (isEdgePoint || isBufferPoint || (isSampled && isInBounds)) {
                if (!map.hasLayer(wp)) wp.addTo(map);
            } else {
                if (map.hasLayer(wp)) wp.removeLayer(wp);
            }
        });
    });
}
