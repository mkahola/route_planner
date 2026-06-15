const translations = {
    fi: {
        title: "Reittisuunnittelu",
        readOnly: "Vain katselutila käytössä",
        avoidHighways: "Vältä moottoriteitä",
        instruction: "Klikkaa karttapohjaa asettaaksesi reittipisteitä. Voit siirtää pisteitä raahaamalla niitä lipuista.",
        importBtn: "Tuo GPX-tiedostoja",
        mergeBtn: "Yhdistä urat yhdeksi",
        exportBtn: "Lataa valmis GPX",
        clearBtn: "Tyhjennä kaikki",
        noRoutes: "Ei aktiivisia reittejä",
        modalText: "Poistetaanko piste?",
        modalConfirm: "Poista",
        modalCancel: "Peruuta",
        customRoute: "Oma reitti",
        mergedRoute: "Yhdistetty reitti"
    },
    en: {
        title: "Route Planner",
        readOnly: "Read-Only Mode Active",
        avoidHighways: "Avoid Highways",
        instruction: "Click on the map to add waypoints. Drag flags to move points, click to delete.",
        importBtn: "Import GPX Files",
        mergeBtn: "Merge Routes",
        exportBtn: "Download GPX",
        clearBtn: "Clear All",
        noRoutes: "No active routes",
        modalText: "Delete this waypoint?",
        modalConfirm: "Delete",
        modalCancel: "Cancel",
        customRoute: "Custom Route",
        mergedRoute: "Merged Route"
    }
};

// Haetaan kaikki selaimen hyväksymät kielet taulukkona, ja lisätään varmistukseksi navigator.language
const preferredLanguages = navigator.languages ? Array.from(navigator.languages) : [];
if (navigator.language) preferredLanguages.unshift(navigator.language);

// Esitunnistetaan kieli (oletuksena 'en')
let detectedLang = 'en';

// Käydään läpi selaimen kielilista ja katsotaan, löytyykö sieltä suomea ('fi')
for (const lang of preferredLanguages) {
    const shortLang = lang.split('-')[0].toLowerCase();
    if (shortLang === 'fi') {
        detectedLang = 'fi';
        break; // Suomi löytyi, lopetetaan etsintä
    }
}

// Valitaan lopullinen kieli sanakirjasta
export const currentLang = translations[detectedLang] ? detectedLang : 'en';

export function t(key) {
    return translations[currentLang][key] || key;
}
