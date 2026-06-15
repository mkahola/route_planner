export const WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/';

// Tarkistetaan backend-palvelun tila (GET-pyyntö)
export async function checkWorkerStatus() {
    try {
        const response = await fetch(WORKER_URL, { method: 'GET' });
        return response.ok;
    } catch (err) {
        console.error("Backendiin ei saatu yhteyttä:", err);
        return false;
    }
}

// Haetaan reittigeometria kahden pisteen välille (POST-pyyntö)
export async function fetchRouteSegment(start, end) {
    // Jos sovellus on katselutilassa, palautetaan suora viiva pisteiden välille
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
                // Optimoidaan geometria Douglas-Peucker-algoritmilla lennossa
                return simplifyCoordinates(segment, 0.00005);
            }
        }
    } catch (err) {
        console.error("Reitityshaku epäonnistui:", err);
    }
    return [start, end]; // Fallback suoralla viivalla virhetilanteissa
}
