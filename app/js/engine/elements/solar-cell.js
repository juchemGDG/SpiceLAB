// Solarzelle / Solarmodul nach dem Ein-Dioden-Modell.
//
//   plus ──[ Rs ]── j ──┬──────┬──────┬── minus
//                       │      │      │
//                  Fotostrom  Diode   Rp
//                  (I_ph ↑)   (j→−)
//
//   I_ph = I_K · E / 1000 W/m²        (Fotostrom proportional zur Bestrahlungsstärke E)
//   Diode: I = I0 · (exp(U_j / (Ns·n·U_T)) − 1)   (Ns Zellen in Reihe wirken wie eine Diode
//          mit Ns-facher Temperaturspannung)
//   I0 so gewählt, dass im Leerlauf bei 1000 W/m² die Leerlaufspannung U_L anliegt:
//          I0 = (I_K − U_L/Rp) / (exp(U_L / (Ns·n·U_T)) − 1)
//
// Vorzeichen wie bei allen Bauteilen: Strom im Bauteil von plus nach minus; liefert die Zelle
// Energie, ist er negativ (und P < 0).
//
// spec: { name, nodes: [plus, minus], openCircuitVoltage: U_L in V, shortCircuitCurrent: I_K in A,
//         cells: Ns (1), ideality: n (1,3), seriesResistance: Rs in Ω (0), shuntResistance: Rp in Ω (1000),
//         irradiance: E in W/m² (1000) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { thermalVoltage, criticalVoltage, limitJunctionVoltage } from '../junction.js';

const at = Element.at;

export class SolarCell extends Element {
  static type = 'PV';
  static label = 'Solarzelle';

  constructor(spec) {
    super(spec);
    const p = { cells: 1, ideality: 1.3, seriesResistance: 0, shuntResistance: 1000, irradiance: 1000, ...spec };
    const Uoc = this.requireNumber(p, 'openCircuitVoltage', { positive: true, label: 'Die Leerlaufspannung', unit: 'V' });
    const Isc = this.requireNumber(p, 'shortCircuitCurrent', { positive: true, label: 'Der Kurzschlussstrom', unit: 'A' });
    this.requireNumber(p, 'cells', { positive: true, label: 'Die Zellenzahl' });
    this.requireNumber(p, 'ideality', { positive: true, label: 'Der Idealitätsfaktor' });
    this.requireNumber(p, 'shuntResistance', { positive: true, label: 'Der Parallelwiderstand', unit: 'Ω' });
    this.requireNumber(p, 'seriesResistance', { label: 'Der Serienwiderstand' });
    this.requireNumber(p, 'irradiance', { label: 'Die Bestrahlungsstärke' });
    if (p.seriesResistance < 0 || p.irradiance < 0) {
      throw new CircuitError(`${this.name}: Serienwiderstand und Bestrahlungsstärke dürfen nicht negativ sein.`, { elements: [this.name] });
    }
    if (Uoc / p.shuntResistance >= Isc) {
      throw new CircuitError(`${this.name}: Der Parallelwiderstand ist für diese Zelle zu klein.`, { elements: [this.name] });
    }
    this.Rs = p.seriesResistance;
    this.Rp = p.shuntResistance;
    this.nVt = p.cells * p.ideality * thermalVoltage();
    this.I0 = (Isc - Uoc / this.Rp) / (Math.exp(Uoc / this.nVt) - 1);
    this.photoCurrent = (Isc * p.irradiance) / 1000;
    this.vCrit = criticalVoltage(this.nVt, this.I0);
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  get internalNodes() {
    return this.Rs > 0 ? ['j'] : [];
  }

  reset() {
    this.vd = null;
    this.id = 0;
    this.gd = 0;
  }

  #junction() {
    return this.Rs > 0 ? this.internalIndices[0] : this.nodeIndices[0];
  }

  #junctionVoltage(x) {
    return at(x, this.#junction()) - this.potential(x, 1);
  }

  /** Diodenstrom und Steigung bei der Spannung vd (mit GMIN wie bei der Diode). */
  #diode(vd, gmin) {
    const e = Math.exp(vd / this.nVt);
    return { id: this.I0 * (e - 1) + gmin * vd, gd: (this.I0 * e) / this.nVt + gmin };
  }

  stamp(system, x, ctx) {
    const [plus, minus] = this.nodeIndices;
    const j = this.#junction();
    if (this.Rs > 0) system.stampConductance(plus, j, 1 / this.Rs);
    system.stampConductance(j, minus, 1 / this.Rp);
    system.stampCurrentSource(minus, j, this.photoCurrent * ctx.sourceFactor);

    let vd;
    if (ctx.initJunctions) vd = this.vCrit;
    else if (this.vd === null) vd = this.#junctionVoltage(x);
    else {
      const r = limitJunctionVoltage(this.#junctionVoltage(x), this.vd, this.nVt, this.vCrit);
      if (r.limited) ctx.limited = true;
      vd = r.v;
    }
    const { id, gd } = this.#diode(vd, ctx.options.gmin);
    Object.assign(this, { vd, id, gd });
    system.stampConductance(j, minus, gd);
    system.stampCurrentSource(j, minus, id - gd * vd);
  }

  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const predicted = this.id + this.gd * (this.#junctionVoltage(x) - this.vd);
    return Math.abs(predicted - this.id) <= reltol * Math.max(Math.abs(predicted), Math.abs(this.id)) + abstol;
  }

  current(x) {
    if (this.Rs > 0) return (this.potential(x, 0) - at(x, this.internalIndices[0])) / this.Rs;
    const vd = this.#junctionVoltage(x);
    return this.#diode(vd, 0).id + vd / this.Rp - this.photoCurrent;
  }
}
