export function calculateHaversineDistance(coord1, coord2) {
    const R = 6371;
    const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getPerpendicularDistance(point, lineStart, lineEnd) {
    let x = lineStart[0], y = lineStart[1], dx = lineEnd[0] - x, dy = lineEnd[1] - y;
    if (dx !== 0 || dy !== 0) {
        let t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) { x = lineEnd[0]; y = lineEnd[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return Math.sqrt((point[0] - x) ** 2 + (point[1] - y) ** 2);
}
export function simplifyDouglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;
    let dmax = 0, index = 0, end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = getPerpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) { index = i; dmax = d; }
    }
    if (dmax > tolerance) {
        const r1 = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
        const r2 = simplifyDouglasPeucker(points.slice(index), tolerance);
        return r1.slice(0, r1.length - 1).concat(r2);
    }
    return [points[0], points[end]];
}
