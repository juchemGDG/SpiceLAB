// Bildexport der Zeichnung (SVG und PNG), z. B. für Arbeitsblätter.
// Exportiert wird die Zeichnung mit Messpunkten und – falls simuliert – deren Werten und dem Leuchten;
// Auswahlrahmen und Hilfsgrafik bleiben weg.

import { sceneSVG, worldBox, probeFlag, probeText } from '../editor/view.js';

const MARGIN = 30;

/** Umrandung aller Inhalte [x1, y1, x2, y2] (null bei leerer Zeichnung). */
export function contentBounds(doc, probeValues) {
  const boxes = [
    ...doc.comps.map((c) => {
      const [x1, y1, x2, y2] = worldBox(c);
      return [x1, y1 - 20, x2 + 120, y2 + 34]; // Platz für die Beschriftung
    }),
    ...doc.wires.flatMap((w) => w.pts.map(([x, y]) => [x, y, x, y])),
    ...doc.probes.map((p) => {
      const f = probeFlag(p, probeText(p, probeValues));
      return [p.x - 6, f.y, f.x + f.w, p.y + 6];
    }),
  ];
  if (!boxes.length) return null;
  return [
    Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
  ];
}

/**
 * Vollständige SVG-Datei der Zeichnung.
 * @param {object} extras { junctions, probeValues, underlay, annotations }
 * @returns {{ text: string, width: number, height: number } | null}
 */
export function exportSVG(doc, extras) {
  const b = contentBounds(doc, extras.probeValues);
  if (!b) return null;
  const [x1, y1, x2, y2] = [b[0] - MARGIN, b[1] - MARGIN, b[2] + MARGIN, b[3] + MARGIN];
  const width = Math.ceil(x2 - x1);
  const height = Math.ceil(y2 - y1);
  const body = (extras.underlay ?? '') +
    sceneSVG(doc, { junctions: extras.junctions, probeValues: extras.probeValues }) +
    (extras.annotations ?? '');
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x1} ${y1} ${width} ${height}">` +
    `<rect x="${x1}" y="${y1}" width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  return { text, width, height };
}

/** PNG aus dem SVG (doppelte Auflösung für Ausdrucke). */
export function svgToPng({ text, width, height }, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const g = canvas.getContext('2d');
      g.scale(scale, scale);
      g.drawImage(img, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG konnte nicht erzeugt werden'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Bild konnte nicht erzeugt werden'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  });
}
