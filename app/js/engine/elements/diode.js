// Halbleiterdiode – Grundlage für Diode, LED und Z-Diode (SPICE-Diodenmodell, Gleichstromteil).
//
//   Anode ──[ RS ]── innerer Knoten ──▶|── Kathode
//
// Strom durch den pn-Übergang bei der Spannung U_D (ohne Bahnwiderstand):
//   Durchlass/Sperr:  I = IS · (exp(U_D / (N·U_T)) − 1)
//   Durchbruch:       zusätzlich −IBV · exp(−(U_D + BV) / (NBV·U_T))   (nur wenn BV angegeben)
//                     → bei U_D = −BV fließt genau der Strom IBV in Sperrrichtung (Z-Diode)
//   GMIN:             kleiner Leitwert parallel, wie in ngspice (hält das Gleichungssystem lösbar)
//
// Parameter (Namen wie in SPICE-Modellen, damit Datenblattmodelle direkt übernommen werden können):
//   IS  Sättigungsstrom in A        (Vorgabe 1e-14)
//   N   Emissionskoeffizient        (Vorgabe 1)
//   RS  Bahnwiderstand in Ω         (Vorgabe 0)
//   BV  Durchbruchspannung in V     (Vorgabe: kein Durchbruch)
//   IBV Strom bei BV in A           (Vorgabe 1 mA)
//   NBV Emissionskoeffizient im Durchbruch (Vorgabe N)
// CJO und TT (Sperrschicht- und Diffusionskapazität) werden mit dem Zeitbereich in Phase 3 ergänzt.

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { thermalVoltage, criticalVoltage, limitJunctionVoltage } from '../junction.js';

const at = Element.at;

export class Diode extends Element {
  static type = 'D';

  /** spec: { name, nodes: [anode, kathode], model: { IS, N, RS, BV, IBV, NBV } } */
  constructor(spec) {
    super(spec);
    const m = { IS: 1e-14, N: 1, RS: 0, BV: Infinity, IBV: 1e-3, ...spec.model };
    m.NBV ??= m.N;
    for (const key of ['IS', 'N', 'IBV', 'NBV', 'BV']) this.#requirePositive(m, key);
    if (!(m.RS >= 0)) this.#fail('RS darf nicht negativ sein');
    this.model = m;

    const vt = thermalVoltage();
    this.nVt = m.N * vt; // „Temperaturspannung“ im Durchlassbereich
    this.vCrit = criticalVoltage(this.nVt, m.IS);
    this.hasBreakdown = Number.isFinite(m.BV);
    this.nVtBreakdown = m.NBV * vt;
    this.vCritBreakdown = criticalVoltage(this.nVtBreakdown, m.IBV);
    // Korrektur, damit der Durchbruchterm bei U_D = 0 keinen Strom liefert
    this.breakdownOffset = this.hasBreakdown ? Math.exp(-m.BV / this.nVtBreakdown) : 0;
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  get internalNodes() {
    return this.model.RS > 0 ? ['intern'] : [];
  }

  reset() {
    this.vd = null; // Spannung am pn-Übergang der letzten Iteration (null = noch keine)
    this.id = 0; // Strom dort
    this.gd = 0; // Steigung dI/dU dort
  }

  /** Knoten, zwischen denen der pn-Übergang liegt. */
  #junctionNodes() {
    const anode = this.model.RS > 0 ? this.internalIndices[0] : this.nodeIndices[0];
    return [anode, this.nodeIndices[1]];
  }

  #junctionVoltage(x) {
    const [a, k] = this.#junctionNodes();
    return at(x, a) - at(x, k);
  }

  /** Strom und Steigung des pn-Übergangs bei der Spannung vd. */
  evaluate(vd, gmin) {
    const { IS, IBV } = this.model;
    const e = Math.exp(vd / this.nVt);
    let id = IS * (e - 1);
    let gd = (IS * e) / this.nVt;
    if (this.hasBreakdown) {
      const eb = Math.exp(-(vd + this.model.BV) / this.nVtBreakdown);
      id -= IBV * (eb - this.breakdownOffset);
      gd += (IBV * eb) / this.nVtBreakdown;
    }
    return { id: id + gmin * vd, gd: gd + gmin };
  }

  /** Begrenzt die neue Spannung wie ngspice – im Durchbruch gespiegelt um −BV. */
  #limit(vNew, ctx) {
    const vOld = this.vd;
    const { BV } = this.model;
    if (this.hasBreakdown && vNew < Math.min(0, -BV + 10 * this.nVtBreakdown)) {
      const r = limitJunctionVoltage(-(vNew + BV), -(vOld + BV), this.nVtBreakdown, this.vCritBreakdown);
      if (r.limited) ctx.limited = true;
      return -(r.v + BV);
    }
    const r = limitJunctionVoltage(vNew, vOld, this.nVt, this.vCrit);
    if (r.limited) ctx.limited = true;
    return r.v;
  }

  stamp(system, x, ctx) {
    const [a, k] = this.#junctionNodes();
    if (this.model.RS > 0) system.stampConductance(this.nodeIndices[0], a, 1 / this.model.RS);

    // Startwert wie ngspice: Übergang knapp leitend (Vcrit); danach begrenzte Newton-Vorschläge
    const vd = this.vd === null ? this.vCrit : this.#limit(this.#junctionVoltage(x), ctx);
    const { id, gd } = this.evaluate(vd, ctx.options.gmin);
    this.vd = vd;
    this.id = id;
    this.gd = gd;

    // Tangente im Punkt vd:  I ≈ gd · U + (id − gd · vd)
    system.stampConductance(a, k, gd);
    system.stampCurrentSource(a, k, id - gd * vd);
  }

  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const predicted = this.id + this.gd * (this.#junctionVoltage(x) - this.vd);
    const tol = reltol * Math.max(Math.abs(predicted), Math.abs(this.id)) + abstol;
    return Math.abs(predicted - this.id) <= tol;
  }

  current(x) {
    if (this.model.RS > 0) {
      return (this.potential(x, 0) - at(x, this.internalIndices[0])) / this.model.RS;
    }
    return this.evaluate(this.#junctionVoltage(x), 0).id;
  }

  #requirePositive(m, key) {
    if (!(typeof m[key] === 'number' && m[key] > 0)) this.#fail(`${key} muss eine Zahl größer als 0 sein`);
  }

  #fail(text) {
    throw new CircuitError(`${this.name}: Modellparameter ungültig – ${text}.`, { elements: [this.name] });
  }
}
