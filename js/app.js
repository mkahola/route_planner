import { t } from './i18n.js';
import { checkBackendStatus, searchAddressGeocode } from './api.js';
import { parseGPXToCoordinates, exportTracksToGPXFile } from './gpx.js';
import { initializeLeafletMapInstance, synchroniseTracksDataReference, generateWaypointMarkerElement, mergeIndependentTracksOnMap, updateUserCurrentPositionBeaconMarker, eraseAllActiveMappingLayers } from './map.js';
import { calculateHaversineDistance } from './utils.js';

const globalState = { tracks: [], avoidHighways: false, readOnlyMode: false, updateUICallback: renderUserInterfaceUpdateLoop, openConfirmationModalCallback: triggerConfirmationPromptDialog };
let mapRef = null, modalCallback = null, debounceTimer = null;

function translateDOM() {
    document.getElementById('app-title').textContent = t('appTitle'); document.getElementById('sidebar-title').textContent = t('sidebarTitle');
    document.getElementById('search-label').textContent = t('searchLabel'); document.getElementById('label-avoid-highways').textContent = t('labelAvoidHighways');
    document.getElementById('btn-gpx-import-trigger').textContent = t('btnGpxImport'); document.getElementById('btn-merge-tracks').textContent = t('btnMergeTracks');
    document.getElementById('btn-gpx-export').textContent = t('btnGpxExport'); document.getElementById('btn-clear-all').textContent = t('btnClearAll');
    document.getElementById('widget-title').textContent = t('widgetTitle'); document.getElementById('modal-btn-yes').textContent = t('btnYes');
    document.getElementById('modal-btn-no').textContent = t('btnNo'); document.getElementById('address-search').placeholder = t('searchPlaceholder');
}
async function checkHealth() {
    const ok = await checkBackendStatus(); const bar = document.getElementById('info-bar');
    globalState.readOnlyMode = !ok;
    ok ? bar.classList.add('hidden') : (bar.textContent = t('readOnlyMode'), bar.classList.remove('hidden'));
}
function renderUserInterfaceUpdateLoop() {
    let tot = 0; const stats = document.getElementById('route-stats'), logs = document.getElementById('route-summary-list');
    logs.innerHTML = '';
    if (!globalState.tracks.length) { stats.textContent = t('widgetNoRoutes'); document.getElementById('btn-gpx-export').classList.add('hidden'); document.getElementById('btn-merge-tracks').classList.add('hidden'); return; }
    globalState.tracks.forEach((track, i) => {
        let d = 0; if (track.routeGeometry?.length > 1) { for (let j=0; j<track.routeGeometry.length-1; j++) d += calculateHaversineDistance(track.routeGeometry[j], track.routeGeometry[j+1]); }
        tot += d;
        const item = document.createElement('div'); item.className = 'route-summary-item';
        item.textContent = t('trackInfo', { index: i + 1, points: track.waypoints.length, dist: d.toFixed(2) });
        logs.appendChild(item);
    });
    stats.textContent = t('widgetStats', { dist: tot.toFixed(2) });
    tot > 0 ? document.getElementById('btn-gpx-export').classList.remove('hidden') : document.getElementById('btn-gpx-export').classList.add('hidden');
    (globalState.tracks.length >= 2 && !globalState.readOnlyMode) ? document.getElementById('btn-merge-tracks').classList.remove('hidden') : document.getElementById('btn-merge-tracks').classList.add('hidden');
}
function triggerConfirmationPromptDialog(cb) { modalCallback = cb; document.getElementById('modal-text').textContent = t('confirmDeletePoint'); document.getElementById('confirm-modal').classList.remove('hidden'); }

function bindEvents() {
    const sb = document.getElementById('sidebar'), ol = document.getElementById('sidebar-overlay'), toggle = document.getElementById('menu-toggle');
    const toggleSb = () => { sb.classList.toggle('open'); ol.classList.toggle('open'); };
    toggle.addEventListener('click', toggleSb); ol.addEventListener('click', toggleSb);
    document.getElementById('avoid-highways').addEventListener('change', (e) => { globalState.avoidHighways = e.target.checked; });
    document.getElementById('modal-btn-yes').addEventListener('click', () => { modalCallback?.(); document.getElementById('confirm-modal').classList.add('hidden'); });
    document.getElementById('modal-btn-no').addEventListener('click', () => document.getElementById('confirm-modal').classList.add('hidden'));
    document.getElementById('btn-gpx-import-trigger').addEventListener('click', () => document.getElementById('gpx-import').click());
    document.getElementById('gpx-import').addEventListener('change', (e) => {
        Array.from(e.target.files || []).forEach(file => {
            const r = new FileReader(); r.onload = (ev) => {
                const coords = parseGPXToCoordinates(ev.target.result);
                if (coords.length) import('./map.js').then(m => { m.injectGPXCoordinateTrack(coords); renderUserInterfaceUpdateLoop(); });
            }; r.readAsText(file);
        }); e.target.value = '';
    });
    document.getElementById('btn-merge-tracks').addEventListener('click', mergeIndependentTracksOnMap);
    document.getElementById('btn-gpx-export').addEventListener('click', () => exportTracksToGPXFile(globalState.tracks.map(t=>t.routeGeometry)));
    document.getElementById('btn-clear-all').addEventListener('click', eraseAllActiveMappingLayers);
    
    const inp = document.getElementById('address-search'), resBox = document.getElementById('search-results');
    inp.addEventListener('input', (e) => {
        clearTimeout(debounceTimer); if (e.target.value.trim().length < 3) { resBox.classList.add('hidden'); return; }
        debounceTimer = setTimeout(async () => {
            const locs = await searchAddressGeocode(e.target.value);
            if (locs.length) {
                resBox.innerHTML = ''; resBox.classList.remove('hidden');
                locs.forEach(l => {
                    const d = document.createElement('div'); d.className = 'search-item'; d.textContent = l.display_name;
                    d.addEventListener('click', () => { handleMapClick({ latlng: L.latLng(parseFloat(l.lat), parseFloat(l.lon)) }); resBox.classList.add('hidden'); inp.value = ''; });
                    resBox.appendChild(d);
                });
            } else { resBox.classList.add('hidden'); }
        }, 400);
    });
    const widget = document.getElementById('info-widget');
    widget.querySelector('.widget-header').addEventListener('click', () => { if (window.innerWidth <= 768) widget.classList.toggle('expanded'); });
    L.DomEvent.disableClickPropagation(widget); L.DomEvent.disableScrollPropagation(widget);
}
async function handleMapClick(e) {
    if (globalState.readOnlyMode) return;
    let active = globalState.tracks[globalState.tracks.length - 1];
    if (!active || active.isImportedGPX) {
        active = { id: Math.random().toString(36).substr(2,5), waypoints: [], polyline: null, routeGeometry: [], isImportedGPX: false };
        globalState.tracks.push(active);
    }
    active.waypoints.push(generateWaypointMarkerElement(e.latlng, active));
    import('./map.js').then(m => m.handleViewPortBoundsMarkersPruning());
    renderUserInterfaceUpdateLoop();
}
document.addEventListener('DOMContentLoaded', async () => {
    translateDOM(); mapRef = initializeLeafletMapInstance('map', globalState);
    synchroniseTracksDataReference(globalState.tracks); bindEvents();
    if (!globalState.readOnlyMode) mapRef.on('click', handleMapClick);
    await checkHealth(); renderUserInterfaceUpdateLoop();
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => updateUserCurrentPositionBeaconMarker(L.latLng(p.coords.latitude, p.coords.longitude)), null, { timeout: 5000 });
});
