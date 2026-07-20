const translations = {
    fi: {
        title: "Reittisuunnittelija - @kaffe_racer",
        sidebarTitle: "Reitin suunnittelu",
        searchLabel: "Hae osoitetta tai paikkaa:",
        searchPlaceholder: "Kirjoita osoite...",
        btnGpxImport: "Tuo GPX-tiedostoja",
        btnMergeTracks: "Yhdistä urat yhtenäiseksi reitiksi",
        btnGpxExport: "Lataa GPX",
        btnClearAll: "Tyhjennä kaikki",
        contactTitle: "Ota yhteyttä",
        widgetTitle: "Reitin tiedot",
        widgetNoRoutes: "Ei aktiivisia reittejä. Klikkaa karttaa luodaksesi pisteitä.",
        widgetStats: "Kokonaispituus: {dist} km",
        trackInfo: "Ura {index}: {points} pistettä ({dist} km)",
        confirmDeletePoint: "Poistetaanko piste?",
        readOnlyMode: "Vain katselutila käytössä",
        layerMap: "Kartta",
        layerSatellite: "Satelliitti",
        btnYes: "Kyllä",
        btnNo: "Ei",
        popupWaypoint: "Reittipiste",
        popupDeletePoint: "Poista piste",
        popupStreetView: "Street View"
    },
    en: {
        title: "Route Planner - @kaffe_racer",
        sidebarTitle: "Plan a route",
        searchLabel: "Search address or location:",
        searchPlaceholder: "Type an address...",
        btnGpxImport: "Import GPX Files",
        btnMergeTracks: "Merge Tracks into Single Route",
        btnGpxExport: "Export Route as GPX",
        btnClearAll: "Clear All",
        contactTitle: "Contact",
        widgetTitle: "Route Details",
        widgetNoRoutes: "No active routes. Click on the map to create waypoints.",
        widgetStats: "Total distance: {dist} km",
        trackInfo: "Track {index}: {points} points ({dist} km)",
        confirmDeletePoint: "Delete this waypoint?",
        readOnlyMode: "Read-Only mode active",
        layerMap: "Map",
        layerSatellite: "Satellite",
        btnYes: "Yes",
        btnNo: "No",
        popupWaypoint: "Waypoint",
        popupDeletePoint: "Delete point",
        popupStreetView: "Street View"
    }
};

const userLang = navigator.language || navigator.userLanguage || 'en';
const currentLanguage = userLang.startsWith('fi') ? 'fi' : 'en';

export function t(key, variables = {}, fallbackStr = '') {
    const langDict = translations[currentLanguage] || translations['en'];
    let text = langDict[key];

    if (typeof variables === 'string') {
        fallbackStr = variables;
        variables = {};
    }

    if (text === undefined) {
        return fallbackStr || key;
    }

    if (typeof variables === 'object' && variables !== null) {
        Object.keys(variables).forEach(varKey => {
            text = text.replace(new RegExp(`{${varKey}}`, 'g'), variables[varKey]);
        });
    }

    return text;
}

export function getCurrentLocale() {
    return currentLanguage;
}
