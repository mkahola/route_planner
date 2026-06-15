import { checkWorkerStatus } from './api.js';
import { initMap, handleMapClick, handleRouteMerge, clearAllRoutes, setupMapEvents, locateUser } from './map.js';
import { handleGpxImport, handleGpxExport } from './gpx.js';

// Keskitetty sovelluksen tila (State)
export const state = {
    isReadOnly: false,
    routes: [],         // Lista objekteja: { id, name, waypoints, coords, color, layer }
    clickMarkers: [],   // Kartalla parhaillaan piirretyt dynaamiset markerit
    colorPalette: ['#3498db', '#9b59b6', '#2ecc71', '#e67e22', '#e74c3c', '#1abc9c'],
    colorIndex: 0,
    pendingDeletion: null,
    userLocationMarker: null,
    lastActionWasImport: false // Seuraa ERITYISSÄÄNTÖ 2 -tilannetta
};

document.addEventListener('DOMContentLoaded', async () => {
    // Alustetaan Leaflet-kartta
    initMap();

    // Tarkistetaan backendin tila ja asetetaan katselutila tarvittaessa
    const apiAvailable = await checkWorkerStatus();
    if (!apiAvailable) {
        state.isReadOnly = true;
        document.getElementById('api-status').style.display = 'block';
    }

    // Alustetaan karttatapahtumat ja käyttäjän paikannus
    setupMapEvents();
    locateUser();

    // DOM-elementtien sidonnat ja Event Listenerit
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const infoWidget = document.getElementById('info-widget');
    const widgetHeader = infoWidget.querySelector('h3');

    // Estetään Leaflet-kartan pohjatapahtumat käyttöliittymäkomponenttien päältä
    L.DomEvent.disableClickPropagation(infoWidget);
    L.DomEvent.disableScrollPropagation(infoWidget);
    L.DomEvent.disableClickPropagation(sidebar);

    // Hampurilaisvalikon toiminta
    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
    });

    // Suljetaan valikot karttaa klikkaamalla
    setupMapCloseTriggers(sidebar, infoWidget);

    // Bottom Sheetin laajennus mobiilissa klikkaamalla otsikkokahvaa
    widgetHeader.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            infoWidget.classList.toggle('expanded');
        }
    });

    // Sivupalkin toimintopainikkeet
    document.getElementById('clear-btn').addEventListener('click', clearAllRoutes);
    document.getElementById('merge-routes-btn').addEventListener('click', handleRouteMerge);
    document.getElementById('export-gpx-btn').addEventListener('click', handleGpxExport);
    document.getElementById('gpx-file-input').addEventListener('change', handleGpxImport);

    // Varmistusmodaalin painikkeet
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        state.pendingDeletion = null;
        document.getElementById('confirm-modal').classList.remove('active');
    });
    
    document.getElementById('modal-confirm-btn').addEventListener('click', executeWaypointDeletion);
});

function setupMapCloseTriggers(sidebar, infoWidget) {
    // Välitetään viite map.js:lle tapahtumien sulkemista varten
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('click', (e) => {
        if (e.target === mapEl || e.target.id === 'map') {
            sidebar.classList.remove('open');
            if (window.innerWidth <= 768) infoWidget.classList.remove('expanded');
        }
    });
}

// Suoritetaan waypointin poisto vahvistuksen jälkeen
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
