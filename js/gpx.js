import { simplifyDouglasPeucker } from './utils.js';

export function parseGPX(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    const tracks = [];

    const trkSegments = xmlDoc.querySelectorAll('trkseg');
    trkSegments.forEach(seg => {
        const points = [];
        const trkpts = seg.querySelectorAll('trkpt');
        trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
                points.push([lat, lon]);
            }
        });
        if (points.length > 0) {
            tracks.push(points);
        }
    });

    if (tracks.length === 0) {
        const rtepts = xmlDoc.querySelectorAll('rtept');
        const points = [];
        rtepts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) {
                points.push([lat, lon]);
            }
        });
        if (points.length > 0) tracks.push(points);
    }

    return tracks;
}

export function reduceGPXToWaypoints(rawTrack) {
    if (rawTrack.length <= 10) return rawTrack;
    return simplifyDouglasPeucker(rawTrack, 0.0008);
}

export function exportGPX(tracksData) {
    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KaffeRacerRoutePlanner" xmlns="http://www.topografix.com/GPX/1/1">
`;

    tracksData.forEach((track, idx) => {
        gpxContent += `  <trk>\n    <name>Track ${idx + 1}</name>\n    <trkseg>\n`;
        if (track.geometry && track.geometry.length > 0) {
            track.geometry.forEach(pt => {
                gpxContent += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`;
            });
        } else if (track.waypoints) {
            track.waypoints.forEach(wp => {
                gpxContent += `      <trkpt lat="${wp.latlng.lat}" lon="${wp.latlng.lng}"></trkpt>\n`;
            });
        }
        gpxContent += `    </trkseg>\n  </trk>\n`;
    });

    gpxContent += `</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route_${Date.now()}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
