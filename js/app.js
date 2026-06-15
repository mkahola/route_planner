import { t } from './i18n.js';
import { checkWorkerStatus } from './api.js';
import { initMap, handleMapClick, handleRouteMerge, clearAllRoutes, setupMapEvents, locateUser } from './map.js';
import { handleGpxImport, handleGpxExport } from './gpx.js';

export const state = {
    isReadOnly: false,
    routes: [],         
    clickMarkers: [],   
    colorPalette: ['#3498db', '#9b59b6', '#2ecc71', '#e67e22', '#e74c3c', '#1abc9c'],
    colorIndex: 0,
    pendingDeletion: null,
    userLocationMarker: null,
    lastActionWasImport: false 
};

document.addEventListener('DOMContentLoaded', async () => {
    // Alustetaan kielelliset elementit ennen kartan ja rajapintojen latausta
    translateStaticElements();

    initMap();

    const apiAvailable = await checkWorkerStatus();
    if (!apiAvailable) {
        state.isReadOnly = true;
        document.getElementById('api-status').style.display = 'block';
    }

    setupMapEvents();
    locateUser();

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const infoWidget = document.getElementById('info-widget');
    const widgetHeader = document.getElementById('widget-title');

    L.DomEvent.disableClickPropagation(infoWidget);
    L.DomEvent.disableScrollPropagation(infoWidget);
    L.DomEvent.disableClickPropagation(sidebar);

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
    });

    document.getElementById('map').addEventListener('click', () => {
        sidebar.classList.remove('open');
        if (window.innerWidth <= 768) infoWidget.classList.remove('expanded');
    });

    widgetHeader.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            infoWidget.classList.toggle('expanded');
        }
    });

    document.getElementById('clear-btn').addEventListener('click', clearAllRoutes);
    document.getElementById('merge-routes-btn').addEventListener('click', handleRouteMerge);
    document.getElementById('export-gpx-btn').addEventListener('click', handleGpxExport);
    document.getElementById('gpx-file-input').addEventListener('change', handleGpxImport);

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        state.pendingDeletion = null;
        document.getElementById('confirm-modal').classList.remove('active');
    });
    
    document.getElementById('modal-confirm-btn').addEventListener('click', executeWaypointDeletion);
});

function translateStaticElements() {
    document.title = t('title');
    document.getElementById('sidebar-title').textContent = t('title');
    document.getElementById('widget-title').textContent = t('title');
    document.getElementById('api-status').textContent = t('readOnly');
    document.getElementById('sidebar-instruction').textContent = t('instruction');
    document.getElementById('btn-import-label').textContent = t('importBtn');
    document.getElementById('merge-routes-btn').textContent = t('mergeBtn');
    document.getElementById('export-gpx-btn').textContent = t('exportBtn');
    document.getElementById('clear-btn').textContent = t('clearBtn');
    document.getElementById('modal-text').textContent = t('modalText');
    document.getElementById('modal-cancel-btn').textContent = t('modalCancel');
    document.getElementById('modal-confirm-btn').textContent = t('modalConfirm');
    document.getElementById('label-avoid-highways').textContent = t('avoidHighways');
}

async function executeWaypointDeletion() {
    if (!state.pendingDeletion) return;
    const { routeId, waypointIndex } = state.pendingDeletion;
    document.getElementById('confirm-modal').classList.remove('active');
    state.pendingDeletion = null;

    const { removeWholeRoute, recalculateWholeRouteGeometry, renderDynamicWaypoints } = await import('./map.js');
    const route = state.routes.find(r => r.id === routeId);
    if (!route) return;

    const isEdgePoint = (waypointIndex === 0 || waypointIndex === route.waypoints.length - 1);
    route.waypoints.splice(waypointIndex, 1);

    if (route.waypoints.length === 0) {
        removeWholeRoute(routeId);
        return;
    }

    await recalculateWholeRouteGeometry(route, waypointIndex, isEdgePoint);
    renderDynamicWaypoints();
}
