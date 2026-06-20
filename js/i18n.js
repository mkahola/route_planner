const dictionary = {
    fi: {
        title: "Reittisuunnittelu",
        sidebarTitle: "Reitin suunnittelu",
        searchLabel: "Hae lähtöpiste / osoite",
        searchPlaceholder: "Kirjoita osoite...",
        btnGpxImport: "Tuo GPX-tiedostot",
        btnMergeTracks: "Yhdistä urat",
        btnGpxExport: "Lataa GPX",
        btnClearAll: "Tyhjennä kaikki",
        widgetTitle: "Reitin tiedot",
        widgetNoRoutes: "Ei aktiivisia reittejä kartalla.",
        widgetStats: "Kokonaisetäisyys: {dist} km",
        trackInfo: "Ura {index}: {points} pistettä ({dist} km)",
        confirmDeletePoint: "Poistetaanko piste?",
        btnYes: "Kyllä",
        btnNo: "Ei",
        readOnlyMode: "Vain katselutila käytössä"
    },
    en: {
        title: "Route planner",
        sidebarTitle: "Plan a route",
        searchLabel: "Search starting point / address",
        searchPlaceholder: "Type an address...",
        btnGpxImport: "Import GPX files",
        btnMergeTracks: "Merge tracks",
        btnGpxExport: "Download GPX",
        btnClearAll: "Clear all",
        widgetTitle: "Route details",
        widgetNoRoutes: "No active routes on map.",
        widgetStats: "Total distance: {dist} km",
        trackInfo: "Track {index}: {points} points ({dist} km)",
        confirmDeletePoint: "Delete this waypoint?",
        btnYes: "Yes",
        btnNo: "No",
        readOnlyMode: "Vain katselutila käytössä / Read-only mode active"
    }
};

const userLanguage = navigator.language || navigator.userLanguage;
export const activeLang = userLanguage.startsWith('fi') ? 'fi' : 'en';

/**
 * Dynaaminen kääntäjäfunktio muuttujilla
 * @param {string} key Käännösavain
 * @param {Object} variables Avain-arvo-parit dynaamiselle datalle
 * @returns {string} Käännetty teksti
 */
export function t(key, variables = {}) {
    const langDict = dictionary[activeLang] || dictionary['en'];
    let text = langDict[key] || dictionary['en'][key] || key;

    Object.keys(variables).forEach(vKey => {
        text = text.replace(`{${vKey}}`, variables[vKey]);
    });

    return text;
}
