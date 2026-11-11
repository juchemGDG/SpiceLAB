// Simulieren (Arbeitspunkt) und Ergebnisse an den Bauteilen anzeigen.
//
// Anzeige je Bauteil: Spannung (blau) und Strom (orange) als Beträge; LEDs leuchten je nach Strom,
// Glühlampen je nach Fadentemperatur, Motoren zeigen die Drehzahl. Überlastete Bauteile bekommen
// eine Warnung (Grenzwerte aus der Bibliothek).

import { operatingPoint } from '../engine/dc.js';
import { CircuitError } from '../engine/errors.js';
import { Lamp } from '../engine/elements/lamp.js';
import { Motor } from '../engine/elements/motor.js';
import { buildNetlist } from '../editor/netlist.js';
import { labelLines, worldBox } from '../editor/view.js';
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

/** Bezeichnung der Messgrößen je Bauteiltyp. */
const QUANTITIES = { npn: ['U_CE', 'I_C'], pnp: ['U_CE', 'I_C'], nmos: ['U_DS', 'I_D'], pmos: ['U_DS', 'I_D'], opamp: ['U_A', 'I_A'] };

/**
 * Berechnet den Arbeitspunkt der Zeichnung.
 * @returns {{ ok: true, result, built } | { ok: false, message: string, highlight: Set<string> }}
 */
export function simulate(doc) {
  const built = buildNetlist(doc);
  if (built.netlist.elements.length === 0) {
    return { ok: false, message: 'Es gibt noch keine verbundenen Bauteile. Ziehe Bauteile auf die Fläche und verbinde sie mit Leitungen.', highlight: new Set() };
  }
  try {
    return { ok: true, result: operatingPoint(built.netlist), built };
  } catch (err) {
    if (!(err instanceof CircuitError)) throw err;
    // Elementnamen (z. B. „Tr1:primär“) auf Bauteile der Zeichnung abbilden
    const labels = [...new Set(err.elements.map((n) => n.split(':')[0]))];
    const highlight = new Set(doc.comps.filter((c) => labels.includes(c.label) || labels.includes(c.id)).map((c) => c.id));
    // interne Knotennamen (N1, N2 …) sieht man in der Zeichnung nicht → angeschlossene Bauteile nennen
    const where = labels.length > 1 ? `an der Leitung zwischen ${labels.slice(0, -1).join(', ')} und ${labels.at(-1)}` : `an ${labels[0] ?? 'einer Leitung'}`;
    const message = err.message.replace(/am Knoten „N\d+“/, where);
    return { ok: false, message, highlight };
  }
}

/** Messwerte eines Bauteils (Beträge) und Zusatzangaben. */
function readings(comp, result) {
  const name = comp.label || comp.id;
  const el = result.elements[name];
  if (comp.type === 'transformer') {
    const p = result.elements[`${name}:primär`];
    const s = result.elements[`${name}:sekundär`];
    return { lines: [[`U₁ = ${formatValue(Math.abs(p.U), 'V')}`, VOLTAGE], [`U₂ = ${formatValue(Math.abs(s.U), 'V')}`, VOLTAGE]] };
  }
  if (!el) return null;
  const [uName, iName] = QUANTITIES[comp.type] ?? ['U', 'I'];
  const out = {
    lines: [[`${uName} = ${formatValue(Math.abs(el.U), 'V')}`, VOLTAGE], [`${iName} = ${formatValue(Math.abs(el.I), 'A')}`, CURRENT]],
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
export function annotationsSVG(doc, result) {
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
    const rows = [...r.lines, ...(r.warnings ?? []).map((w) => [w, WARN])];
    for (const [text, color] of rows) {
      s += `<text x="${x}" y="${y}" font-size="12" font-weight="bold" font-family="${FONT}" text-anchor="${anchor}" fill="${color}" pointer-events="none">${esc(text)}</text>`;
      y += 14;
    }
  }
  return { under, over: s };
}
