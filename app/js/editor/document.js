// Die Zeichnung: Bauteile und Leitungen, mit Rückgängig/Wiederholen.
//
//   comps: [{ id, type, label, x, y, rot, mir, params }]   type = Katalog-Kennung
//   wires: [{ id, pts: [[x, y], …] }]                       rechtwinklige Linienzüge
//
// Alle Änderungen laufen über Methoden dieser Klasse; commit() legt einen Rückgängig-Schritt an.
// Keine DOM-Abhängigkeit – die Klasse ist in Node testbar.

import { CATALOG_BY_ID, defaultParams } from './catalog.js';
import { SYMBOLS } from './symbols.js';
import { pinPositions } from './geometry.js';

export const FILE_VERSION = 1;
const HISTORY_LIMIT = 200;
const clone = (o) => JSON.parse(JSON.stringify(o));
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

export class SchematicDocument {
  constructor(data) {
    this.load(data ?? { comps: [], wires: [], n: 0 });
  }

  /** Zeichnung ersetzen (z. B. aus einer Datei); löscht den Verlauf. */
  load(data) {
    this.comps = clone(data.comps ?? []);
    this.wires = clone(data.wires ?? []);
    this.n = data.n ?? 0;
    this.history = [this.#snapshot()];
    this.historyIndex = 0;
  }

  /** Daten zum Speichern. */
  toJSON() {
    return { app: 'SpiceLab', version: FILE_VERSION, comps: this.comps, wires: this.wires, n: this.n };
  }

  // ── Rückgängig / Wiederholen ──

  #snapshot() {
    return JSON.stringify({ comps: this.comps, wires: this.wires, n: this.n });
  }

  /** Aktuellen Stand als Rückgängig-Schritt festhalten (nur wenn sich etwas geändert hat). */
  commit() {
    const snap = this.#snapshot();
    if (snap === this.history[this.historyIndex]) return false;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyIndex = this.history.length - 1;
    return true;
  }

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo) return;
    this.#restore(this.history[--this.historyIndex]);
  }

  redo() {
    if (!this.canRedo) return;
    this.#restore(this.history[++this.historyIndex]);
  }

  #restore(snap) {
    const o = JSON.parse(snap);
    this.comps = o.comps;
    this.wires = o.wires;
    this.n = o.n;
  }

  // ── Bauteile ──

  getComp(id) {
    return this.comps.find((c) => c.id === id);
  }

  /** Nächste freie Bezeichnung zu einem Kürzel, z. B. R3. */
  nextLabel(prefix) {
    if (!prefix) return '';
    const used = new Set(this.comps.map((c) => c.label));
    let k = 1;
    while (used.has(`${prefix}${k}`)) k++;
    return `${prefix}${k}`;
  }

  addComponent(type, x, y) {
    const entry = CATALOG_BY_ID.get(type);
    if (!entry) throw new Error(`Unbekanntes Bauteil ${type}`);
    const comp = { id: `c${++this.n}`, type, label: this.nextLabel(entry.prefix), x, y, rot: 0, mir: false, params: defaultParams(entry) };
    this.comps.push(comp);
    return comp;
  }

  /** Anschlüsse eines Bauteils in Zeichnungskoordinaten. */
  pins(comp) {
    return pinPositions(comp, SYMBOLS[CATALOG_BY_ID.get(comp.type).symbol]);
  }

  /**
   * Bauteile verschieben, drehen oder spiegeln; Leitungsenden an ihren Anschlüssen laufen mit.
   * @param {string[]} ids
   * @param {(comp) => void} change verändert x, y, rot, mir eines Bauteils
   */
  transformComponents(ids, change) {
    const moved = ids.map((id) => this.getComp(id)).filter(Boolean);
    const before = moved.flatMap((c) => this.pins(c).map((p) => ({ comp: c, name: p.name, at: [p.x, p.y] })));
    moved.forEach(change);
    const after = new Map(moved.flatMap((c) => this.pins(c).map((p) => [`${c.id}:${p.name}`, [p.x, p.y]])));
    for (const { comp, name, at } of before) {
      const to = after.get(`${comp.id}:${name}`);
      if (!samePoint(at, to)) this.#moveWireEnds(at, to);
    }
  }

  moveComponents(ids, dx, dy) {
    this.transformComponents(ids, (c) => { c.x += dx; c.y += dy; });
  }

  rotateComponents(ids) {
    this.transformComponents(ids, (c) => { c.rot = ((c.rot ?? 0) + 90) % 360; });
  }

  mirrorComponents(ids) {
    this.transformComponents(ids, (c) => { c.mir = !c.mir; });
  }

  setParams(id, params, label) {
    const comp = this.getComp(id);
    comp.params = { ...comp.params, ...params };
    if (label !== undefined) comp.label = label;
  }

  // ── Leitungen ──

  addWire(pts) {
    const clean = cleanPoints(pts);
    if (clean.length < 2) return null;
    const wire = { id: `w${++this.n}`, pts: clean };
    this.wires.push(wire);
    return wire;
  }

  /** Leitungsenden von `from` nach `to` verlegen; der Nachbarpunkt folgt, damit es rechtwinklig bleibt. */
  #moveWireEnds(from, to) {
    for (const w of this.wires) {
      for (const end of [0, w.pts.length - 1]) {
        if (!samePoint(w.pts[end], from)) continue;
        const nb = end === 0 ? 1 : w.pts.length - 2;
        const [ex, ey] = w.pts[end];
        const [nx, ny] = w.pts[nb];
        if (w.pts.length === 2) {
          // gerade Leitung: Knick einfügen, wenn sie sonst schräg würde
          w.pts[end] = [...to];
          if (to[0] !== w.pts[nb][0] && to[1] !== w.pts[nb][1]) {
            const corner = ey === ny ? [w.pts[nb][0], to[1]] : [to[0], w.pts[nb][1]];
            w.pts.splice(end === 0 ? 1 : w.pts.length - 1, 0, corner);
          }
        } else {
          if (ey === ny) w.pts[nb] = [nx, to[1]]; // waagerechtes Endstück: Nachbar wandert mit in y
          else w.pts[nb] = [to[0], ny]; // senkrechtes Endstück: Nachbar wandert mit in x
          w.pts[end] = [...to];
        }
        w.pts = cleanPoints(w.pts);
      }
    }
    this.wires = this.wires.filter((w) => w.pts.length >= 2);
  }

  // ── Löschen ──

  delete(ids) {
    const set = new Set(ids);
    this.comps = this.comps.filter((c) => !set.has(c.id));
    this.wires = this.wires.filter((w) => !set.has(w.id));
  }
}

/** Doppelte und auf einer Geraden liegende Zwischenpunkte entfernen. */
export function cleanPoints(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length && samePoint(out.at(-1), p)) continue;
    if (out.length >= 2) {
      const [a, b] = [out.at(-2), out.at(-1)];
      const collinear = (a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1]);
      if (collinear) out.pop();
    }
    out.push([p[0], p[1]]);
  }
  return out;
}
