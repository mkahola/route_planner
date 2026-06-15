import { state } from './app.js';
import { map, updateInterfaceRouteLists, zoomToFitAllRoutes, renderDynamicWaypoints } from './map.js';

export function handleGpxImport(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(evt.target.result, "text/xml");
                const rawCoords = [];
                const trkpts = xmlDoc.getElementsByTagName('trkpt');
                const wpts = xmlDoc.getElementsByTagName('wpt');
                const sourcePoints = trkpts.length > 0 ? trkpts : wpts;

                if (sourcePoints.length === 0) return;
                for (let i = 0; i < sourcePoints.length; i++) {
                    let lat = parseFloat(sourcePoints[i].getAttribute('lat'));
                    let lon = parseFloat(sourcePoints[i].getAttribute('lon'));
                    if (!isNaN(lat) && !isNaN(lon)) rawCoords.push([lat, lon]);
                }

                const color = state.colorPalette[state.colorIndex % state.colorPalette.length];
                state.colorIndex++;
                const routeId = 'route_' + Date.now() + Math.random().toString(36).substr(2, 5);
                const layer = L.polyline(rawCoords, { color: color, weight: 6, opacity: 0.85 }).addTo(map);

                const step = Math.max(1, Math.floor(rawCoords.length / 25));
                const calculatedWaypoints = [];
                for(let i=0; i<rawCoords.length; i+=step) calculatedWaypoints.push(rawCoords[i]);
                if(calculatedWaypoints[calculatedWaypoints.length-1] !== rawCoords[rawCoords.length-1]) {
                    calculatedWaypoints.push(rawCoords[rawCoords.length-1]);
                }

                state.routes.push({ id: routeId, name: file.name.replace('.gpx', ''), waypoints: calculatedWaypoints, coords: rawCoords, color: color, layer: layer });
                state.lastActionWasImport = true; 

                updateInterfaceRouteLists();
                zoomToFitAllRoutes();
                renderDynamicWaypoints();
            } catch (err) {
                console.error("GPX-lukuvirhe:", err);
            }
        };
        reader.readAsText(file);
    });
    e.target.value = '';
    document.getElementById('sidebar').classList.remove('open'); 
}

export function handleGpxExport() {
    if (state.routes.length === 0) return;
    
    let gpxText = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RoutePlanner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    state.routes.forEach(route => {
        if (route.coords.length === 0) return;
        gpxText += `  <trk>\n    <name>${route.name}</name>\n    <trkseg>\n`;
        route.coords.forEach(c => { 
            gpxText += `      <trkpt lat="${c[0].toFixed(6)}" lon="${c[1].toFixed(6)}"></trkpt>\n`; 
        });
        gpxText += `    </trkseg>\n  </trk>\n`;
    });
    gpxText += `</gpx>`;

    const blob = new Blob([gpxText], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'reitti_' + Date.now() + '.gpx';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);

    document.getElementById('sidebar').classList.remove('open');
}
