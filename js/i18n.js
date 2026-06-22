// Kieliresurssit (Suomi ja Englanti)
const translations = {
    fi: {
        title: "Reittisuunnittelija - @kaffe_racer",
        sidebarTitle: "Reittisuunnittelija",
        searchLabel: "Hae osoitetta tai paikkaa:",
        searchPlaceholder: "Kirjoita osoite...",
        btnGpxImport: "Tuo GPX-tiedostoja",
        btnMergeTracks: "Yhdistä urat yhtenäiseksi reitiksi",
        btnGpxExport: "Vie reitti GPX-tiedostona",
        btnClearAll: "Tyhjennä kaikki",
        contactTitle: "Ota yhteyttä",
        widgetTitle: "Reitin tiedot",
        widgetNoRoutes: "Ei aktiivisia reittejä. Klikkaa karttaa luodaksesi pisteitä.",
        widgetStats: "Kokonaispituus: {dist} km",
        trackInfo: "Ura {index}: {points} pistettä ({dist} km)",
        confirmDeletePoint: "Haluatko varmasti poistaa tämän reittipisteen?",
        readOnlyMode: "Huomautus: Reitityspalvelu on pois käytöstä. Sovellus toimii vain katselutilassa.",
        layerMap: "Kartta",
        layerSatellite: "Satelliitti",
        btnYes: "Kyllä",
        btnNo: "Ei",
        // Uudet reittipisteen popup-ikkunan käännökset
        popupWaypoint: "Reittipiste",
        popupDeletePoint: "Poista piste",
        popupStreetView: "Street View"
    },
    en: {
        title: "Route Planner - @kaffe_racer",
        sidebarTitle: "Route Planner",
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
        confirmDeletePoint: "Are you sure you want to delete this waypoint?",
        readOnlyMode: "Notice: Routing service is offline. App is running in read-only mode.",
        layerMap: "Map",
        layerSatellite: "Satellite",
        btnYes: "Yes",
        btnNo: "No",
        // New waypoint popup translations
        popupWaypoint: "Waypoint",
        popupDeletePoint: "Delete point",
        popupStreetView: "Street View"
    }
};

// Tunnistetaan selaimen kieli (oletuksena englanti, jos ei suomi)
const currentLanguage = navigator.language.startsWith('fi') ? 'fi' : 'en';

/**
 * Palauttaa käännöksen annetulle avaimelle dynaamisilla muuttujilla varustettuna.
 * @param {string} key - Käännösavain
 * @param {Object} [variables] - Dynaamiset muuttujat, esim. { dist: "10.5" }
 * @param {string} [fallback] - Varateksti, jos avainta ei löydy
 * @returns {string} Lokalisoitu teksti
 */
export function t(key, variables = {}, fallback = '') {
    const langDict = translations[currentLanguage] || translations['en'];
    let text = langDict[key];

    // Jos avainta ei löydy, käytetään annettua varatekstiä tai itse avainta
    if (text === undefined) {
        return fallback || key;
    }

    // Jos kyseessä on pelkkä varatekstin haku ilman muuttujia (kuten t('key', 'Varateksti'))
    if (typeof variables === 'string') {
        return text;
    }

    // Korvataan dynaamiset muuttujat tekstistä (esim. {dist})
    Object.keys(variables).forEach(varKey => {
        text = text.replace(new RegExp(`{${varKey}}`, 'g'), variables[varKey]);
    });

    return text;
}

/**
 * Palauttaa nykyisen käytössä olevan kielikoodin ('fi' tai 'en')
 */
export function getCurrentLocale() {
    return currentLanguage;
}
