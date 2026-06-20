/**
 * Douglas-Peucker -algoritmi koordinaattipisteiden dynaamiseen optimointiin.
 * @param {Array} points [[lat, lon], ...] taulukko
 * @param {number} tolerance Toleranssiarvo etäisyyskynnykselle
 * @returns {Array} Optimoitu ja karsittu maantieteellinen pistelista
 */
export function simplifyPointsDouglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = getPerpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > tolerance) {
        const results1 = simplifyPointsDouglasPeucker(points.slice(0, index + 1), tolerance);
        const results2 = simplifyPointsDouglasPeucker(points.slice(index), tolerance);
        return results1.slice(0, results1.length - 1).concat(results2);
    } else {
        return [points[0], points[end]];
    }
}

function getPerpendicularDistance(p, p1, p2) {
    let x = p1[0], y = p1[1];
    let dx = p2[0] - x, dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {
        let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
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
    return Math.sqrt(dx * dx + dy * dy);
}
