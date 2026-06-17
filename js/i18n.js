const dictionary = {
    fi: {
        appTitle: "Reittisuunnittelu", sidebarTitle: "Asetukset", searchLabel: "Hae osoite:",
        labelAvoidHighways: "Vältä moottoriteitä", btnGpxImport: "Tuo GPX-tiedostoja", btnMergeTracks: "Yhdistä kartan jäljet",
        btnGpxExport: "Lataa GPX-jälki", btnClearAll: "Tyhjennä kaikki", readOnlyMode: "Vain katselutila käytössä",
        widgetTitle: "Reitin tiedot ja Matkalista", widgetStats: "Kokonaispituus: {dist} km", widgetNoRoutes: "Ei aktiivisia reittejä piirrettynä.",
        trackInfo: "Ura {index}: {points} herätettä ({dist} km)", confirmDeletePoint: "Poistetaanko piste?", btnYes: "Kyllä", btnNo: "Ei", searchPlaceholder: "Kirjoita osoite..."
    },
    en: {
        appTitle: "Route Planner", sidebarTitle: "Settings", searchLabel: "Search Address:",
        labelAvoidHighways: "Avoid highways", btnGpxImport: "Import GPX files", btnMergeTracks: "Merge map tracks",
        btnGpxExport: "Download GPX Track", btnClearAll: "Clear Everything", readOnlyMode: "Read-Only Mode Enabled",
        widgetTitle: "Route Information and Tracks", widgetStats: "Total Distance: {dist} km", widgetNoRoutes: "No active routes planned.",
        trackInfo: "Track {index}: {points} points ({dist} km)", confirmDeletePoint: "Delete this waypoint?", btnYes: "Yes", btnNo: "No", searchPlaceholder: "Type an address..."
    }
};
const userLanguage = navigator.language.slice(0, 2);
export const currentLanguage = dictionary[userLanguage] ? userLanguage : 'en';
export function t(key, variables = {}) {
    let text = dictionary[currentLanguage][key] || dictionary['en'][key] || key;
    Object.keys(variables).forEach(vKey => { text = text.replace(`{${vKey}}`, variables[vKey]); });
    return text;
}
