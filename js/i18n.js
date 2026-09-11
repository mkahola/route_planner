// js/i18n.js
// Lokalisointimoduuli: sanakirja + t()-käännösfunktio + aktiivisen kielen tila.
// Tila pidetään tässä moduulissa (ei window-objektissa) ja tuodaan (import)
// vain niihin tiedostoihin jotka sitä tarvitsevat (app.js, map.js).

const dictionaries = {
  fi: {
    appTitle: "Reittisuunnittelu",
    sidebarTitle: "Reitin suunnittelu",
    addressPlaceholder: "Hae osoite...",
    importGpx: "Tuo GPX",
    mergeRoutes: "Yhdistä urat",
    downloadGpx: "Lataa GPX",
    clearAll: "Tyhjennä kaikki",
    contactTitle: "Ota yhteyttä",
    readOnlyBanner: "Vain katselutila käytössä",
    popupWaypoint: "Reittipiste",
    popupDeletePoint: "Poista piste",
    popupStreetView: "Street View",
    confirmDeleteTitle: "Poistetaanko piste?",
    confirmDeleteBody: "Tätä toimintoa ei voi perua. Reitti lasketaan uudelleen.",
    confirmYes: "Kyllä",
    confirmNo: "Peruuta",
    routeNameModalTitle: "Anna reitin nimi",
    routeNamePlaceholder: "Esim. Lauantain lenkki",
    save: "Tallenna",
    cancel: "Peruuta",
    totalDistance: "Kokonaispituus",
    routeListTitle: "Reitit",
    routeLabel: "Reitti",
    noRoutes: "Ei vielä reittejä. Klikkaa karttaa tai tuo GPX-tiedosto.",
    kmUnit: "km",
    gpsLocating: "Paikannetaan sijaintia...",
    hamburgerAria: "Avaa valikko",
    closeAria: "Sulje",
    deleteRouteAria: "Poista reitti",
    pointCount: "{count} pistettä",
  },
  en: {
    appTitle: "Route planner",
    sidebarTitle: "Plan a route",
    addressPlaceholder: "Search address...",
    importGpx: "Import GPX",
    mergeRoutes: "Merge routes",
    downloadGpx: "Download GPX",
    clearAll: "Clear all",
    contactTitle: "Contact",
    readOnlyBanner: "Read-only mode active",
    popupWaypoint: "Waypoint",
    popupDeletePoint: "Delete point",
    popupStreetView: "Street View",
    confirmDeleteTitle: "Delete this point?",
    confirmDeleteBody: "This cannot be undone. The route will be recalculated.",
    confirmYes: "Yes",
    confirmNo: "Cancel",
    routeNameModalTitle: "Name your route",
    routeNamePlaceholder: "E.g. Saturday ride",
    save: "Save",
    cancel: "Cancel",
    totalDistance: "Total distance",
    routeListTitle: "Routes",
    routeLabel: "Route",
    noRoutes: "No routes yet. Click the map or import a GPX file.",
    kmUnit: "km",
    gpsLocating: "Locating you...",
    hamburgerAria: "Open menu",
    closeAria: "Close",
    deleteRouteAria: "Delete route",
    pointCount: "{count} points",
  },
};

/**
 * Tunnistaa selaimen kielen ja palauttaa 'fi' tai 'en' (fallback).
 * @returns {'fi'|'en'}
 */
function detectLanguage() {
  try {
    const lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    if (lang.startsWith("fi")) return "fi";
    return "en";
  } catch (e) {
    return "en";
  }
}

// Aktiivinen kieli - moduulin sisäinen tila, ei window-globaali.
let activeLang = detectLanguage();

/**
 * Palauttaa aktiivisen kielen koodin.
 * @returns {'fi'|'en'}
 */
export function getActiveLanguage() {
  return activeLang;
}

/**
 * Asettaa aktiivisen kielen manuaalisesti (esim. testausta tai valintaa varten).
 * @param {'fi'|'en'} lang
 */
export function setActiveLanguage(lang) {
  if (dictionaries[lang]) {
    activeLang = lang;
  }
}

/**
 * Käännösfunktio.
 * @param {string} key - sanakirja-avain
 * @param {string|Object} [fallbackOrVars] - joko fallback-merkkijono tai muuttujaobjekti
 * @param {Object} [vars] - muuttujat interpolointiin (jos fallback annettu erikseen)
 * @returns {string}
 */
export function t(key, fallbackOrVars, vars) {
  const dict = dictionaries[activeLang] || dictionaries.en;
  let fallback;
  let variables;

  if (typeof fallbackOrVars === "string") {
    fallback = fallbackOrVars;
    variables = vars;
  } else {
    fallback = undefined;
    variables = fallbackOrVars;
  }

  let str = dict[key];
  if (str === undefined) {
    str = fallback !== undefined ? fallback : (dictionaries.en[key] !== undefined ? dictionaries.en[key] : key);
  }

  if (variables) {
    Object.keys(variables).forEach((k) => {
      const re = new RegExp("\\{" + k + "\\}", "g");
      str = str.replace(re, String(variables[k]));
    });
  }

  return str;
}
