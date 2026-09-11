// js/gpx.js
// GPX-tuonti (parsinta + karsinta editointipisteiksi) ja GPX-vienti (lataus).

import { simplifyForEditing } from "./utils.js";

/**
 * Lukee File-olion tekstinä Promise-pohjaisesti.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Parsii yhden GPX-tiedoston sisällön raa'oiksi koordinaattipisteiksi.
 * Tukee sekä <trkpt> että <rtept> -elementtejä.
 * @param {string} xmlText
 * @returns {Array<{lat:number,lng:number}>}
 */
function parseGpxXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const errorNode = doc.querySelector("parsererror");
  if (errorNode) {
    throw new Error("GPX-tiedoston jäsennys epäonnistui.");
  }

  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length === 0) {
    nodes = Array.from(doc.getElementsByTagName("rtept"));
  }
  if (nodes.length === 0) {
    nodes = Array.from(doc.getElementsByTagName("wpt"));
  }

  return nodes
    .map((node) => {
      const lat = parseFloat(node.getAttribute("lat"));
      const lng = parseFloat(node.getAttribute("lon"));
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
}

/**
 * Yrittää lukea GPX-tiedoston sisältämän nimen (<name>-tagi trk-elementin sisällä).
 * @param {string} xmlText
 * @returns {string|null}
 */
function parseGpxName(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const trk = doc.querySelector("trk > name, metadata > name");
  return trk ? trk.textContent : null;
}

/**
 * Tuo yhden tai useamman GPX-tiedoston, muuntaen jokaisen raa'an jäljen
 * karsituksi, muokattavaksi reittipistejoukoksi. Palauttaa myös
 * alkuperäisen (raa'an) pistejoukon jokaiselle tiedostolle, jotta karttaan
 * piirrettävä viiva voidaan rakentaa alkuperäisen jäljen tarkasta
 * geometriasta editointipisteiden välissä - eikä oikaista suorina viivoina.
 * @param {FileList|File[]} files
 * @returns {Promise<Array<{
 *   name: string|null,
 *   points: Array<{lat:number,lng:number}>,
 *   rawPoints: Array<{lat:number,lng:number}>,
 *   indices: number[]
 * }>>}
 */
export async function importGpxFiles(files) {
  const results = [];

  for (const file of Array.from(files)) {
    try {
      const text = await readFileAsText(file);
      const rawPoints = parseGpxXml(text);
      if (rawPoints.length === 0) continue;

      const { points: editablePoints, indices } = simplifyForEditing(rawPoints, 30);
      const name = parseGpxName(text);

      results.push({ name, points: editablePoints, rawPoints, indices });
    } catch (err) {
      console.error("GPX-tuonti epäonnistui tiedostolle " + file.name, err);
    }
  }

  return results;
}

/**
 * Rakentaa GPX 1.1 -yhteensopivan XML-merkkijonon annetuista pisteistä.
 * @param {Array<{lat:number,lng:number}>} points
 * @param {string} routeName
 * @returns {string}
 */
export function buildGpxXml(points, routeName) {
  const safeName = (routeName || "Route").replace(/[<>&]/g, "");

  const trkpts = points
    .map((p) => `      <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Reittisuunnittelu" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Käynnistää GPX-tiedoston latauksen laitteen Downloads-hakemistoon.
 * @param {Array<{lat:number,lng:number}>} points
 * @param {string} routeName
 */
export function downloadGpx(points, routeName) {
  const xml = buildGpxXml(points, routeName);
  const blob = new Blob([xml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  const safeFileName = (routeName || "route").trim().replace(/[^a-zA-Z0-9_\-äöåÄÖÅ ]/g, "") || "route";

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
