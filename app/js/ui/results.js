// Simulieren (Arbeitspunkt) und Ergebnisse an den Bauteilen anzeigen.
//
// Anzeige je Bauteil: Spannung (blau) und Strom (orange) als Beträge; LEDs leuchten je nach Strom,
// Glühlampen je nach Fadentemperatur, Motoren zeigen die Drehzahl. Überlastete Bauteile bekommen
// eine Warnung (Grenzwerte aus der Bibliothek).

import { operatingPoint } from '../engine/dc.js';
import { transient, valueAt } from '../engine/transient.js';
import { CircuitError } from '../engine/errors.js';
import { Lamp } from '../engine/elements/lamp.js';
import { Motor } from '../engine/elements/motor.js';
import { buildNetlist } from '../editor/netlist.js';
import { labelLines, worldBox, entryOf } from '../editor/view.js';
import { formatValue } from './units.js';
import { esc } from '../editor/svg.js';
import { LEDS, DIODES } from '../library/diodes.js';
import { BATTERIES } from '../library/batteries.js';
import { LAMPS } from '../library/lamps.js';
import { MOTORS } from '../library/motors.js';
import { TRANSISTORS } from '../library/transistors.js';
import { MOSFETS } from '../library/mosfets.js';

const VOLTAGE = '#2563eb';
const CURRENT = '#ea580c';
const WARN = '#dc2626';
const FONT = 'Helvetica, Arial, sans-serif';

// Anzeige wie ein Schulmultimeter: Winzige Werte (z. B. Isolationsstrom eines offenen Schalters über
// 1 GΩ) erscheinen als 0 – die Rechnung selbst bleibt unverändert.
const showU = (u) => formatValue(Math.abs(u) < 1e-4 ? 0 : Math.abs(u), 'V');
const showI = (i) => formatValue(Math.abs(i) < 1e-7 ? 0 : Math.abs(i), 'A');
const showPotential = (phi) => formatValue(Math.abs(phi) < 1e-4 ? 0 : phi, 'V'); // mit Vorzeichen

/** Bezeichnung der Messgrößen je Bauteiltyp. */
const QUANTITIES = { npn: ['U_CE', 'I_C'], pnp: ['U_CE', 'I_C'], nmos: ['U_DS', 'I_D'], pmos: ['U_DS', 'I_D'], opamp: ['U_A', 'I_A'] };

/**
 * Berechnet die Schaltung: Arbeitspunkt oder – mit tran – den Zeitverlauf für das Oszilloskop.
 * @param {object} [tran]  { stopTime, discharged }  discharged: Kondensatoren zu Beginn entladen
 * @returns {{ ok: true, result, built, transient? } | { ok: false, message: string, highlight: Set<string> }}
 *   result ist immer eine Momentaufnahme wie beim Arbeitspunkt (im Zeitbereich: am Ende),
 *   transient der ganze Zeitverlauf.
 */
export function simulate(doc, tran = null) {
  const built = buildNetlist(doc);
  if (built.netlist.elements.length === 0) {
    return { ok: false, message: 'Es gibt noch keine verbundenen Bauteile. Ziehe Bauteile auf die Fläche und verbinde sie mit Leitungen.', highlight: new Set() };
  }
  try {
    if (!tran) return { ok: true, result: operatingPoint(built.netlist), built };
    const tr = transient(built.netlist, { stopTime: tran.stopTime, step: tran.stopTime / 1000, useInitialConditions: tran.discharged });
    return { ok: true, result: snapshotAt(tr, tran.stopTime), built, transient: tr };
  } catch (err) {
    return { ok: false, ...explainError(doc, err) };
  }
}

/** Momentaufnahme eines Zeitverlaufs zur Zeit t – aufgebaut wie das Ergebnis eines Arbeitspunkts. */
export function snapshotAt(tr, t) {
  const potentials = Object.fromEntries(Object.entries(tr.potentials).map(([n, v]) => [n, valueAt(tr.time, v, t)]));
  const elements = Object.fromEntries(Object.entries(tr.elements).map(([name, s]) => {
    const U = valueAt(tr.time, s.U, t);
    const I = valueAt(tr.time, s.I, t);
    return [name, { U, I, P: U * I }];
  }));
  return { potentials, elements };
}

/** Frequenzen der Quellen in der Zeichnung (für die automatische Zeitbasis). */
export function sourceFrequencies(doc) {
  return doc.comps.filter((c) => c.type === 'sine' || c.type === 'square').map((c) => c.params.frequency);
}

/** Fehler des Simulationskerns → Meldung mit Bauteilnamen und zu markierende Bauteile. */
function explainError(doc, err) {
  if (!(err instanceof CircuitError)) throw err;
  // Elementnamen (z. B. „Tr1:primär“) auf Bauteile der Zeichnung abbilden
  const labels = [...new Set(err.elements.map((n) => n.split(':')[0]))];
  const highlight = new Set(doc.comps.filter((c) => labels.includes(c.label) || labels.includes(c.id)).map((c) => c.id));
  // interne Knotennamen (N1, N2 …) sieht man in der Zeichnung nicht → angeschlossene Bauteile nennen
  const where = labels.length > 1 ? `an der Leitung zwischen ${labels.slice(0, -1).join(', ')} und ${labels.at(-1)}` : `an ${labels[0] ?? 'einer Leitung'}`;
  const message = err.message.replace(/am Knoten „N\d+“/, where);
  return { message, highlight };
}

/** Messwerte eines Bauteils (Beträge) und Zusatzangaben. */
function readings(comp, result) {
  const name = comp.label || comp.id;
  const el = result.elements[name];
  if (comp.type === 'transformer') {
    const p = result.elements[`${name}:primär`];
    const s = result.elements[`${name}:sekundär`];
    return { lines: [[`U₁ = ${showU(p.U)}`, VOLTAGE], [`U₂ = ${showU(s.U)}`, VOLTAGE]] };
  }
  if (!el) return null;
  const entry = entryOf(comp);
  if (entry.instrument) {
    // Messgerät: Anzeige mit Vorzeichen wie ein Multimeter (Pluspol = linker Anschluss); immer sichtbar
    const reading = entry.instrument === 'U' ? showPotential(el.U) : formatValue(Math.abs(el.I) < 1e-7 ? 0 : el.I, 'A');
    const warnings = [];
    if (entry.instrument === 'I' && Math.abs(el.I) > 3) warnings.push('⚠ sehr großer Strom – Strommesser parallel geschaltet?');
    if (entry.instrument === 'I' && Math.abs(el.I) > 10) warnings.push('⚠ Messbereich (10 A) überschritten');
    return { lines: [], display: [`${reading}`, entry.instrument === 'U' ? VOLTAGE : CURRENT], warnings };
  }
  const [uName, iName] = QUANTITIES[comp.type] ?? ['U', 'I'];
  const out = {
    lines: [[`${uName} = ${showU(el.U)}`, VOLTAGE], [`${iName} = ${showI(el.I)}`, CURRENT]],
    warnings: [],
  };
  const p = comp.params;
  const imax = { led: LEDS[p.type]?.Imax, diode: DIODES[p.type]?.Imax, npn: TRANSISTORS[p.type]?.Imax, pnp: TRANSISTORS[p.type]?.Imax,
    nmos: MOSFETS[p.type]?.Imax, pmos: MOSFETS[p.type]?.Imax }[comp.type];
  if (imax && Math.abs(el.I) > imax) out.warnings.push(`⚠ zu viel Strom (max. ${formatValue(imax, 'A')})`);
  if (comp.type === 'battery') {
    // ab einem Viertel des Kurzschlussstroms U0/Ri wird die Batterie spürbar warm
    const { voltage, internalResistance } = BATTERIES[p.type];
    if (Math.abs(el.I) > (0.25 * voltage) / internalResistance) out.warnings.push('⚠ Kurzschluss – Batterie wird heiß');
  }
  if (comp.type === 'powerSupply' && Math.abs(el.I) > 3) out.warnings.push('⚠ Netzgerät überlastet (über 3 A)');
  if (comp.type === 'led') out.glow = { color: LEDS[p.type].color, level: Math.min(1, Math.max(0, el.I) / 0.02) };
  if (comp.type === 'lamp') {
    const lamp = new Lamp({ name: 'x', nodes: ['a', 'b'], ...LAMPS[p.type] });
    const T = lamp.temperatureAt(Math.abs(el.U));
    out.glow = { color: '#facc15', level: Math.min(1, Math.max(0, (T - 900) / 1800)) }; // sichtbares Glühen ab etwa 900 K
    if (Math.abs(el.U) > 1.1 * LAMPS[p.type].ratedVoltage) out.warnings.push('⚠ Überspannung – Lampe brennt durch');
  }
  if (comp.type === 'motor') {
    const motor = new Motor({ name: 'x', nodes: ['a', 'b'], ...MOTORS[p.type] });
    const omega = (el.U - motor.resistance * el.I) / motor.k;
    out.lines.push([`n = ${Math.round(Math.abs((omega * 60) / (2 * Math.PI)))} 1/min`, '#0f172a']);
  }
  return out;
}

/**
 * SVG-Text der Messwerte.
 * @returns {{under: string, over: string}} under: Leuchten hinter den Schaltzeichen, over: Messwerte darüber
 */
export function annotationsSVG(doc, result, { showAll = false } = {}) {
  let s = '';
  let under = '';
  for (const comp of doc.comps) {
    const r = readings(comp, result);
    if (!r) continue;
    const [x1, y1, x2, y2] = worldBox(comp);
    if (r.glow?.level > 0.02) {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      under += `<circle cx="${cx}" cy="${cy}" r="${16 + 14 * r.glow.level}" fill="${r.glow.color}" opacity="${0.15 + 0.45 * r.glow.level}"/>`;
    }
    const labels = labelLines(comp);
    const last = labels.at(-1);
    const horizontal = x2 - x1 >= (y2 - y1) * 1.15;
    let x = last ? last.x : horizontal ? (x1 + x2) / 2 : x2 + 8;
    let y = last ? last.y + 15 : horizontal ? y2 + 16 : (y1 + y2) / 2;
    const anchor = last?.anchor ?? (horizontal ? 'middle' : 'start');
    if (r.display) {
      // Anzeige des Messgeräts als kleines „Display“ über dem Symbol
      const [text, color] = r.display;
      const w = 14 + text.length * 8;
      const cx = (x1 + x2) / 2;
      s += `<rect x="${cx - w / 2}" y="${y1 - 30}" width="${w}" height="22" rx="4" fill="#0f172a"/>` +
        `<text x="${cx}" y="${y1 - 14}" font-size="14" font-weight="bold" font-family="${FONT}" text-anchor="middle" fill="${color === VOLTAGE ? '#93c5fd' : '#fdba74'}" pointer-events="none">${esc(text)}</text>`;
    }
    // Messwerte nur auf Wunsch („Alle Werte“), Warnungen immer
    const rows = [...(showAll ? r.lines : []), ...(r.warnings ?? []).map((w) => [w, WARN])];
    for (const [text, color] of rows) {
      s += `<text x="${x}" y="${y}" font-size="12" font-weight="bold" font-family="${FONT}" text-anchor="${anchor}" fill="${color}" pointer-events="none">${esc(text)}</text>`;
      y += 14;
    }
  }
  return { under, over: s };
}

/** Potenzial eines Knotens gegen Masse (0 V), wie ein Spannungsmesser mit schwarzer Leitung an Masse. */
const potentialOf = (result, net) => (net === '0' ? 0 : result.potentials[net]);

/** Messwerte für die Fähnchen der Messpunkte: Map Messpunkt-ID → „4,85 V“ (– = nicht angeschlossen). */
export function probeValues(doc, sim) {
  const values = new Map();
  for (const p of doc.probes) {
    const net = sim.built.probeNets.get(p.id);
    const phi = net === null ? undefined : potentialOf(sim.result, net);
    values.set(p.id, phi === undefined ? '–' : showPotential(phi));
  }
  return values;
}

/**
 * Hinweistext beim Überfahren: Leitung → Potenzial, Bauteil → Name und (nach dem Simulieren) U und I.
 * @param {object|null} sim  letztes erfolgreiches Simulationsergebnis
 */
export function describe(target, sim) {
  if (target.kind === 'wire') {
    if (!sim) return null;
    const phi = potentialOf(sim.result, sim.built.wireNets.get(target.wire.id));
    return phi === undefined ? null : [`φ = ${showPotential(phi)} (gegen Masse)`];
  }
  const comp = target.comp;
  const entry = entryOf(comp);
  const head = `${comp.label ? `${comp.label} – ` : ''}${entry.name}`;
  if (!sim) return [head];
  const r = readings(comp, sim.result);
  return [head, ...(r?.lines.map(([text]) => text) ?? []), ...(r?.display ? [`Anzeige: ${r.display[0]}`] : [])];
}
