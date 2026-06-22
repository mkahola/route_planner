import { t } from './i18n.js';

let map = null;
let locationMarker = null;
let trackPolylines = [];
let baseMaps = {};
let layersControl = null;

/**
 * Alustaa Leaflet-kartan, tasot ja vakiokontrollit
 */
export function initializeLeafletMapInstance(elementId, globalState, onReRoute, onDeletePrompt) {
    // 1. Luodaan peruskartta (OpenStreetMap)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });

    // 2. Luodaan satelliittikartta (Esri World Imagery)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    // Alustetaan kartta käyttäen oletuksena OpenStreetMapia
    map = L.map(elementId, {
        zoomControl: false,
        layers: [osmLayer]
    }).setView([64.9146, 26.0672], 5);

    // 3. Palautetaan Leaflet-prefix normaaliksi (mobiiliystävälliseksi)
    if (map.attributionControl) {
        map.attributionControl.setPrefix('Leaflet');
    }

    // RAKENNETAAN BRÄNDILINKKI (Mobiilivarma injektio)
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

    // Pakotetaan linkki kiinteäksi osaksi attribuutiolistaa, jolloin se pysyy näkyvissä laitteesta riippumatta
    if (map.attributionControl) {
        map.attributionControl.addAttribution(instagramHTML);
    }

    // 4. Lokalisoidaan tasojen nimet
    const labelMap = t('Map', 'Kartta');
    const labelSatellite = t('Satellite', 'Satelliitti');

    baseMaps = {
        [labelMap]: osmLayer,
        [labelSatellite]: satelliteLayer
    };

    // Lisätään kontrollit kartalle
    layersControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Sidotaan reititys- ja poistotapahtumat karttaolioon takaisinkutsuja varten
    map._onReRoute = onReRoute;
    map._onDeletePrompt = onDeletePrompt;

    // Kuunnellaan liikettä ja zoomausta dynaamista karsintaa varten
    map.on('moveend zoomend', () => {
        handleDynamicWaypointPruning(globalState);
    });

    // 5. VIKASIETOISUUS: Varmistetaan dynaamisen CSS:n oikea renderöinti
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 200);

    return map;
}

/**
 * Piirtää tai siirtää GPS-sijaintipulssin kartalle
 */
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

/**
 * Luo puhtaan vuorovaikutteisen Leaflet-markerin
 */
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
    marker.isNewPoint = true; // Estetään piilottaminen välittömästi luonnin jälkeen

    // Luodaan dynaaminen popup-sisältö, jossa on sekä Street View -linkki että Poista-painike
    updateMarkerPopupContent(marker, latlng);

    return marker;
}

/**
 * Apufunktio popupin sisällön päivittämiseen (LOKALISOITU VERSIO)
 */
function updateMarkerPopupContent(marker, latlng) {
    const lat = latlng.lat;
    const lng = latlng.lng;

    const streetViewUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;

    // Haetaan dynaamiset käännökset i18n-järjestelmästä (varatekstit mukana)
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

/**
 * Sitoo dynaamiset tapahtumankuuntelijat markerille ID-pohjaisesti
 */
export function bindDynamicMarkerEvents(marker, globalState) {
    if (!marker || typeof marker.wpId === 'undefined') return;

    // Raahauksen kuuntelija
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
            // Päivitetään popupin linkki vastaamaan uutta paikkaa raahauksen jälkeen
            updateMarkerPopupContent(marker, marker.getLatLng());
            
            if (map._onReRoute) {
                map._onReRoute(targetTrackIdx, targetWpIdx, marker.getLatLng());
            }
        }
    });

    // Klikkauskuuntelija
    marker.off('click');
    marker.on('click', () => {
        marker.openPopup();

        // Odotetaan hetki, että popup on piirtynyt DOMiin
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

/**
 * Piirtää kaikki urat ja päivittää kaikkien markereiden kuuntelijat
 */
export function renderAllMapLayersAndTracks(globalState) {
    if (!map || !globalState) return;

    // Poistetaan vanhat reittiviivat
    trackPolylines.forEach(polyline => {
        if (map.hasLayer(polyline)) map.removeLayer(polyline);
    });
    trackPolylines = [];

    globalState.tracks.forEach((track) => {
        if (track.routeGeometry && track.routeGeometry.length > 0) {
            const polyline = L.polyline(track.routeGeometry, {
                color: track.isImportedGPX ? '#28a745' : '#007bff',
                weight: 5,
                opacity: 0.75
            }).addTo(map);

            trackPolylines.push(polyline);
        }

        // Varmistetaan, että kuuntelijat on sidottu oikein dynaamista tilaa varten
        track.waypoints.forEach((wp) => {
            bindDynamicMarkerEvents(wp, globalState);
        });
    });

    // Suoritetaan dynaaminen karsinta lennosta
    handleDynamicWaypointPruning(globalState);
}

/**
 * Laskee uran kokonaispituuden kilometreissä
 */
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

/**
 * Älykäs markerien karsinta suorituskyvyn takaamiseksi
 */
export function handleDynamicWaypointPruning(globalState) {
    if (!map || !globalState || !globalState.tracks) return;

    const bounds = map.getBounds();
    const currentZoom = map.getZoom();
    const hasBounds = bounds && typeof bounds.contains === 'function';

    globalState.tracks.forEach((track) => {
        const totalWps = track.waypoints.length;
        if (totalWps === 0) return;

        let maxVisibleMarkers = 10;
        if (currentZoom >= 16) maxVisibleMarkers = 45;
        else if (currentZoom >= 13) maxVisibleMarkers = 20;

        const skipFactor = Math.ceil(totalWps / maxVisibleMarkers);

        track.waypoints.forEach((wp, wpIdx) => {
            // Jos piste on vasta luotu, pidetään se dynaamisesti näkyvissä
            if (wp.isNewPoint) {
                if (!map.hasLayer(wp)) wp.addTo(map);
                return;
            }

            if (!hasBounds) {
                if (!map.hasLayer(wp)) wp.addTo(map);
                return;
            }

            // Kriittiset pisteet: 1., 2., toiseksi viimeinen ja viimeinen piste näytetään AINA
            const isEdgePoint = (wpIdx === 0 || wpIdx === totalWps - 1);
            const isBufferPoint = (wpIdx === 1 || wpIdx === totalWps - 2);
            const isSampled = (wpIdx % skipFactor === 0);
            const isInBounds = bounds.contains(wp.getLatLng());

            if (isEdgePoint || isBufferPoint || (isSampled && isInBounds)) {
                if (!map.hasLayer(wp)) wp.addTo(map);
            } else {
                if (map.hasLayer(wp)) map.removeLayer(wp);
            }
        });
    });
}
