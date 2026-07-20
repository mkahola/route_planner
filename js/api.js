const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

export async function checkBackendStatus() {
    try {
        const response = await fetch(WORKER_URL, { method: 'GET' });
        return response.ok;
    } catch (error) {
        console.warn('Backend health check failed:', error);
        return false;
    }
}

export async function fetchORSRoute(coordinates) {
    if (!coordinates || coordinates.length < 2) return [];

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: coordinates
            })
        });

        if (!response.ok) {
            throw new Error(`Routing request failed with status ${response.status}`);
        }

        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const rawCoords = data.features[0].geometry.coordinates;
            return rawCoords.map(coord => [coord[1], coord[0]]);
        }
        return [];
    } catch (err) {
        console.error('ORSRoute error:', err);
        return [];
    }
}

export async function searchAddressNominatim(query) {
    if (!query || query.trim().length < 3) return [];
    
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    try {
        const response = await fetch(url, {
            headers: { 'Accept-Language': navigator.language || 'en' }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (err) {
        console.error('Nominatim search error:', err);
        return [];
    }
}
