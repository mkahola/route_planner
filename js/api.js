const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';
export async function checkBackendStatus() {
    try { const res = await fetch(WORKER_URL, { method: 'GET' }); return res.ok; } catch { return false; }
}
export async function fetchORSRoute(coordinates, avoidHighways = false) {
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates, profile: 'driving-car', format: 'geojson', options: { avoid_features: avoidHighways ? ["highway"] : [] } })
        });
        return res.ok ? await res.json() : null;
    } catch { return null; }
}
export async function searchAddressGeocode(queryString) {
    if (!queryString || queryString.trim().length < 3) return [];
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryString)}&limit=5`, { headers: { 'Accept-Language': 'fi, en' } });
        return res.ok ? await res.json() : [];
    } catch { return []; }
}
