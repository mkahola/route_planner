const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

export async function checkBackendStatus() {
    try {
        const res = await fetch(WORKER_URL);
        return res.ok;
    } catch (e) {
        return false;
    }
}

export async function fetchORSRoute(coordinates, avoidHighways = false) {
    try {
        const requestBody = {
            coordinates: coordinates,
            profile: 'driving-car',
            format: 'geojson'
        };

        if (avoidHighways) {
            requestBody.options = {
                avoid_features: ["motorway"]
            };
        }

        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        return res.ok ? await res.json() : null;
    } catch (error) {
        console.error("ORS Error:", error);
        return null;
    }
}

export async function searchAddressGeocode(query) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        return res.ok ? await res.json() : [];
    } catch (error) {
        console.error("Geocoding Error:", error);
        return [];
    }
}
