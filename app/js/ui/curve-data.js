// Kennlinienschreiber: Rechenlogik (ohne Zeichnen). Eine Größe (z. B. die Spannung einer Quelle) wird
// schrittweise durchgefahren, für jeden Wert der Arbeitspunkt berechnet und eine Größe gegen eine
// andere aufgetragen – wie im Labor mit Netzgerät, Spannungs- und Strommesser.

import { dcSweep } from '../engine/sweep.js';
import { operatingPoint } from '../engine/dc.js';
import { CircuitError } from '../engine/errors.js';
import { buildNetlist } from '../editor/netlist.js';
import { CATALOG_BY_ID } from '../editor/catalog.js';
import { entryOf } from '../editor/view.js';

const nameOf = (comp) => comp.label || comp.id;
const MEASURABLE = (comp) => {
  const e = entryOf(comp);
  return !e.ground && !e.internallyConnected && e.id !== 'transformer' && e.id !== 'opamp';
};

/** Bauteile, deren Wert durchgefahren werden kann (Quellen, Poti, LDR, NTC, Solarzelle). */
export function sweepSources(doc) {
  return doc.comps.filter((c) => entryOf(c).sweep).map((c) => ({ comp: c, ...entryOf(c).sweep, name: nameOf(c) }));
}

/** Messgrößen: [{ id, label, unit }] – Quellenwert, Spannung und Strom der Bauteile, Potenziale der Messpunkte. */
export function quantities(doc, source) {
  const out = [{ id: 'sweep', label: `${source.label} von ${source.name}`, unit: source.unit }];
  for (const c of doc.comps.filter(MEASURABLE)) {
    const name = nameOf(c);
    out.push({ id: `U:${name}`, label: `Spannung an ${name}`, unit: 'V' }, { id: `I:${name}`, label: `Strom durch ${name}`, unit: 'A' });
  }
  for (const p of doc.probes) out.push({ id: `P:${p.id}`, label: `Potenzial ${p.label}`, unit: 'V' });
  return out;
}

/**
 * Sinnvolle Voreinstellung: Spannung am „interessantesten“ Bauteil gegen seinen Strom –
 * Halbleiter und Lampen vor Widerständen (Dioden-, LED-, Lampenkennlinie).
 */
export function defaultAxes(doc, source) {
  const candidates = doc.comps.filter((c) => MEASURABLE(c) && c !== source.comp && !entryOf(c).sweep && !entryOf(c).instrument);
  const device = candidates.find((c) => entryOf(c).cat === 'Halbleiter' || c.type === 'lamp')
    ?? candidates[0] ?? doc.comps.find((c) => MEASURABLE(c) && c !== source.comp);
  if (!device) return { x: 'sweep', y: `I:${nameOf(source.comp)}` };
  return { x: `U:${nameOf(device)}`, y: `I:${nameOf(device)}` };
}

/** Lesefunktion für eine Messgröße aus dem Sweep-Ergebnis. */
function reader(id, sweep, built, shown) {
  if (id === 'sweep') return (k) => shown[k];
  const [kind, key] = [id[0], id.slice(2)];
  if (kind === 'P') {
    const net = built.probeNets.get(key);
    return (k) => (net === null ? NaN : net === '0' ? 0 : sweep.potentials[net][k]);
  }
  const el = sweep.elements[key];
  if (!el) throw new CircuitError(`Für „${key}“ gibt es keine Messwerte (nicht angeschlossen?).`);
  return (k) => el[kind][k];
}

/**
 * Kennlinie berechnen.
 * @param {object} p  { sourceId, from, to, points, x, y } (x, y: Messgrößen-Kennungen)
 * @returns {{ x: number[], y: number[], marker: {x, y}|null }}
 * @throws {CircuitError}
 */
export function characteristic(doc, { sourceId, from, to, points = 100, x, y }) {
  const source = sweepSources(doc).find((s) => s.comp.id === sourceId);
  if (!source) throw new CircuitError('Wähle ein Bauteil, dessen Wert durchgefahren werden soll (z. B. ein Netzgerät).');
  if (!(points >= 2) || !Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    throw new CircuitError('Von und Bis müssen verschiedene Zahlen sein.');
  }
  const built = buildNetlist(doc);
  const scale = typeof source.scale === 'function' ? source.scale(source.comp.params) : source.scale ?? 1;
  const floor = source.min ?? -Infinity;
  const shown = Array.from({ length: points }, (_, k) => Math.max(floor, from + ((to - from) * k) / (points - 1)));
  // beim Durchfahren wird ein Kennwert des Bauteils in der Netzliste ersetzt (z. B. voltage, illuminance)
  const sweep = dcSweep(built.netlist, { element: source.name + (source.elementSuffix ?? ''), parameter: source.param, values: shown.map((v) => v * scale) });
  const gx = reader(x, sweep, built, shown);
  const gy = reader(y, sweep, built, shown);
  const xs = shown.map((_, k) => gx(k));
  const ys = shown.map((_, k) => gy(k));

  // Arbeitspunkt der Schaltung (aktueller Wert des Bauteils) als Marke
  let marker = null;
  try {
    const spec = built.netlist.elements.find((e) => e.name === source.name + (source.elementSuffix ?? ''));
    const now = spec[source.param] / scale;
    const op = operatingPoint(built.netlist);
    const at = (id) => {
      if (id === 'sweep') return now;
      const [kind, key] = [id[0], id.slice(2)];
      if (kind === 'P') {
        const net = built.probeNets.get(key);
        return net === null ? null : net === '0' ? 0 : op.potentials[net];
      }
      return op.elements[key]?.[kind] ?? null;
    };
    const mx = at(x);
    const my = at(y);
    if (Number.isFinite(mx) && Number.isFinite(my)) marker = { x: mx, y: my };
  } catch { /* ohne Marke weiter */ }
  return { x: xs, y: ys, marker };
}
