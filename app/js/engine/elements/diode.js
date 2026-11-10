// Halbleiterdiode – Grundlage für Diode, LED und Z-Diode (SPICE-Diodenmodell).
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
//
// Ladung im pn-Übergang (nur im Zeitbereich wirksam, wie in SPICE):
//   Sperrschicht:  C_j = CJO / (1 − U_D/VJ)^M          für U_D < FC·VJ, darüber linear fortgesetzt
//   Diffusion:     Q_d = TT · I_D                       (gespeicherte Ladung im Durchlassbetrieb →
//                                                       Sperrverzug beim Umschalten)
//   CJO Sperrschichtkapazität bei 0 V in F (Vorgabe 0)   VJ Diffusionsspannung in V (Vorgabe 1)
//   M   Gradationsexponent (Vorgabe 0,5)                  FC Grenze für die Fortsetzung (Vorgabe 0,5)
//   TT  Transitzeit in s (Vorgabe 0)

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { thermalVoltage, criticalVoltage, limitJunctionVoltage, depletionCharge } from '../junction.js';
import { ChargeHistory } from '../integration.js';

const at = Element.at;

export class Diode extends Element {
  static type = 'D';
  static label = 'Diode';

  /** spec: { name, nodes: [anode, kathode], model: { IS, N, RS, BV, IBV, NBV, CJO, VJ, M, FC, TT } } */
  constructor(spec) {
    super(spec);
    const m = { IS: 1e-14, N: 1, RS: 0, BV: Infinity, IBV: 1e-3, CJO: 0, VJ: 1, M: 0.5, FC: 0.5, TT: 0, ...spec.model };
    m.NBV ??= m.N;
    for (const key of ['IS', 'N', 'IBV', 'NBV', 'BV', 'VJ']) this.#requirePositive(m, key);
    for (const key of ['RS', 'CJO', 'TT']) if (!(m[key] >= 0)) this.#fail(`${key} darf nicht negativ sein`);
    if (!(m.M > 0 && m.M < 1)) this.#fail('M muss zwischen 0 und 1 liegen');
    if (!(m.FC >= 0 && m.FC < 1)) this.#fail('FC muss zwischen 0 und 1 liegen');
    this.model = m;
    this.hasCharge = m.CJO > 0 || m.TT > 0;
    this.history = new ChargeHistory();

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
    this.id = 0; // Strom dort (im Zeitbereich einschließlich Umladestrom)
    this.gd = 0; // Steigung dI/dU dort
    this.inTransient = false;
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

  /** Ladung q und Kapazität dq/dU des pn-Übergangs bei der Spannung vd (Sperrschicht + Diffusion). */
  charge(vd) {
    const { CJO, VJ, M, FC, TT } = this.model;
    let { q, c } = depletionCharge(vd, CJO, VJ, M, FC);
    if (TT > 0) {
      const { id, gd } = this.evaluate(vd, 0);
      q += TT * id;
      c += TT * gd;
    }
    return { q, c };
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

    // Kaltstart wie ngspice (MODEINITJCT): Übergang knapp leitend (Vcrit).
    // Weiterrechnen von einer Lösung: deren Spannung, danach begrenzte Newton-Vorschläge.
    let vd;
    if (ctx.initJunctions) vd = this.vCrit;
    else if (this.vd === null) vd = this.#junctionVoltage(x);
    else vd = this.#limit(this.#junctionVoltage(x), ctx);
    let { id, gd } = this.evaluate(vd, ctx.options.gmin);
    if (ctx.mode === 'tran' && this.hasCharge) {
      // Umladestrom der Sperrschicht-/Diffusionsladung: i = dq/dt = ag0 · q + Vergangenheit
      const { q, c } = this.charge(vd);
      id += ctx.ag0 * q + this.history.history(ctx);
      gd += ctx.ag0 * c;
    }
    this.vd = vd;
    this.id = id;
    this.gd = gd;

    // Tangente im Punkt vd:  I ≈ gd · U + (id − gd · vd)
    system.stampConductance(a, k, gd);
    system.stampCurrentSource(a, k, id - gd * vd);
  }

  // ── Zeitbereich: Ladung des pn-Übergangs ──

  initTransient(x, _ctx, useInitialConditions) {
    const vd = useInitialConditions ? 0 : this.#junctionVoltage(x);
    this.history.init(this.charge(vd).q, 0);
    this.inTransient = true;
  }

  computeState(x, ctx) {
    if (this.hasCharge) this.history.update(this.charge(this.#junctionVoltage(x)).q, ctx);
  }

  truncationStep(ctx) {
    return this.hasCharge ? this.history.truncationStep(ctx) : Infinity;
  }

  acceptStep() {
    if (this.hasCharge) this.history.accept();
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
    const stationary = this.evaluate(this.#junctionVoltage(x), 0).id;
    return this.inTransient && this.hasCharge ? stationary + this.history.dqNow : stationary;
  }

  #requirePositive(m, key) {
    if (!(typeof m[key] === 'number' && m[key] > 0)) this.#fail(`${key} muss eine Zahl größer als 0 sein`);
  }

  #fail(text) {
    throw new CircuitError(`${this.name}: Modellparameter ungültig – ${text}.`, { elements: [this.name] });
  }
}
