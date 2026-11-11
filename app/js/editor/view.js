// Darstellung der Zeichnung im SVG-Element: Raster, Bauteile, Leitungen, Verbindungspunkte,
// Auswahl und Hilfsgrafik (Anschlusspunkte, Leitungsvorschau, Auswahlrahmen).
// Bei jeder Änderung wird alles neu gezeichnet – bei Schulschaltungen schnell genug und einfach.

import { CATALOG_BY_ID } from './catalog.js';
import { SYMBOLS, symbolBounds } from './symbols.js';
import { svgTransform, toWorld } from './geometry.js';
import { symbolSVG, INK, INK_SELECTED, esc } from './svg.js';

export const GRID = 20;
const FONT = 'Helvetica, Arial, sans-serif';

export function entryOf(comp) {
  return CATALOG_BY_ID.get(comp.type);
}

export function symbolOf(comp) {
  return SYMBOLS[entryOf(comp).symbol];
}

/** Umrandung eines Bauteils in Zeichnungskoordinaten [x1, y1, x2, y2]. */
export function worldBox(comp) {
  const b = symbolBounds(symbolOf(comp));
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map((p) => toWorld(comp, p));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Beschriftung (Bezeichnung + Wert) neben dem Bauteil – wie SchaltLab:
 * liegende Bauteile oben/unten, stehende rechts daneben.
 */
export function labelLines(comp) {
  const entry = entryOf(comp);
  const texts = [comp.label, entry.text(comp.params)].filter(Boolean);
  if (!texts.length) return [];
  const fs = 13;
  const [x1, y1, x2, y2] = worldBox(comp);
  if (x2 - x1 >= (y2 - y1) * 1.15) {
    const cx = (x1 + x2) / 2;
    const lines = [];
    if (texts[0]) lines.push({ text: texts[0], x: cx, y: y1 - 6, anchor: 'middle', fs });
    if (texts[1]) lines.push({ text: texts[1], x: cx, y: y2 + fs + 2, anchor: 'middle', fs });
    return lines;
  }
  let y = (y1 + y2) / 2 - (texts.length * fs * 1.25) / 2 + fs;
  return texts.map((text) => {
    const line = { text, x: x2 + 8, y, anchor: 'start', fs };
    y += fs * 1.25;
    return line;
  });
}

export class EditorView {
  /** @param {SVGSVGElement} svg */
  constructor(svg) {
    this.svg = svg;
    this.x = 80; // Verschiebung in Bildschirmpixeln
    this.y = 80;
    this.z = 1; // Zoom
  }

  /** Bildschirmposition (Ereignis) → Zeichnungskoordinaten. */
  toWorld(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return [(clientX - r.left - this.x) / this.z, (clientY - r.top - this.y) / this.z];
  }

  zoomAt(clientX, clientY, factor) {
    const r = this.svg.getBoundingClientRect();
    const cx = clientX - r.left;
    const cy = clientY - r.top;
    const z = Math.min(4, Math.max(0.25, this.z * factor));
    this.x = cx - ((cx - this.x) * z) / this.z;
    this.y = cy - ((cy - this.y) * z) / this.z;
    this.z = z;
  }

  /** Ansicht so einstellen, dass die ganze Zeichnung sichtbar ist. */
  fit(doc) {
    const boxes = [...doc.comps.map(worldBox), ...doc.wires.map((w) => {
      const xs = w.pts.map((p) => p[0]);
      const ys = w.pts.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    })];
    const r = this.svg.getBoundingClientRect();
    if (!boxes.length) {
      Object.assign(this, { x: 80, y: 80, z: 1 });
      return;
    }
    const x1 = Math.min(...boxes.map((b) => b[0])) - 60;
    const y1 = Math.min(...boxes.map((b) => b[1])) - 60;
    const x2 = Math.max(...boxes.map((b) => b[2])) + 60;
    const y2 = Math.max(...boxes.map((b) => b[3])) + 60;
    this.z = Math.min(2, Math.max(0.25, Math.min(r.width / (x2 - x1), r.height / (y2 - y1))));
    this.x = (r.width - (x2 - x1) * this.z) / 2 - x1 * this.z;
    this.y = (r.height - (y2 - y1) * this.z) / 2 - y1 * this.z;
  }

  /**
   * Alles zeichnen.
   * @param {object} s Zustand: doc, selection (Set), junctions, overlay (SVG-Text für Hilfsgrafik),
   *                   underlay/annotations (SVG-Text unter bzw. über der Zeichnung, z. B. Messwerte),
   *                   highlight (Set fehlerhafter Bauteile)
   */
  render(s) {
    const r = this.svg.getBoundingClientRect();
    const x0 = -this.x / this.z;
    const y0 = -this.y / this.z;
    let out = `<defs><pattern id="grid" patternUnits="userSpaceOnUse" x="${-GRID / 2}" y="${-GRID / 2}" width="${GRID}" height="${GRID}">` +
      `<circle cx="${GRID / 2}" cy="${GRID / 2}" r="1.3" fill="#cbd5e1"/></pattern></defs>`;
    out += `<g transform="translate(${this.x} ${this.y}) scale(${this.z})">`;
    out += `<rect x="${x0}" y="${y0}" width="${r.width / this.z}" height="${r.height / this.z}" fill="url(#grid)"/>`;
    out += s.underlay ?? '';
    out += sceneSVG(s.doc, { selection: s.selection, highlight: s.highlight, junctions: s.junctions });
    out += s.annotations ?? '';
    out += s.overlay ?? '';
    out += '</g>';
    this.svg.innerHTML = out;
  }
}

/** Die Zeichnung selbst (auch für den Bildexport). */
export function sceneSVG(doc, { selection = new Set(), highlight = new Set(), junctions = [] } = {}) {
  let out = '';
  for (const c of doc.comps) {
    const selected = selection.has(c.id);
    const wrong = highlight.has(c.id);
    const color = wrong ? '#dc2626' : selected ? INK_SELECTED : INK;
    if (selected || wrong) {
      const [x1, y1, x2, y2] = worldBox(c);
      out += `<rect x="${x1 - 6}" y="${y1 - 6}" width="${x2 - x1 + 12}" height="${y2 - y1 + 12}" rx="4" ` +
        `fill="${wrong ? 'rgba(220,38,38,0.08)' : 'rgba(37,99,235,0.07)'}" stroke="${color}" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    const entry = entryOf(c);
    const closed = entry.closed?.(c.params) ?? false;
    out += `<g transform="${svgTransform(c)}">${symbolSVG(symbolOf(c), { color, closed })}</g>`;
    for (const l of labelLines(c)) {
      out += `<text x="${l.x}" y="${l.y}" font-size="${l.fs}" font-family="${FONT}" text-anchor="${l.anchor}" fill="${INK}">${esc(l.text)}</text>`;
    }
  }
  for (const w of doc.wires) {
    const selected = selection.has(w.id);
    out += `<polyline points="${w.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${selected ? INK_SELECTED : INK}" ` +
      `stroke-width="${selected ? 2.5 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  for (const [x, y] of junctions) out += `<circle cx="${x}" cy="${y}" r="4" fill="${INK}"/>`;
  return out;
}
