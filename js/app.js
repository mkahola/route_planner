import { t } from './i18n.js';
import { checkBackendStatus, fetchORSRoute, searchAddressNominatim } from './api.js';
import { 
    initMap, 
    createInteractiveWaypointMarker, 
    bindDynamicMarkerEvents, 
    updateMarkerVisibility, 
    renderRoutePolylines, 
    setUserLocationMarker 
} from './map.js';
import { calculateTotalDistance } from './utils.js';
import { parseGPX, reduceGPXToWaypoints, exportGPX } from './gpx.js';

const state = {
    isReadOnly: false,
    nextWaypointId: 1,
    hasImportedGPX: false,
    tracks: []
};

let mapInstance = null;
let pendingDeleteTarget = null;

const el = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    mapInstance = initMap();

    const isBackendOnline = await checkBackendStatus();
    if (!isBackendOnline) {
        state.isReadOnly = true;
        el('readonly-bar').classList.remove('hidden');
        el('readonly-text').textContent = t('readOnlyMode');
    }

    translateDOM();
    setupEventListeners();
    initGeolocation();

    mapInstance._onReRoute = handleReRouteWaypoint;
    mapInstance._onDeletePrompt = (trackIdx, wpIdx) => {
        pendingDeleteTarget = { trackIdx, wpIdx };
        el('delete-modal').classList.remove('hidden');
    };
});

function translateDOM() {
    if (el('page-title')) el('page-title').textContent = t('title');
    if (el('sidebar-title')) el('sidebar-title').textContent = t('sidebarTitle');
    if (el('search-label')) el('search-label').textContent = t('searchLabel');
    if (el('address-search')) el('address-search').placeholder = t('searchPlaceholder');
    if (el('btn-gpx-import-trigger')) el('btn-gpx-import-trigger').textContent = t('btnGpxImport');
    if (el('btn-merge-tracks')) el('btn-merge-tracks').textContent = t('btnMergeTracks');
    if (el('btn-gpx-export')) el('btn-gpx-export').textContent = t('btnGpxExport');
    if (el('btn-clear-all')) el('btn-clear-all').textContent = t('btnClearAll');
    if (el('contact-title')) el('contact-title').textContent = t('contactTitle', 'Contact');
    if (el('widget-title')) el('widget-title').textContent = t('widgetTitle');
    if (el('widget-no-routes')) el('widget-no-routes').textContent = t('widgetNoRoutes');
    if (el('modal-delete-text')) el('modal-delete-text').textContent = t('confirmDeletePoint');
    if (el('modal-btn-confirm')) el('modal-btn-confirm').textContent = t('btnYes');
    if (el('modal-btn-cancel')) el('modal-btn-cancel').textContent = t('btnNo');
}

function setupEventListeners() {
    el('sidebar-toggle').addEventListener('click', toggleSidebar);
    el('sidebar-close').addEventListener('click', toggleSidebar);
    el('sidebar-overlay').addEventListener('click', toggleSidebar);

    const widgetHeader = el('info-widget-header');
    widgetHeader.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            el('info-widget').classList.toggle('expanded');
        }
    });

    const widgetEl = el('info-widget');
    L.DomEvent.disableClickPropagation(widgetEl);
    L.DomEvent.disableScrollPropagation(widgetEl);

    mapInstance.on('click', async (e) => {
        if (state.isReadOnly) return;
        await addNewMapWaypoint(e.latlng);
    });

    mapInstance.on('moveend', () => updateMarkerVisibility(state));
    mapInstance.on('zoomend', () => updateMarkerVisibility(state));

    let searchDebounce = null;
    el('address-search').addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        const query = e.target.value;
        if (query.trim().length < 3) {
            el('search-results').classList.add('hidden');
            return;
        }
        searchDebounce = setTimeout(async () => {
            const results = await searchAddressNominatim(query);
            renderSearchResults(results);
        }, 350);
    });

    el('btn-gpx-import-trigger').addEventListener('click', () => el('gpx-file-input').click());
    el('gpx-file-input').addEventListener('change', handleGPXFileUpload);

    el('btn-merge-tracks').addEventListener('click', handleMergeTracks);
    el('btn-gpx-export').addEventListener('click', () => exportGPX(state.tracks));
    el('btn-clear-all').addEventListener('click', handleClearAll);

    el('modal-btn-confirm').addEventListener('click', async () => {
        if (pendingDeleteTarget) {
            const { trackIdx, wpIdx } = pendingDeleteTarget;
            await handleDeleteWaypoint(trackIdx, wpIdx);
            pendingDeleteTarget = null;
        }
        el('delete-modal').classList.add('hidden');
    });

    el('modal-btn-cancel').addEventListener('click', () => {
        pendingDeleteTarget = null;
        el('delete-modal').classList.add('hidden');
    });
}

function toggleSidebar() {
    el('sidebar').classList.toggle('open');
    el('sidebar-overlay').classList.toggle('active');
}

function initGeolocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                setUserLocationMarker(latlng);
            },
            (err) => console.log('Geolocation unavailable/denied:', err.message),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}

async function addNewMapWaypoint(latlng) {
    const marker = createInteractiveWaypointMarker(latlng);
    marker.wpId = state.nextWaypointId++;
    bindDynamicMarkerEvents(marker, state);

    if (state.hasImportedGPX || state.tracks.length === 0) {
        state.hasImportedGPX = false;
        const newTrack = {
            trackId: Date.now(),
            waypoints: [{ wpId: marker.wpId, latlng: latlng, marker: marker }],
            geometry: []
        };
        state.tracks.push(newTrack);
    } else {
        const currentTrack = state.tracks[state.tracks.length - 1];
        currentTrack.waypoints.push({ wpId: marker.wpId, latlng: latlng, marker: marker });
        await recalculateTrackGeometry(currentTrack);
    }

    updateUI();
}

async function handleReRouteWaypoint(trackIdx, wpIdx, newLatLng) {
    const track = state.tracks[trackIdx];
    if (!track) return;

    track.waypoints[wpIdx].latlng = newLatLng;
    await recalculateTrackGeometry(track);
    updateUI();
}

async function handleDeleteWaypoint(trackIdx, wpIdx) {
    const track = state.tracks[trackIdx];
    if (!track) return;

    const isStartOrEnd = (wpIdx === 0 || wpIdx === track.waypoints.length - 1);

    track.waypoints.splice(wpIdx, 1);

    if (track.waypoints.length < 2) {
        state.tracks.splice(trackIdx, 1);
    } else if (isStartOrEnd) {
        await recalculateTrackGeometry(track);
    } else {
        await recalculateTrackGeometry(track);
    }

    updateUI();
}

async function recalculateTrackGeometry(track) {
    if (track.waypoints.length < 2) {
        track.geometry = [];
        return;
    }

    const orsCoordinates = track.waypoints.map(wp => [wp.latlng.lng, wp.latlng.lat]);
    const routedGeometry = await fetchORSRoute(orsCoordinates);
    
    if (routedGeometry && routedGeometry.length > 0) {
        track.geometry = routedGeometry;
    } else {
        track.geometry = track.waypoints.map(wp => [wp.latlng.lat, wp.latlng.lng]);
    }
}

async function handleGPXFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        const rawTracks = parseGPX(text);

        for (const rawTrack of rawTracks) {
            const reducedWps = reduceGPXToWaypoints(rawTrack);
            const trackWaypoints = [];

            reducedWps.forEach(pt => {
                const latlng = L.latLng(pt[0], pt[1]);
                const marker = createInteractiveWaypointMarker(latlng);
                marker.wpId = state.nextWaypointId++;
                bindDynamicMarkerEvents(marker, state);
                trackWaypoints.push({ wpId: marker.wpId, latlng: latlng, marker: marker });
            });

            const newTrack = {
                trackId: Date.now() + Math.random(),
                waypoints: trackWaypoints,
                geometry: rawTrack
            };

            state.tracks.push(newTrack);
        }
    }

    state.hasImportedGPX = true;
    el('gpx-file-input').value = '';
    updateUI();
}

async function handleMergeTracks() {
    if (state.tracks.length < 2) return;

    const mergedWaypoints = [];
    state.tracks.forEach(tr => {
        mergedWaypoints.push(...tr.waypoints);
    });

    const mergedTrack = {
        trackId: Date.now(),
        waypoints: mergedWaypoints,
        geometry: []
    };

    await recalculateTrackGeometry(mergedTrack);

    state.tracks = [mergedTrack];
    state.hasImportedGPX = true;
    updateUI();
}

function handleClearAll() {
    state.tracks = [];
    state.hasImportedGPX = false;
    updateUI();
}

function renderSearchResults(results) {
    const listEl = el('search-results');
    listEl.innerHTML = '';

    if (results.length === 0) {
        listEl.classList.add('hidden');
        return;
    }

    results.forEach(res => {
        const li = document.createElement('li');
        li.textContent = res.display_name;
        li.addEventListener('click', async () => {
            const latlng = L.latLng(parseFloat(res.lat), parseFloat(res.lon));
            listEl.classList.add('hidden');
            el('address-search').value = res.display_name;
            await addNewMapWaypoint(latlng);
        });
        listEl.appendChild(li);
    });

    listEl.classList.remove('hidden');
}

function updateUI() {
    renderRoutePolylines(state);
    updateMarkerVisibility(state);

    if (state.tracks.length >= 2) {
        el('btn-merge-tracks').classList.remove('hidden');
    } else {
        el('btn-merge-tracks').classList.add('hidden');
    }

    if (state.tracks.length > 0) {
        el('btn-gpx-export').classList.remove('hidden');
        el('widget-no-routes').classList.add('hidden');
    } else {
        el('btn-gpx-export').classList.add('hidden');
        el('widget-no-routes').classList.remove('hidden');
    }

    let totalKm = 0;
    const listContainer = el('route-tracks-list');
    listContainer.innerHTML = '';

    state.tracks.forEach((tr, idx) => {
        const trackKm = calculateTotalDistance(tr.geometry);
        totalKm += trackKm;

        const li = document.createElement('li');
        li.textContent = t('trackInfo', {
            index: idx + 1,
            points: tr.waypoints.length,
            dist: trackKm.toFixed(2)
        });
        listContainer.appendChild(li);
    });

    el('widget-stats').textContent = t('widgetStats', { dist: totalKm.toFixed(2) });
}
