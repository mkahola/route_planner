export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

export function calculateTotalDistance(coordinates) {
    if (!coordinates || coordinates.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        dist += calculateHaversineDistance(
            coordinates[i][0], coordinates[i][1],
            coordinates[i+1][0], coordinates[i+1][1]
        );
    }
    return dist;
}

export function simplifyDouglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;

    let maxSqDist = 0;
    let index = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const sqDist = getSquareSegmentDistance(points[i], points[0], points[points.length - 1]);
        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > tolerance * tolerance) {
        const left = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
        const right = simplifyDouglasPeucker(points.slice(index), tolerance);
        return left.slice(0, left.length - 1).concat(right);
    } else {
        return [points[0], points[points.length - 1]];
    }
}

function getSquareSegmentDistance(p, p1, p2) {
    let x = p1[0], y = p1[1];
    let dx = p2[0] - x, dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2[0];
            y = p2[1];
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = p[0] - x;
    dy = p[1] - y;

    return dx * dx + dy * dy;
}
