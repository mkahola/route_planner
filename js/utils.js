// js/utils.js
// Matemaattiset apufunktiot: etäisyyslaskenta (Haversine), Douglas-Peucker
// -yksinkertaistus reittipisteiden karsintaan sekä pieniä yleisapureita.

const EARTH_RADIUS_M = 6371000;

/**
 * Laskee kahden koordinaatin välisen etäisyyden metreinä (Haversine-kaava).
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number} etäisyys metreinä
 */
export function haversineDistance(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_M * c;
}

/**
 * Laskee koko pistejoukon kokonaispituuden metreinä.
 * @param {Array<{lat:number,lng:number}>} points
 * @returns {number}
 */
export function totalDistance(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineDistance(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * Muotoilee metrit siistiksi kilometrimerkkijonoksi, esim. "12.4".
 * @param {number} meters
 * @returns {string}
 */
export function formatKm(meters) {
  return (meters / 1000).toFixed(1);
}

/**
 * Kohtisuora etäisyys pisteestä suoralle (linjalle start-end).
 * Käytetään Douglas-Peucker-algoritmissa. Käytämme yksinkertaista
 * tasokoordinaattien approksimaatiota, mikä riittää pienten reittiosuuksien
 * karsintaan (paikallinen tarkkuus riittävä lyhyillä etäisyyksillä).
 * @param {{lat:number,lng:number}} point
 * @param {{lat:number,lng:number}} start
 * @param {{lat:number,lng:number}} end
 * @returns {number} approksimoitu etäisyys metreinä
 */
function perpendicularDistance(point, start, end) {
  if (start.lat === end.lat && start.lng === end.lng) {
    return haversineDistance(point, start);
  }

  // Yksinkertainen tasoprojektio (riittävä pienille etäisyyksille).
  const x = point.lng;
  const y = point.lat;
  const x1 = start.lng;
  const y1 = start.lat;
  const x2 = end.lng;
  const y2 = end.lat;

  const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);
  if (denominator === 0) return haversineDistance(point, start);

  // Muunnetaan asteet karkeasti metreiksi (1 aste leveyspiiriä ~ 111320 m).
  const degToM = 111320;
  return (numerator / denominator) * degToM;
}

/**
 * Douglas-Peucker -algoritmi pistejoukon yksinkertaistamiseksi.
 * @param {Array<{lat:number,lng:number}>} points
 * @param {number} toleranceMeters - kynnysarvo, jonka alle jäävät pisteet karsitaan
 * @returns {Array<{lat:number,lng:number}>}
 */
export function douglasPeucker(points, toleranceMeters = 8) {
  const indices = douglasPeuckerIndices(points, toleranceMeters);
  return indices.map((i) => points[i]);
}

/**
 * Sama kuin douglasPeucker, mutta palauttaa säilytettävien pisteiden
 * INDEKSIT alkuperäisessä points-taulukossa (nousevassa järjestyksessä,
 * aina sisältäen ensimmäisen ja viimeisen). Tätä käytetään kun alkuperäinen
 * tarkka reittigeometria pitää säilyttää karsittujen pisteiden välissä
 * (esim. GPX-tuonnissa, jotta karttaan piirretty viiva seuraa oikeaa
 * kulkureittiä eikä oikaise suorina viivoina pisteiden yli).
 * @param {Array<{lat:number,lng:number}>} points
 * @param {number} toleranceMeters
 * @returns {number[]}
 */
export function douglasPeuckerIndices(points, toleranceMeters = 8) {
  if (!points || points.length < 3) {
    if (!points || points.length === 0) return [];
    return points.map((_, i) => i);
  }

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [startIdx, endIdx] = stack.pop();
    let maxDist = 0;
    let maxIdx = -1;

    for (let i = startIdx + 1; i < endIdx; i++) {
      const dist = perpendicularDistance(points[i], points[startIdx], points[endIdx]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > toleranceMeters && maxIdx !== -1) {
      keep[maxIdx] = true;
      stack.push([startIdx, maxIdx]);
      stack.push([maxIdx, endIdx]);
    }
  }

  const indices = [];
  keep.forEach((k, i) => {
    if (k) indices.push(i);
  });
  return indices;
}

/**
 * Karsii raa'an GPX-jäljen sopivaan määrään editointipisteitä JA palauttaa
 * tiedon siitä, mitkä alkuperäisen jäljen indeksit kukin editointipiste
 * vastaa. Näin kutsuja voi rakentaa jokaiselle kahden peräkkäisen
 * editointipisteen välille segmentin, jonka geometria on alkuperäisen GPX-
 * jäljen tarkka pätkä (ei suora viiva), jolloin karttaan piirretty reitti
 * seuraa täsmälleen alkuperäistä kulkureittiä.
 *
 * @param {Array<{lat:number,lng:number}>} rawPoints
 * @param {number} maxPoints - editointipisteiden yläraja
 * @returns {{points: Array<{lat:number,lng:number}>, indices: number[]}}
 */
export function simplifyForEditing(rawPoints, maxPoints = 30) {
  if (!rawPoints || rawPoints.length === 0) return { points: [], indices: [] };
  if (rawPoints.length === 1) return { points: rawPoints.slice(), indices: [0] };

  let indices = douglasPeuckerIndices(rawPoints, 12);

  if (indices.length > maxPoints) {
    // Karkeampi tasavälinen otanta INDEKSILISTASTA (ei pisteistä suoraan),
    // jotta indeksit pysyvät oikeina ja alkuperäinen geometria on yhä
    // jäljitettävissä jokaisen editointipisteen välissä.
    const step = Math.ceil(indices.length / maxPoints);
    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const sampled = indices.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== lastIdx) sampled.push(lastIdx);
    if (sampled[0] !== firstIdx) sampled.unshift(firstIdx);
    indices = sampled;
  }

  return { points: indices.map((i) => rawPoints[i]), indices };
}

/**
 * Debounce-apuri esim. osoitehaun rajoittamiseen kirjoituksen aikana.
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {Function}
 */
export function debounce(fn, delayMs = 300) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delayMs);
  };
}

/**
 * Generoi yksinkertaisen uniikin id:n.
 * @returns {string}
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
