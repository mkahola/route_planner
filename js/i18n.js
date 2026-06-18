const dict = {
    fi: {
        readOnlyMode: "Vain katselutila käytössä",
        sidebarTitle: "Reittisuunnittelu",
        searchLabel: "Hae aloitusosoitetta:",
        searchPlaceholder: "Kirjoita osoite...",
        labelAvoidHighways: "Vältä moottoriteitä",
        btnGpxImport: "Tuo GPX-tiedostoja",
        btnMergeTracks: "Yhdistä kartan urat",
        btnGpxExport: "Lataa GPX-jälki",
        btnClearAll: "Tyhjennä kaikki",
        widgetTitle: "Reitin tiedot & Matkalista",
        widgetStats: "Kokonaispituus: {dist} km",
        widgetNoRoutes: "Ei aktiivisia reittejä piirrettynä.",
        trackInfo: "Ura {index}: {points} pistettä ({dist} km)",
        confirmDeletePoint: "Poistetaanko piste?",
        btnYes: "Kyllä",
        btnNo: "Ei"
    },
    en: {
        readOnlyMode: "Read-Only Mode Active",
        sidebarTitle: "Route Planner",
        searchLabel: "Search Starting Address:",
        searchPlaceholder: "Type an address...",
        labelAvoidHighways: "Avoid highways",
        btnGpxImport: "Import GPX Files",
        btnMergeTracks: "Merge map tracks",
        btnGpxExport: "Download GPX Track",
        btnClearAll: "Clear All",
        widgetTitle: "Route Info & Tracklist",
        widgetStats: "Total Length: {dist} km",
        widgetNoRoutes: "No active routes drawn.",
        trackInfo: "Track {index}: {points} points ({dist} km)",
        confirmDeletePoint: "Delete this waypoint?",
        btnYes: "Yes",
        btnNo: "No"
    }
};

const userLang = navigator.language.startsWith('fi') ? 'fi' : 'en';

export const currentLanguage = userLang;

export function t(key, variables = {}) {
    let text = dict[userLang][key] || dict['en'][key] || key;
    Object.keys(variables).forEach(vKey => {
        text = text.replace(`{${vKey}}`, variables[vKey]);
    });
    return text;
}
