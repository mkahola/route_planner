export const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

export async function checkWorkerStatus() {
    try {
        const response = await fetch(WORKER_URL, { method: 'GET' });
        return response.ok;
    } catch (err) {
        console.error("Taustajärjestelmä offline-tilassa:", err);
        return false;
    }
}

export async function fetchRouteSegment(start, end) {
    const { state } = await import('./app.js');
    if (state.isReadOnly) return [start, end];

    const avoidHighways = document.getElementById('avoid-highways-checkbox').checked;
    const body = { coordinates: [[start[1], start[0]], [end[1], end[0]]] };
    if (avoidHighways) body.options = { avoid_features: ["highway"] };

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const { simplifyCoordinates } = await import('./utils.js');
                const segment = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
                return simplifyCoordinates(segment, 0.00005);
            }
        }
    } catch (err) {
        console.error("Reititysvirhe rajapinnassa:", err);
    }
    return [start, end]; 
}
