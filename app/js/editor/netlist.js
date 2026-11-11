// Aus der Zeichnung die Schaltung für den Simulationskern bauen.
//
// Verbindungsregeln (wie SchaltLab):
//   - Punkte eines Linienzugs sind verbunden.
//   - Ein Leitungsende oder ein Anschluss, der auf einer anderen Leitung liegt, ist mit ihr verbunden
//     (T-Verbindung, dort zeichnet der Editor einen Verbindungspunkt).
//   - Leitungen, die sich nur kreuzen, sind NICHT verbunden.
//   - Anschlüsse an derselben Stelle sind verbunden.
// Knoten mit Massesymbol heißen '0'. Jeder galvanisch getrennte Teil ohne Masse bekommt den Minuspol
// seiner ersten Quelle als Bezug; Teile ganz ohne Quelle werden übersprungen.

import { CATALOG_BY_ID } from './catalog.js';
import { onSegment } from './geometry.js';

const key = ([x, y]) => `${x},${y}`;

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
 *   pinNets: Map<string, Record<string, string>>,  // Bauteil-ID → Anschluss → Knotenname (alle angeschlossenen)
 *   probeNets: Map<string, string|null>,           // Messpunkt-ID → Knotenname (null: nirgends angeschlossen)
 *   wireNets: Map<string, string>,                 // Leitungs-ID → Knotenname
 *   junctions: number[][],                         // Punkte für Verbindungspunkte
 *   skipped: string[],                             // Bezeichnungen nicht angeschlossener Bauteile
 *   isolated: string[],                            // Bauteile in Teilen ohne Quelle (übersprungen)
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

  // Messpunkte gehören zu der Leitung, auf der sie liegen (sie zählen nicht als Leitungsarm)
  const probes = doc.probes ?? [];
  for (const pr of probes) {
    const pt = [pr.x, pr.y];
    groups.find(key(pt));
    for (const w of doc.wires) {
      for (let i = 1; i < w.pts.length; i++) if (onSegment(pt, w.pts[i - 1], w.pts[i])) groups.union(key(pt), key(w.pts[i - 1]));
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

  // 4. Knotennamen: Gruppen mit Massesymbol heißen '0', die übrigen N1, N2, …
  const groundGroups = new Set(
    pins.filter(({ comp }) => comp.type === 'gnd').flatMap(({ pins: ps }) => ps.map((p) => groups.find(key([p.x, p.y])))),
  );
  const names = new Map();
  let counter = 0;
  const netName = (pt) => {
    const g = groups.find(key(pt));
    if (groundGroups.has(g)) return '0';
    if (!names.has(g)) names.set(g, `N${++counter}`);
    return names.get(g);
  };

  // 5. Angeschlossene Bauteile und ihre Knoten (nicht angeschlossene werden übersprungen)
  const skipped = [];
  const placed = [];
  for (const { comp, pins: ps } of pins) {
    if (comp.type === 'gnd') continue;
    if (!ps.some(connected)) skipped.push(comp.label || comp.type);
    else placed.push({ comp, entry: CATALOG_BY_ID.get(comp.type), nets: Object.fromEntries(ps.map((p) => [p.name, netName([p.x, p.y])])) });
  }

  // 6. Galvanisch getrennte Teile („Inseln“). Ohne Masse bekommt eine Insel einen eigenen Bezugspunkt:
  //    den Minuspol ihrer ersten Quelle (oder einen Knoten, wenn sie über einen Transformator versorgt wird).
  //    Inseln ohne jede Quelle werden übersprungen – dort fließt kein Strom.
  const islands = new Groups();
  for (const { entry, nets } of placed) {
    for (const group of entry.galvanic ?? [Object.keys(nets)]) {
      group.forEach((pin) => islands.union(nets[pin], nets[group[0]]));
    }
  }
  const rename = new Map(); // Knoten → '0'
  const references = [];
  const isolated = [];
  const byIsland = new Map();
  for (const p of placed) {
    for (const group of p.entry.galvanic ?? [Object.keys(p.nets)]) {
      const island = islands.find(p.nets[group[0]]);
      if (!byIsland.has(island)) byIsland.set(island, []);
      byIsland.get(island).push({ ...p, group });
    }
  }
  const skippedComps = new Set();
  for (const members of byIsland.values()) {
    const nets = new Set(members.flatMap((m) => m.group.map((pin) => m.nets[pin])));
    if (nets.has('0')) continue;
    const source = members.find((m) => m.entry.source);
    const energized = members.find((m) => m.entry.energizes);
    if (source) {
      rename.set(source.nets[source.entry.source], '0');
      references.push(`Kein Massesymbol: Bezugspunkt (0 V) ist Anschluss ${source.entry.source} von ${source.comp.label}.`);
    } else if (energized) {
      rename.set(energized.nets[energized.group[1]], '0');
    } else {
      members.forEach((m) => skippedComps.add(m.comp));
      isolated.push(...members.map((m) => m.comp.label || m.comp.type));
    }
  }

  // 7. Elemente für den Simulationskern
  const elements = [];
  const pinNets = new Map();
  for (const { comp, entry, nets } of placed) {
    const map = Object.fromEntries(Object.entries(nets).map(([pin, net]) => [pin, rename.get(net) ?? net]));
    pinNets.set(comp.id, map); // auch für übersprungene Teile (Anzeige der Verbindungen)
    if (!skippedComps.has(comp)) elements.push(...entry.elements(comp.params, (pinName) => map[pinName], comp.label || comp.id));
  }

  // 8. Knoten der Messpunkte (null: liegt auf keiner Leitung und keinem Anschluss)
  const probeNets = new Map(probes.map((pr) => {
    const g = groups.find(key([pr.x, pr.y]));
    if (!wired.has(g) && !pinCount.get(g)) return [pr.id, null];
    const net = netName([pr.x, pr.y]);
    return [pr.id, rename.get(net) ?? net];
  }));

  const wireNets = new Map(doc.wires.map((w) => {
    const net = netName(w.pts[0]);
    return [w.id, rename.get(net) ?? net];
  }));

  const junctions = [...degree].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
  return {
    netlist: { elements },
    pinNets,
    probeNets,
    wireNets,
    junctions,
    skipped,
    isolated: [...new Set(isolated)],
    reference: references.length ? references.join(' ') : null,
  };
}
