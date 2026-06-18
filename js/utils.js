export function calculateHaversineDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function findPerpendicularDistance(p, p1, p2) {
    if (p1[0] === p2[0] && p1[1] === p2[1]) {
        return Math.sqrt(Math.pow(p[0] - p1[0], 2) + Math.pow(p[1] - p1[1], 2));
    }
    const num = Math.abs((p2[1] - p1[1]) * p[0] - (p2[0] - p1[0]) * p[1] + p2[0] * p1[1] - p2[1] * p1[0]);
    const den = Math.sqrt(Math.pow(p2[1] - p1[1], 2) + Math.pow(p2[0] - p1[0], 2));
    return num / den;
}

export function simplifyPointsDouglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;
    let maxSqDist = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = findPerpendicularDistance(points[i], points[0], points[end]);
        if (d > maxSqDist) {
            index = i;
            maxSqDist = d;
        }
    }
    if (maxSqDist > tolerance) {
        const results1 = simplifyPointsDouglasPeucker(points.slice(0, index + 1), tolerance);
        const results2 = simplifyPointsDouglasPeucker(points.slice(index), tolerance);
        return results1.slice(0, results1.length - 1).concat(results2);
    }
    return [points[0], points[end]];
}
