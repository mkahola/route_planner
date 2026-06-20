const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

/**
 * Tarkistaa taustajärjestelmän (Cloudflare Worker) tilan käynnistyksessä.
 * @returns {Promise<boolean>} True jos backend vastaa onnistuneesti, muuten false.
 */
export async function checkBackendStatus() {
    try {
        const response = await fetch(WORKER_URL, { method: 'GET' });
        return response.ok;
    } catch (error) {
        console.error("Backend healthcheck failed:", error);
        return false;
    }
}

/**
 * Hakee reittigeometrian tieverkostoa pitkin OpenRouteService (ORS) -rajapinnasta.
 * @param {Array} coordinates Taulukko muodossa [[lng, lat], [lng, lat], ...]
 * @returns {Promise<Object|null>} GeoJSON-objekti reitistä tai null virhetilanteessa.
 */
export async function fetchORSRoute(coordinates) {
    try {
        const bodyData = {
            coordinates: coordinates
        };

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            throw new Error(`ORS API returned HTTP status ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error fetching routing geometry:", error);
        return null;
    }
}

/**
 * Suorittaa osoitehaun hyödyntäen OpenStreetMap Nominatim API -rajapintaa.
 * @param {string} query Hakusana (osoite)
 * @returns {Promise<Array>} Lista löydetyistä osoiteobjekteista koordinaatteineen.
 */
export async function searchAddressGeocode(query) {
    if (!query || query.length < 3) return [];
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        const response = await fetch(url, {
            headers: { 'Accept-Language': 'fi,en' }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error("Geocoding fetch failed:", error);
        return [];
    }
}
