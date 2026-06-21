import { t } from './i18n.js';
import { checkBackendStatus, fetchORSRoute, searchAddressGeocode } from './api.js';
import { simplifyPointsDouglasPeucker } from './utils.js';
import { parseGPXToCoordinates, exportTracksToGPXFile } from './gpx.js';
import { 
    initializeLeafletMapInstance, 
    renderAllMapLayersAndTracks, 
    createInteractiveWaypointMarker, 
    calculateTrackGeometryTotalDistance,
    renderGPXLocationPulseMarker,
    handleDynamicWaypointPruning,
    bindDynamicMarkerEvents
} from './map.js';

// Keskitetty sovelluksen tila
const globalState = {
    readOnlyMode: false,
    tracks: [],
    lastActionWasImport: false,
    lastActionWasMerge: false,
    nextWaypointId: 1
};

let mapInstance = null;
let activeModalTarget = null;
let geocodeDebounceTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.title = t('title');
    translateDOM();
    setupApplicationUIEventListeners();

    // Alustetaan karttainstanssi
    mapInstance = initializeLeafletMapInstance('map', globalState, handleWaypointPositionReRouting, promptWaypointDeletionModal);

    const isBackendAlive = await checkBackendStatus();
    if (!isBackendAlive) {
        globalState.readOnlyMode = true;
        const bar = document.getElementById('info-bar');
        if (bar) {
            bar.textContent = t('readOnlyMode');
            bar.classList.remove('hidden');
        }
    }

    // Karttaklikkausten hallinta
    mapInstance.on('click', (e) => {
        if (globalState.readOnlyMode) return;
        
        let targetTrackIndex = globalState.tracks.length - 1;
        
        if (globalState.tracks.length === 0 || globalState.lastActionWasImport || globalState.lastActionWasMerge) {
            globalState.tracks.push({ waypoints: [], routeGeometry: [], isImportedGPX: false });
            targetTrackIndex = globalState.tracks.length - 1;
            globalState.lastActionWasImport = false; 
            globalState.lastActionWasMerge = false;
        }

        const currentTrack = globalState.tracks[targetTrackIndex];

        // Luodaan markeri ja asetetaan sille dynaaminen vakaa ID
        const newMarker = createInteractiveWaypointMarker(e.latlng);
        newMarker.wpId = globalState.nextWaypointId++;
        
        newMarker.addTo(mapInstance);
        currentTrack.waypoints.push(newMarker);
        
        // Sidotaan kuuntelijat välittömästi ennen reititystä
        bindDynamicMarkerEvents(newMarker, globalState);
        
        computeTrackRoutingPathIntersection(currentTrack);

        setTimeout(() => { 
            newMarker.isNewPoint = false; 
            handleDynamicWaypointPruning(globalState);
        }, 800);
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => { renderGPXLocationPulseMarker(pos.coords.latitude, pos.coords.longitude); },
            (err) => console.warn("Geolocation lookup skipped.", err),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
});

/**
 * Laskee tai hakee reittigeometrian uran pisteiden välille
 */
async function computeTrackRoutingPathIntersection(track) {
    if (!track || track.waypoints.length === 0) {
        track.routeGeometry = [];
        finalizeTrackRefreshSequence();
        return;
    }
    
    const getCoordsSafe = (wp) => {
        const loc = wp.getLatLng ? wp.getLatLng() : wp._latlng;
        return loc && typeof loc.lng === 'number' && typeof loc.lat === 'number' ? [loc.lng, loc.lat] : null;
    };

    if (track.waypoints.length === 1) {
        const c = getCoordsSafe(track.waypoints[0]);
        track.routeGeometry = c ? [[c[1], c[0]]] : [];
        finalizeTrackRefreshSequence();
        return;
    }

    const coords = track.waypoints.map(w => getCoordsSafe(w)).filter(c => c !== null);
    if (coords.length < 2) {
        finalizeTrackRefreshSequence();
        return;
    }

    try {
        const geoData = await fetchORSRoute(coords);

        if (geoData && geoData.features && geoData.features.length > 0) {
            let rawCoords = geoData.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
            track.routeGeometry = simplifyPointsDouglasPeucker(rawCoords, 0.0001);
        } else {
            // VIKASIETOISUUS FALLBACK: Jos rajapinta palauttaa tyhjää, piirretään suora viiva
            track.routeGeometry = coords.map(c => [c[1], c[0]]);
        }
    } catch (err) {
        console.error("Routing API call failed, drawing straight line fallback paths", err);
        // VIKASIETOISUUS FALLBACK: Estetään sovelluksen kaatuminen verkkohäiriöissä
        track.routeGeometry = coords.map(c => [c[1], c[0]]);
    }
    
    finalizeTrackRefreshSequence();
}

/**
 * Käsittelee reittipisteen dynaamisen sijaintimuutoksen täysin race condition -suojatusti
 */
function handleWaypointPositionReRouting(trackIndex, wpIndex, newLatLng) {
    let actualTrack = null;
    let targetWaypoint = null;

    // Haetaan triggeröity markeri dynaamisen ID:n perusteella taulukkoviittausten sijaan
    const triggerMarker = globalState.tracks[trackIndex]?.waypoints[wpIndex];

    if (triggerMarker && typeof triggerMarker.wpId !== 'undefined') {
        for (let i = 0; i < globalState.tracks.length; i++) {
            const foundWp = globalState.tracks[i].waypoints.find(wp => wp.wpId === triggerMarker.wpId);
            if (foundWp) {
                actualTrack = globalState.tracks[i];
                targetWaypoint = foundWp;
                break;
            }
        }
    }

    // Varajärjestelmä (Fallback) jos ID puuttuu jostain syystä
    if (!actualTrack) {
        actualTrack = globalState.tracks[trackIndex];
        if (actualTrack) targetWaypoint = actualTrack.waypoints[wpIndex];
    }

    // Päivitetään uusi sijainti dataan ennen uutta reitityslaskentaa
    if (targetWaypoint) {
        if (targetWaypoint.setLatLng) targetWaypoint.setLatLng(newLatLng);
        else targetWaypoint._latlng = newLatLng;
    }

    if (actualTrack) {
        computeTrackRoutingPathIntersection(actualTrack);
    }
}

/**
 * Yhdistää kaikki urat saumattomasti ja laskee niiden väliset puuttuvat reitit (gaps)
 */
async function executeGlobalTracksMergingSequence() {
    if (globalState.tracks.length < 2) return;

    // Siivotaan dynaamiset markerit kartalta ennen yhdistämistä sekaannusten välttämiseksi
    globalState.tracks.forEach(track => {
        track.waypoints.forEach(wp => {
            if (mapInstance.hasLayer(wp)) mapInstance.removeLayer(wp);
        });
    });

    let mergedWaypoints = [];
    let mergedGeometry = [];

    for (let i = 0; i < globalState.tracks.length; i++) {
        const currentTrack = globalState.tracks[i];
        
        // Jos urien välillä on tyhjä väli, haetaan siihen dynaaminen sillanrakennusreitti ORS:sta
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
                console.warn("Failed to stitch track gap smoothly, using straight line connector", err);
                mergedGeometry.push([lastWp.lat, lastWp.lng], [nextWp.lat, nextWp.lng]);
            }
        }

        mergedWaypoints.push(...currentTrack.waypoints);
        mergedGeometry.push(...currentTrack.routeGeometry);
    }

    // Nollataan vanhat tapahtumakuuntelijat ja pakotetaan dynaaminen uusi sidonta
    mergedWaypoints.forEach((wp) => {
        wp.off('dragend');
        wp.off('click');
        wp.isNewPoint = false; 
    });

    // Päivitetään tila sisältämään vain yksi yhtenäinen ura
    globalState.tracks = [{ waypoints: mergedWaypoints, routeGeometry: mergedGeometry, isImportedGPX: false }];
    globalState.lastActionWasImport = false;
    globalState.lastActionWasMerge = true;
    
    finalizeTrackRefreshSequence();
    mapInstance.fire('moveend');
}

function finalizeTrackRefreshSequence() {
    renderAllMapLayersAndTracks(globalState);
    updateBottomWidgetTracklistUI();
    evaluateVisibilityOfDynamicButtons();
}

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
    }

    const widget = document.getElementById('info-widget');
    if (widget) {
        const handle = widget.querySelector('.widget-handle');
        if (handle) {
            handle.addEventListener('click', () => {
                if (window.innerWidth <= 768) widget.classList.toggle('expanded');
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
            globalState.tracks.forEach(track => {
                track.waypoints.forEach(wp => { if (mapInstance.hasLayer(wp)) mapInstance.removeLayer(wp); });
            });
            globalState.tracks = [];
            globalState.lastActionWasImport = false;
            globalState.lastActionWasMerge = false;
            finalizeTrackRefreshSequence();
        });
    }

    document.getElementById('modal-btn-no').addEventListener('click', () => {
        document.getElementById('confirm-modal').classList.add('hidden');
        activeModalTarget = null;
    });

    document.getElementById('modal-btn-yes').addEventListener('click', executeConfirmedWaypointDeletion);

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
            if (globalState.tracks.length === 0 || globalState.lastActionWasImport || globalState.lastActionWasMerge) {
                globalState.tracks.push({ waypoints: [], routeGeometry: [], isImportedGPX: false });
                targetTrackIndex = globalState.tracks.length - 1;
                globalState.lastActionWasImport = false;
                globalState.lastActionWasMerge = false;
            }

            const latlng = L.latLng(lat, lon);
            const currentTrack = globalState.tracks[targetTrackIndex];

            const newMarker = createInteractiveWaypointMarker(latlng);
            newMarker.wpId = globalState.nextWaypointId++;
            
            newMarker.addTo(mapInstance);
            currentTrack.waypoints.push(newMarker);
            
            bindDynamicMarkerEvents(newMarker, globalState);
            computeTrackRoutingPathIntersection(currentTrack);
            
            mapInstance.setView(latlng, mapInstance.getZoom());

            container.classList.add('hidden');
            document.getElementById('address-search').value = '';

            setTimeout(() => {
                newMarker.isNewPoint = false;
                handleDynamicWaypointPruning(globalState);
            }, 800);
        });
        container.appendChild(div);
    });
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

function promptWaypointDeletionModal(trackIndex, wpIndex) {
    if (globalState.readOnlyMode) return;
    activeModalTarget = { trackIndex, wpIndex };
    document.getElementById('modal-text').textContent = t('confirmDeletePoint');
    document.getElementById('confirm-modal').classList.remove('hidden');
}

async function executeConfirmedWaypointDeletion() {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (!activeModalTarget) return;

    const { trackIndex, wpIndex } = activeModalTarget;
    const track = globalState.tracks[trackIndex];
    if (!track) return;

    const isEdgePointDeletion = (wpIndex === 0 || wpIndex === track.waypoints.length - 1);
    
    if (track.isImportedGPX && isEdgePointDeletion) {
        if (mapInstance.hasLayer(track.waypoints[wpIndex])) {
            mapInstance.removeLayer(track.waypoints[wpIndex]);
        }
        
        if (wpIndex === 0) {
            track.waypoints.shift();
            if (track.routeGeometry.length > 1) track.routeGeometry.shift();
        } else {
            track.waypoints.pop();
            if (track.routeGeometry.length > 1) track.routeGeometry.pop();
        }
        finalizeTrackRefreshSequence();
    } else {
        if (mapInstance.hasLayer(track.waypoints[wpIndex])) {
            mapInstance.removeLayer(track.waypoints[wpIndex]);
        }
        
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
            
            const currentTrackIdx = globalState.tracks.length;
            const wps = simplified.map((pt) => {
                const marker = createInteractiveWaypointMarker(L.latLng(pt[0], pt[1]));
                marker.wpId = globalState.nextWaypointId++;
                marker.isNewPoint = false; 
                return marker;
            });

            globalState.tracks.push({ waypoints: wps, routeGeometry: rawCoords, isImportedGPX: true });
            globalState.lastActionWasImport = true; 
            globalState.lastActionWasMerge = false;
            finalizeTrackRefreshSequence();
        };
        reader.readAsText(file);
    });
    e.target.value = '';
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
