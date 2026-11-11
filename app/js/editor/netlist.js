// Aus der Zeichnung die Schaltung für den Simulationskern bauen.
//
// Verbindungsregeln (wie SchaltLab):
//   - Punkte eines Linienzugs sind verbunden.
//   - Ein Leitungsende oder ein Anschluss, der auf einer anderen Leitung liegt, ist mit ihr verbunden
//     (T-Verbindung, dort zeichnet der Editor einen Verbindungspunkt).
//   - Leitungen, die sich nur kreuzen, sind NICHT verbunden.
//   - Anschlüsse an derselben Stelle sind verbunden.
// Knoten mit Massesymbol heißen '0'. Fehlt die Masse, wird der Minuspol der ersten Quelle zum Bezug.

import { CATALOG_BY_ID } from './catalog.js';
import { onSegment } from './geometry.js';

const key = ([x, y]) => `${x},${y}`;
const NEGATIVE_PIN = { battery: '−', powerSupply: '−', sine: '2', square: '2', solar: '−', currentSource: '1' };

/** Union-Find über Punkt-Schlüssel. */
class Groups {
  parent = new Map();
  find(a) {
    if (!this.parent.has(a)) this.parent.set(a, a);
    let r = a;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    this.parent.set(a, r);
    return r;
  }
  union(a, b) {
    this.parent.set(this.find(a), this.find(b));
  }
}

/**
 * @param {import('./document.js').SchematicDocument} doc
 * @returns {{
 *   netlist: {elements: object[]},
 *   pinNets: Map<string, Record<string, string>>,  // Bauteil-ID → Anschluss → Knotenname
 *   junctions: number[][],                         // Punkte für Verbindungspunkte
 *   skipped: string[],                             // Bezeichnungen nicht angeschlossener Bauteile
 *   reference: string | null,                      // Hinweis, wenn der Bezugspunkt automatisch gewählt wurde
 * }}
 */
export function buildNetlist(doc) {
  const groups = new Groups();
  const pins = doc.comps.map((c) => ({ comp: c, pins: doc.pins(c) }));

  // 1. Verbinden: Punkte eines Linienzugs; Leitungsenden und Anschlüsse, die auf einer Leitung liegen
  for (const w of doc.wires) {
    for (let i = 1; i < w.pts.length; i++) groups.union(key(w.pts[i - 1]), key(w.pts[i]));
  }
  const pinPoints = pins.flatMap(({ pins: ps }) => ps.map((p) => [p.x, p.y]));
  const touchPoints = [...doc.wires.flatMap((w) => [w.pts[0], w.pts.at(-1)]), ...pinPoints];
  const throughPoints = new Set(); // Punkt liegt mitten auf einer Strecke (zählt für den Verbindungspunkt)
  for (const pt of touchPoints) {
    groups.find(key(pt));
    for (const w of doc.wires) {
      for (let i = 1; i < w.pts.length; i++) {
        if (!onSegment(pt, w.pts[i - 1], w.pts[i])) continue;
        groups.union(key(pt), key(w.pts[i - 1]));
        if (key(pt) !== key(w.pts[i - 1]) && key(pt) !== key(w.pts[i])) throughPoints.add(`${key(pt)}|${w.id}:${i}`);
      }
    }
  }

  // 2. Verbindungspunkte: Wie viele Leitungsarme und Anschlüsse treffen sich an einem Punkt?
  //    Leitungsende 1 Arm, Knick 2 Arme, Leitung läuft durch 2 Arme, Anschluss 1 – ab 3 ein Punkt.
  const degree = new Map();
  const bump = (k, n) => degree.set(k, (degree.get(k) ?? 0) + n);
  for (const w of doc.wires) w.pts.forEach((p, i) => bump(key(p), (i > 0) + (i < w.pts.length - 1)));
  for (const t of throughPoints) bump(t.split('|')[0], 2);
  for (const p of pinPoints) bump(key(p), 1);

  // 3. Wie viele Anschlüsse hängen an jeder Gruppe? (nicht angeschlossene Bauteile erkennen)
  const pinCount = new Map();
  const wired = new Set(doc.wires.flatMap((w) => w.pts.map(key)).map((k) => groups.find(k)));
  for (const p of pinPoints) {
    const g = groups.find(key(p));
    pinCount.set(g, (pinCount.get(g) ?? 0) + 1);
  }
  const connected = (p) => {
    const g = groups.find(key([p.x, p.y]));
    return wired.has(g) || pinCount.get(g) > 1;
  };

  // 4. Masse und Knotennamen
  const groundGroups = new Set(
    pins.filter(({ comp }) => comp.type === 'gnd').flatMap(({ pins: ps }) => ps.map((p) => groups.find(key([p.x, p.y])))),
  );
  let reference = null;
  if (groundGroups.size === 0) {
    const source = pins.find(({ comp, pins: ps }) => NEGATIVE_PIN[comp.type] && ps.some(connected));
    const fallback = source ?? pins.find(({ comp, pins: ps }) => comp.type !== 'gnd' && ps.some(connected));
    if (fallback) {
      const pinName = NEGATIVE_PIN[fallback.comp.type] ?? fallback.pins[0].name;
      const p = fallback.pins.find((q) => q.name === pinName) ?? fallback.pins[0];
      groundGroups.add(groups.find(key([p.x, p.y])));
      reference = `Kein Massesymbol: Bezugspunkt (0 V) ist Anschluss ${p.name} von ${fallback.comp.label}.`;
    }
  }
  const names = new Map();
  let counter = 0;
  const netName = (pt) => {
    const g = groups.find(key(pt));
    if (groundGroups.has(g)) return '0';
    if (!names.has(g)) names.set(g, `N${++counter}`);
    return names.get(g);
  };

  // 5. Elemente
  const elements = [];
  const pinNets = new Map();
  const skipped = [];
  for (const { comp, pins: ps } of pins) {
    if (comp.type === 'gnd') continue;
    if (!ps.some(connected)) {
      skipped.push(comp.label || comp.type);
      continue;
    }
    const map = Object.fromEntries(ps.map((p) => [p.name, netName([p.x, p.y])]));
    pinNets.set(comp.id, map);
    const entry = CATALOG_BY_ID.get(comp.type);
    elements.push(...entry.elements(comp.params, (pinName) => map[pinName], comp.label || comp.id));
  }

  const junctions = [...degree].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
  return { netlist: { elements }, pinNets, junctions, skipped, reference };
}
