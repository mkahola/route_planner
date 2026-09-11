// js/api.js
// Kaikki ulkoiset API-kutsut: Cloudflare Worker (ORS-proxy) ja
// OpenStreetMap Nominatim -osoitehaku.

export const WORKER_URL = "https://ors-proxy.mika-kahola.workers.dev/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Tarkistaa onko taustajärjestelmä (Cloudflare Worker / ORS-proxy) saatavilla.
 * Käytetään käynnistyksessä päättämään siirrytäänkö Read-Only-tilaan.
 * @returns {Promise<boolean>}
 */
export async function checkBackendStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(WORKER_URL, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Pyytää reitin kahden (tai useamman) koordinaatin välille ORS-proxyn kautta.
 * Käyttää driving-car -profiilia ilman lisärajoituksia.
 * @param {Array<{lat:number,lng:number}>} coords - vähintään 2 pistettä
 * @returns {Promise<{geometry: Array<{lat:number,lng:number}>, distanceMeters: number}>}
 */
export async function fetchRoute(coords) {
  if (!coords || coords.length < 2) {
    throw new Error("Reititys vaatii vähintään kaksi pistettä.");
  }

  const body = {
    profile: "driving-car",
    coordinates: coords.map((c) => [c.lng, c.lat]),
  };

  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error("Reititys epäonnistui (HTTP " + res.status + ")");
  }

  const data = await res.json();

  // ORS GeoJSON-vastaus: features[0].geometry.coordinates = [[lng,lat], ...]
  const feature = data && data.features && data.features[0];
  if (!feature) {
    throw new Error("Reititys palautti tyhjän vastauksen.");
  }

  const rawCoords = feature.geometry.coordinates;
  const geometry = rawCoords.map(([lng, lat]) => ({ lat, lng }));
  const distanceMeters =
    (feature.properties &&
      feature.properties.summary &&
      feature.properties.summary.distance) ||
    0;

  return { geometry, distanceMeters };
}

/**
 * Hakee osoitteita Nominatim-rajapinnasta.
 * @param {string} query
 * @returns {Promise<Array<{lat:number,lng:number,label:string}>>}
 */
export async function geocodeAddress(query) {
  if (!query || query.trim().length < 3) return [];

  const url = `${NOMINATIM_URL}?format=json&limit=5&q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error("Osoitehaku epäonnistui (HTTP " + res.status + ")");
  }

  const data = await res.json();

  return data.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    label: item.display_name,
  }));
}
