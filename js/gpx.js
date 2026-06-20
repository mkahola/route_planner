/**
 * Parsii GPX-tekstitiedoston sisällöstä maantieteelliset koordinaatit.
 * @param {string} gpxText GPX-tiedoston XML-raakasisältö
 * @returns {Array} Taulukko koordinaateista [[lat, lon], ...]
 */
export function parseGPXToCoordinates(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
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

/**
 * Muodostaa kaikista kartalla olevista urista yhtenäisen GPX-tiedoston ja lataa sen.
 * @param {Array} tracks Globaali tracks-taulukko sovelluksen tilasta
 */
export function exportTracksToGPXFile(tracks) {
    if (!tracks || tracks.length === 0) return;

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="VanillaJS-RoutePlanner" xmlns="http://www.topografix.com/GPX/1/1">\n`;

    tracks.forEach((track, index) => {
        gpx += `  <trk>\n    <name>Ura ${index + 1}</name>\n    <trkseg>\n`;
        if (track.routeGeometry) {
            track.routeGeometry.forEach(pt => {
                gpx += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`;
            });
        }
        gpx += `    </trkseg>\n  </trk>\n`;
    });

    gpx += `</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reitti_export_${new Date().toISOString().slice(0,10)}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
