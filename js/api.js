const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

export async function checkBackendStatus() {
    try { const res = await fetch(WORKER_URL); return res.ok; } catch (e) { return false; }
}
export async function fetchORSRoute(coordinates) {
    const requestBody = { coordinates: coordinates, profile: 'driving-car', format: 'geojson' };
    const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    return res.ok ? await res.json() : null;
}
export async function searchAddressGeocode(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    return res.ok ? await res.json() : [];
}
