export function simplifyCoordinates(points, tolerance) {
    if (points.length <= 2) return points;
    let maxSqDist = 0; let index = 0; const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const sqDist = getSquareSegmentDistance(points[i], points[0], points[end]);
        if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
    }
    if (maxSqDist > tolerance * tolerance) {
        const results1 = simplifyCoordinates(points.slice(0, index + 1), tolerance);
        const results2 = simplifyCoordinates(points.slice(index), tolerance);
        return results1.slice(0, results1.length - 1).concat(results2);
    }
    return [points[0], points[end]];
}

function getSquareSegmentDistance(p, p1, p2) {
    let x = p1[1], y = p1[0], dx = p2[1] - x, dy = p2[0] - y;
    if (dx !== 0 || dy !== 0) {
        let t = ((p[1] - x) * dx + (p[0] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) { x = p2[1]; y = p2[0]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[1] - x; dy = p[0] - y; return dx * dx + dy * dy;
}

export function calculateGpxGeometricDistance(coords) {
    let totalDist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        totalDist += L.latLng(coords[i][0], coords[i][1]).distanceTo(L.latLng(coords[i+1][0], coords[i+1][1]));
    }
    return totalDist / 1000; 
}

export function findClosestCoordinateIndex(coords, target) {
    let minTargetDist = Infinity, targetIndex = 0;
    for(let i=0; i<coords.length; i++) {
        let d = Math.pow(coords[i][0] - target[0], 2) + Math.pow(coords[i][1] - target[1], 2);
        if(d < minTargetDist) { minTargetDist = d; targetIndex = i; }
    }
    return targetIndex;
}
