import { t } from './i18n.js';
import { checkBackendStatus, fetchORSRoute, searchAddressGeocode } from './api.js';
import { simplifyPointsDouglasPeucker } from './utils.js';
import { parseGPXToCoordinates, exportTracksToGPXFile } from './gpx.js';
import { 
    initializeLeafletMapInstance, 
    renderAllMapLayersAndTracks, 
    createInteractiveWaypointMarker, 
    calculateTrackGeometryTotalDistance,
    renderGPXLocationPulseMarker 
} from './map.js';

const globalState = {
    readOnlyMode: false,
    tracks: [] 
};

let mapInstance = null;
let activeModalTarget = null;
let geocodeDebounceTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    translateDOM();
    setupApplicationUIEventListeners();

    const isBackendAlive = await checkBackendStatus();
    if (!isBackendAlive) {
        globalState.readOnlyMode = true;
        const bar = document.getElementById('info-bar');
        if (bar) {
            bar.textContent = t('readOnlyMode');
            bar.classList.remove('hidden');
        }
    }

    mapInstance = initializeLeafletMapInstance('map', globalState, handleWaypointPositionReRouting, promptWaypointDeletionModal);

    mapInstance.on('click', (e) => {
        if (globalState.readOnlyMode) return;
        
        let targetTrackIndex = globalState.tracks.length - 1;
        if (globalState.tracks.length === 0 || globalState.tracks[targetTrackIndex].isImportedGPX) {
            globalState.tracks.push({
                waypoints: [],
                routeGeometry: [],
                isImportedGPX: false
            });
            targetTrackIndex = globalState.tracks.length - 1;
        }

        const newMarker = createInteractiveWaypointMarker(e.latlng);
        globalState.tracks[targetTrackIndex].waypoints.push(newMarker);
        computeTrackRoutingPathIntersection(globalState.tracks[targetTrackIndex]);
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                renderGPXLocationPulseMarker(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => console.log("Geolocation identity denied or timeout.", err),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
});

function translateDOM() {
    const el = (id) => document.getElementById(id);
    if (el('sidebar-title')) el('sidebar-title').textContent = t('sidebarTitle');
    if (el('search-label')) el('search-label').textContent = t('searchLabel');
    if (el('btn-gpx-import-trigger')) el('btn-gpx-import-trigger').textContent = t('btnGpxImport');
    if (el('btn-merge-tracks')) el('btn-merge-tracks').textContent = t('btnMergeTracks');
    if (el('btn-gpx-export')) el('btn-gpx-export').textContent = t('btnGpxExport');
    if (el('btn-clear-all')) el('btn-clear-all').textContent = t('btnClearAll');
    if (el('widget-title')) el('widget-title').textContent = t('widgetTitle');
    if (el('modal-btn-yes')) el('modal-btn-yes').textContent = t('btnYes');
    if (el('modal-btn-no')) el('modal-btn-no').textContent = t('btnNo');
    if (el('address-search')) el('address-search').placeholder = t('searchPlaceholder');
}

function setupApplicationUIEventListeners() {
    const sb = document.getElementById('sidebar');
    const ol = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('menu-toggle');
    
    if (toggle && sb && ol) {
        const toggleSb = () => { sb.classList.toggle('open'); ol.classList.toggle('open'); };
        toggle.addEventListener('click', toggleSb);
        ol.addEventListener('click', toggleSb);
        L.DomEvent.disableClickPropagation(toggle);
    }

    const widget = document.getElementById('info-widget');
    if (widget) {
        const handle = widget.querySelector('.widget-handle');
        if (handle) {
            handle.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    widget.classList.toggle('expanded');
                }
            });
        }
        L.DomEvent.disableClickPropagation(widget);
        L.DomEvent.disableScrollPropagation(widget);
    }

    const btnGpxTrigger = document.getElementById('btn-gpx-import-trigger');
    const btnGpxInput = document.getElementById('btn-gpx-import');
    if (btnGpxTrigger && btnGpxInput) {
        btnGpxTrigger.addEventListener('click', () => btnGpxInput.click());
        btnGpxInput.addEventListener('change', handleBulkGPXImporting);
    }

    const btnMerge = document.getElementById('btn-merge-tracks');
    if (btnMerge) btnMerge.addEventListener('click', executeGlobalTracksMergingSequence);

    const btnExport = document.getElementById('btn-gpx-export');
    if (btnExport) btnExport.addEventListener('click', () => exportTracksToGPXFile(globalState.tracks));
    
    const btnClear = document.getElementById('btn-clear-all');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            globalState.tracks = [];
            updateBottomWidgetTracklistUI();
            renderAllMapLayersAndTracks();
            evaluateVisibilityOfDynamicButtons();
        });
    }

    const btnNo = document.getElementById('modal-btn-no');
    if (btnNo) {
        btnNo.addEventListener('click', () => {
            document.getElementById('confirm-modal').classList.add('hidden');
            activeModalTarget = null;
        });
    }

    const btnYes = document.getElementById('modal-btn-yes');
    if (btnYes) btnYes.addEventListener('click', executeConfirmedWaypointDeletion);

    const searchInput = document.getElementById('address-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(geocodeDebounceTimeout);
            const query = e.target.value.trim();
            if (query.length < 3) {
                document.getElementById('search-results').classList.add('hidden');
                return;
            }
            geocodeDebounceTimeout = setTimeout(async () => {
                const results = await searchAddressGeocode(query);
                renderGeocodingResultsBox(results);
            }, 400);
        });
    }
}

function renderGeocodingResultsBox(results) {
    const container = document.getElementById('search-results');
    if (!container) return;
    container.innerHTML = '';
    if (!results || results.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    results.forEach(res => {
        const div = document.createElement('div');
        div.textContent = res.display_name;
        div.addEventListener('click', () => {
            const lat = parseFloat(res.lat);
            const lon = parseFloat(res.lon);
            
            let targetTrackIndex = globalState.tracks.length - 1;
            if (globalState.tracks.length === 0 || globalState.tracks[targetTrackIndex].isImportedGPX) {
                globalState.tracks.push({ waypoints: [], routeGeometry: [], isImportedGPX: false });
                targetTrackIndex = globalState.tracks.length - 1;
            }

            const latlng = L.latLng(lat, lon);
            const newMarker = createInteractiveWaypointMarker(latlng);
            globalState.tracks[targetTrackIndex].waypoints.push(newMarker);
            
            computeTrackRoutingPathIntersection(globalState.tracks[targetTrackIndex]);
            mapInstance.setView(latlng, mapInstance.getZoom());

            container.classList.add('hidden');
            const inp = document.getElementById('address-search');
            if (inp) inp.value = '';
        });
        container.appendChild(div);
    });
}

async function computeTrackRoutingPathIntersection(track) {
    if (!track || track.waypoints.length === 0) {
        track.routeGeometry = [];
        finalizeTrackRefreshSequence();
        return;
    }
    if (track.waypoints.length === 1) {
        const pt = track.waypoints[0].getLatLng();
        track.routeGeometry = [[pt.lat, pt.lng]];
        finalizeTrackRefreshSequence();
        return;
    }

    try {
        const coords = track.waypoints.map(w => [w.getLatLng().lng, w.getLatLng().lat]);
        const geoData = await fetchORSRoute(coords);

        if (geoData && geoData.features && geoData.features.length > 0) {
            let rawCoords = geoData.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
            track.routeGeometry = simplifyPointsDouglasPeucker(rawCoords, 0.0001);
        } else {
            // Varma fallback: jos API ei vastaa tai epäonnistuu, piirretään suora viiva pisteiden välille
            track.routeGeometry = track.waypoints.map(w => [w.getLatLng().lat, w.getLatLng().lng]);
        }
    } catch (err) {
        console.error("Virhe reitin laskennassa, käytetään suoria viivoja:", err);
        track.routeGeometry = track.waypoints.map(w => [w.getLatLng().lat, w.getLatLng().lng]);
    }
    
    finalizeTrackRefreshSequence();
}

function finalizeTrackRefreshSequence() {
    renderAllMapLayersAndTracks();
    updateBottomWidgetTracklistUI();
    evaluateVisibilityOfDynamicButtons();
}

function evaluateVisibilityOfDynamicButtons() {
    const mergeBtn = document.getElementById('btn-merge-tracks');
    const exportBtn = document.getElementById('btn-gpx-export');

    if (mergeBtn) {
        if (globalState.tracks.length >= 2) mergeBtn.classList.remove('hidden');
        else mergeBtn.classList.add('hidden');
    }

    if (exportBtn) {
        if (globalState.tracks.some(t => t.routeGeometry && t.routeGeometry.length > 0)) exportBtn.classList.remove('hidden');
        else exportBtn.classList.add('hidden');
    }
}

function handleWaypointPositionReRouting(trackIndex, wpIndex, newLatLng) {
    if (globalState.tracks[trackIndex]) {
        const track = globalState.tracks[trackIndex];
        if (track.waypoints[wpIndex]) {
            track.waypoints[wpIndex].setLatLng(newLatLng);
            computeTrackRoutingPathIntersection(track);
        }
    }
}

function promptWaypointDeletionModal(trackIndex, wpIndex) {
    if (globalState.readOnlyMode) return;
    activeModalTarget = { trackIndex, wpIndex };
    const txt = document.getElementById('modal-text');
    if (txt) txt.textContent = t('confirmDeletePoint');
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('hidden');
}

async function executeConfirmedWaypointDeletion() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    if (!activeModalTarget) return;

    const { trackIndex, wpIndex } = activeModalTarget;
    const track = globalState.tracks[trackIndex];
    if (!track) return;

    if (track.isImportedGPX && (wpIndex === 0 || wpIndex === track.waypoints.length - 1)) {
        if (wpIndex === 0) {
            track.waypoints.shift();
            if (track.routeGeometry.length > 1) {
                track.routeGeometry.shift();
            }
        } else {
            track.waypoints.pop();
            if (track.routeGeometry.length > 1) {
                track.routeGeometry.pop();
            }
        }
        finalizeTrackRefreshSequence();
    } else {
        track.waypoints.splice(wpIndex, 1);
        if (track.waypoints.length === 0) {
            globalState.tracks.splice(trackIndex, 1);
            finalizeTrackRefreshSequence();
        } else {
            await computeTrackRoutingPathIntersection(track);
        }
    }
    activeModalTarget = null;
}

function handleBulkGPXImporting(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const rawCoords = parseGPXToCoordinates(evt.target.result);
            if (rawCoords.length === 0) return;

            const simplified = simplifyPointsDouglasPeucker(rawCoords, 0.0005);
            const wps = simplified.map(pt => createInteractiveWaypointMarker(L.latLng(pt[0], pt[1])));

            globalState.tracks.push({
                waypoints: wps,
                routeGeometry: rawCoords, 
                isImportedGPX: true
            });
            finalizeTrackRefreshSequence();
        };
        reader.readAsText(file);
    });
    e.target.value = '';
}

async function executeGlobalTracksMergingSequence() {
    if (globalState.tracks.length < 2) return;

    let mergedWaypoints = [];
    let mergedGeometry = [];

    for (let i = 0; i < globalState.tracks.length; i++) {
        const currentTrack = globalState.tracks[i];
        
        if (mergedWaypoints.length > 0 && currentTrack.waypoints.length > 0) {
            const lastWp = mergedWaypoints[mergedWaypoints.length - 1].getLatLng();
            const nextWp = currentTrack.waypoints[0].getLatLng();
            
            const gapCoords = [[lastWp.lng, lastWp.lat], [nextWp.lng, nextWp.lat]];
            try {
                const gapGeoData = await fetchORSRoute(gapCoords);
                if (gapGeoData && gapGeoData.features && gapGeoData.features.length > 0) {
                    const intermediatePoints = gapGeoData.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    mergedGeometry.push(...intermediatePoints);
                }
            } catch (err) {
                console.log("Kuilun reititys urien välillä epäonnistui, yhdistetään suoralla.");
            }
        }

        mergedWaypoints.push(...currentTrack.waypoints);
        mergedGeometry.push(...currentTrack.routeGeometry);
    }

    globalState.tracks = [{
        waypoints: mergedWaypoints,
        routeGeometry: mergedGeometry,
        isImportedGPX: false
    }];

    finalizeTrackRefreshSequence();
}

function updateBottomWidgetTracklistUI() {
    const statsContainer = document.getElementById('route-stats');
    const listContainer = document.getElementById('route-list');
    if (!listContainer || !statsContainer) return;
    listContainer.innerHTML = '';

    if (globalState.tracks.length === 0) {
        statsContainer.textContent = t('widgetNoRoutes');
        return;
    }

    let totalDist = 0;
    globalState.tracks.forEach((track, idx) => {
        const d = calculateTrackGeometryTotalDistance(track.routeGeometry);
        totalDist += d;

        const li = document.createElement('li');
        li.textContent = t('trackInfo', {
            index: idx + 1,
            points: track.waypoints.length,
            dist: d.toFixed(2)
        });
        listContainer.appendChild(li);
    });

    statsContainer.textContent = t('widgetStats', { dist: totalDist.toFixed(2) });
}
