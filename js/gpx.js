export function parseGPXToCoordinates(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    const points = [];
    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        if (!isNaN(lat) && !isNaN(lon)) {
            points.push([lat, lon]);
        }
    }
    return points;
}

export function exportTracksToGPXFile(tracks) {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Web Route Planner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    tracks.forEach((track, index) => {
        gpx += `  <trk>\n    <name>Track ${index + 1}</name>\n    <trkseg>\n`;
        track.routeGeometry.forEach(pt => {
            gpx += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`;
        });
        gpx += `    </trkseg>\n  </trk>\n`;
    });
    gpx += `</gpx>`;
    
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'route-plan.gpx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
