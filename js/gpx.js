export function parseGPXToCoordinates(xmlTextString) {
    const coords = [];
    try {
        const xmlDoc = new DOMParser().parseFromString(xmlTextString, "text/xml");
        const points = xmlDoc.getElementsByTagName("trkpt");
        for (let i = 0; i < points.length; i++) {
            const lat = parseFloat(points[i].getAttribute("lat")), lon = parseFloat(points[i].getAttribute("lon"));
            if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
        }
        if (coords.length === 0) {
            const wpts = xmlDoc.getElementsByTagName("wpt");
            for (let i = 0; i < wpts.length; i++) {
                const lat = parseFloat(wpts[i].getAttribute("lat")), lon = parseFloat(wpts[i].getAttribute("lon"));
                if (!isNaN(lat) && !isNaN(lon)) coords.push([lat, lon]);
            }
        }
    } catch { console.error("GPX-jäsennys epäonnistui."); }
    return coords;
}
export function exportTracksToGPXFile(allTracks) {
    if (!allTracks || allTracks.length === 0) return;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Modulaarinen Reittisuunnittelija" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    allTracks.forEach((track, idx) => {
        if (track.length === 0) return;
        xml += `  <trk>\n    <name>Ura - Track ${idx + 1}</name>\n    <trkseg>\n`;
        track.forEach(pt => { xml += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`; });
        xml += `    </trkseg>\n  </trk>\n`;
    });
    xml += `</gpx>`;
    const blob = new Blob([xml], { type: 'application/gpx+xml' }), a = document.createElement('a');
    a.download = `route_export_${new Date().toISOString().slice(0,10)}.gpx`; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href);
}
