// Übersetzt eine SpiceLab-Netzliste in eine ngspice-Netzliste (nur für den Abgleich, Phase 5).
//
// Bauteile ohne SPICE-Gegenstück (Glühlampe, OPV-Verhaltensmodell, Motor) werden abgelehnt.
// Abgeleitete Größen (Solarzelle, LDR, NTC) berechnen die SpiceLab-Klassen selbst, damit beide
// Simulatoren mit genau denselben Zahlen rechnen.

import { Ldr, Ntc } from '../../app/js/engine/elements/sensors.js';
import { SolarCell } from '../../app/js/engine/elements/solar-cell.js';
import { thermalVoltage } from '../../app/js/engine/junction.js';

const GROUND = new Set(['0', 'GND', 'gnd']);
const node = (n) => (GROUND.has(n) ? '0' : n);
const num = (v) => (Number.isFinite(v) ? v.toPrecision(12) : String(v));

function modelParams(model) {
  return Object.entries(model)
    .filter(([, v]) => Number.isFinite(v))
    .map(([k, v]) => `${k}=${num(v)}`)
    .join(' ');
}

function source(e) {
  const w = e.waveform;
  if (!w) return `DC ${num(e.value)}`;
  if (w.shape === 'sine') {
    const { offset, amplitude, frequency, delay = 0, damping = 0, phase = 0 } = w;
    return `DC ${num(offset)} SIN(${[offset, amplitude, frequency, delay, damping, phase].map(num).join(' ')})`;
  }
  const { low, high, delay = 0, rise = 1e-9, fall = 1e-9, width, period } = w;
  const args = [low, high, delay, rise, fall, width, ...(Number.isFinite(period) ? [period] : [])];
  return `DC ${num(low)} PULSE(${args.map(num).join(' ')})`;
}

/**
 * @param {object} netlist SpiceLab-Netzliste
 * @returns {string[]} Zeilen (ohne Titel, Analyse und .end)
 */
export function toSpice(netlist) {
  const lines = [];
  const models = [];
  for (const e of netlist.elements) {
    const [a, b, c] = (e.nodes ?? []).map(node);
    const n = e.name;
    switch (e.type) {
      case 'R':
        lines.push(`R${n} ${a} ${b} ${num(e.value)}`);
        break;
      case 'V':
        lines.push(`V${n} ${a} ${b} ${source(e)}`);
        break;
      case 'I':
        lines.push(`I${n} ${a} ${b} ${source(e)}`);
        break;
      case 'C':
        lines.push(`C${n} ${a} ${b} ${num(e.value)}${e.ic !== undefined ? ` IC=${num(e.ic)}` : ''}`);
        break;
      case 'L': {
        const mid = e.resistance > 0 ? `${n}_r` : b;
        lines.push(`L${n} ${a} ${mid} ${num(e.value)}${e.ic !== undefined ? ` IC=${num(e.ic)}` : ''}`);
        if (e.resistance > 0) lines.push(`R${n}_r ${mid} ${b} ${num(e.resistance)}`);
        break;
      }
      case 'K':
        lines.push(`K${n} L${e.inductors[0]} L${e.inductors[1]} ${num(e.k)}`);
        break;
      case 'D':
        lines.push(`D${n} ${a} ${b} dm_${n}`);
        models.push(`.model dm_${n} D(${modelParams(e.model)})`);
        break;
      case 'BAT': {
        const ri = e.internalResistance ?? 0;
        const mid = ri > 0 ? `${n}_ri` : a;
        lines.push(`V${n} ${mid} ${b} DC ${num(e.voltage)}`);
        if (ri > 0) lines.push(`R${n}_ri ${a} ${mid} ${num(ri)}`);
        break;
      }
      case 'S': // für den Abgleich nur feste Stellung
        if (e.toggleTimes?.length) throw new Error(`${n}: Schaltzeitpunkte werden im Abgleich nicht unterstützt`);
        lines.push(`R${n} ${a} ${b} ${num(e.closed ? e.onResistance ?? 0.01 : e.offResistance ?? 1e9)}`);
        break;
      case 'LDR':
        lines.push(`R${n} ${a} ${b} ${num(Ldr.resistanceFor(e))}`);
        break;
      case 'NTC':
        lines.push(`R${n} ${a} ${b} ${num(Ntc.resistanceFor(e))}`);
        break;
      case 'PV': {
        // Ein-Dioden-Modell aus denselben Zahlen wie SolarCell
        const pv = new SolarCell(e);
        const j = pv.Rs > 0 ? `${n}_j` : a;
        if (pv.Rs > 0) lines.push(`R${n}_s ${a} ${j} ${num(pv.Rs)}`);
        lines.push(`R${n}_p ${j} ${b} ${num(pv.Rp)}`);
        lines.push(`I${n}_ph ${b} ${j} DC ${num(pv.photoCurrent)}`);
        lines.push(`D${n} ${j} ${b} dm_${n}`);
        models.push(`.model dm_${n} D(IS=${num(pv.I0)} N=${num(pv.nVt / thermalVoltage())})`);
        break;
      }
      case 'Q':
        lines.push(`Q${n} ${a} ${b} ${c} qm_${n}`);
        models.push(`.model qm_${n} ${e.polarity === 'pnp' ? 'PNP' : 'NPN'}(${modelParams(e.model)})`);
        break;
      case 'M': {
        // Level 1 mit W = L = 1 m: KP wirkt direkt, CGSO/CGDO (F/m) = CGS/CGD.
        // RD/RS als eigene Widerstände, damit die Bodydiode wie in SpiceLab an den inneren Knoten sitzt.
        // Die eingebauten Substrat-Dioden werden mit IS ≈ 0 abgeschaltet; die Bodydiode ist ein eigenes D.
        const m = e.model;
        const type = e.polarity === 'p' ? 'PMOS' : 'NMOS';
        const d = m.RD > 0 ? `${n}_d` : a;
        const s = m.RS > 0 ? `${n}_s` : c;
        if (m.RD > 0) lines.push(`R${n}_d ${a} ${d} ${num(m.RD)}`);
        if (m.RS > 0) lines.push(`R${n}_s ${c} ${s} ${num(m.RS)}`);
        lines.push(`M${n} ${d} ${b} ${s} ${s} mm_${n} W=1 L=1`);
        const p = { LEVEL: 1, VTO: m.VTO, KP: m.KP, LAMBDA: m.LAMBDA ?? 0, CGSO: m.CGS ?? 0, CGDO: m.CGD ?? 0, IS: 1e-30 };
        models.push(`.model mm_${n} ${type}(${modelParams(p)})`);
        if (e.bodyDiode) {
          const [an, ca] = e.polarity === 'p' ? [d, s] : [s, d];
          lines.push(`D${n}_body ${an} ${ca} dm_${n}_body`);
          models.push(`.model dm_${n}_body D(${modelParams(e.bodyDiode)})`);
        }
        break;
      }
      default:
        throw new Error(`${n}: Bauteiltyp ${e.type} hat kein SPICE-Gegenstück`);
    }
  }
  return [...lines, ...models];
}

/** SPICE-Name des Zweigstroms einer Quelle (für Messpunkte „I(V1)“). */
export function spiceSourceName(name) {
  return `V${name}`;
}
