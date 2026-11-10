// Bipolartransistor (NPN/PNP) nach dem Gummel-Poon-Modell (Gleichstromkern wie ngspice bjtload).
//
// Anschlüsse: nodes = [Kollektor, Basis, Emitter]. Mit Bahnwiderständen RC, RB, RE liegen die
// inneren Knoten C', B', E' dahinter. Für PNP werden alle Spannungen und Ströme umgepolt.
//
// Ströme (U_BE, U_BC an den inneren Knoten, U_T = Temperaturspannung):
//   I_BF = IS · (exp(U_BE/(NF·U_T)) − 1)        Vorwärtsstrom
//   I_BR = IS · (exp(U_BC/(NR·U_T)) − 1)        Rückwärtsstrom
//   I_LE = ISE · (exp(U_BE/(NE·U_T)) − 1)       Rekombination B-E (senkt β bei kleinen Strömen)
//   I_LC = ISC · (exp(U_BC/(NC·U_T)) − 1)       Rekombination B-C
//   Basisladung:  q1 = 1 / (1 − U_BC/VAF − U_BE/VAR)       Early-Effekt
//                 q2 = I_BF/IKF + I_BR/IKR                   Hochstrom-Injektion (senkt β bei großen Strömen)
//                 qb = q1 · (1 + √(1 + 4·q2)) / 2
//   I_C = (I_BF − I_BR)/qb − I_BR/BR − I_LC
//   I_B = I_BF/BF + I_LE + I_BR/BR + I_LC
//   I_E = −(I_C + I_B)
// GMIN liegt wie in ngspice parallel zu beiden Übergängen (im Rekombinationsstrom).
//
// Ladungen (nur im Zeitbereich):
//   Q_BE = TF · I_BF / qb + Sperrschichtladung(U_BE; CJE, VJE, MJE)
//   Q_BC = TR · I_BR      + Sperrschichtladung(U_BC; CJC, VJC, MJC)
//   Q_BE hängt über qb auch von U_BC ab (Querkapazität). ngspice teilt nur für U_BE > 0 durch qb;
//   hier immer – der Unterschied ist bei U_BE ≤ 0 verschwindend, dafür ist der Verlauf glatt.
//   Nicht übernommen: XTF/VTF/ITF (Transitzeit-Abhängigkeit), XCJC (Aufteilung von CJC), Substrat.
//
// Parameter mit SPICE-Namen und ngspice-Vorgaben:
//   IS 1e-16, BF 100, NF 1, VAF ∞, IKF ∞, ISE 0, NE 1,5, BR 1, NR 1, VAR ∞, IKR ∞, ISC 0, NC 2,
//   RB 0, RC 0, RE 0, CJE 0, VJE 0,75, MJE 0,33, CJC 0, VJC 0,75, MJC 0,33, FC 0,5, TF 0, TR 0
//
// spec: { name, nodes: [c, b, e], polarity: 'npn' | 'pnp', model: { … } }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { thermalVoltage, criticalVoltage, limitJunctionVoltage, depletionCharge } from '../junction.js';
import { ChargeHistory } from '../integration.js';

const at = Element.at;

const DEFAULTS = {
  IS: 1e-16, BF: 100, NF: 1, VAF: Infinity, IKF: Infinity, ISE: 0, NE: 1.5,
  BR: 1, NR: 1, VAR: Infinity, IKR: Infinity, ISC: 0, NC: 2, RB: 0, RC: 0, RE: 0,
  CJE: 0, VJE: 0.75, MJE: 0.33, CJC: 0, VJC: 0.75, MJC: 0.33, FC: 0.5, TF: 0, TR: 0,
};

export class Bjt extends Element {
  static type = 'Q';
  static label = 'Transistor';
  static terminalCount = 3;

  constructor(spec) {
    super(spec);
    if (!['npn', 'pnp'].includes(spec.polarity ?? 'npn')) {
      throw new CircuitError(`${this.name}: Die Polarität muss „npn“ oder „pnp“ sein.`, { elements: [this.name] });
    }
    this.polarity = spec.polarity === 'pnp' ? -1 : 1;
    const m = { ...DEFAULTS, ...spec.model };
    for (const key of ['IS', 'BF', 'NF', 'VAF', 'IKF', 'NE', 'BR', 'NR', 'VAR', 'IKR', 'NC']) {
      if (!(m[key] > 0)) this.#fail(`${key} muss größer als 0 sein`);
    }
    for (const key of ['ISE', 'ISC', 'RB', 'RC', 'RE', 'CJE', 'CJC', 'TF', 'TR']) {
      if (!(m[key] >= 0)) this.#fail(`${key} darf nicht negativ sein`);
    }
    for (const key of ['VJE', 'VJC']) if (!(m[key] > 0)) this.#fail(`${key} muss größer als 0 sein`);
    for (const key of ['MJE', 'MJC']) if (!(m[key] > 0 && m[key] < 1)) this.#fail(`${key} muss zwischen 0 und 1 liegen`);
    if (!(m.FC >= 0 && m.FC < 1)) this.#fail('FC muss zwischen 0 und 1 liegen');
    this.model = m;
    this.hasCharge = m.CJE > 0 || m.CJC > 0 || m.TF > 0 || m.TR > 0;
    this.historyBE = new ChargeHistory();
    this.historyBC = new ChargeHistory();
    const vt = thermalVoltage();
    this.vtF = m.NF * vt;
    this.vtR = m.NR * vt;
    this.vtE = m.NE * vt;
    this.vtC = m.NC * vt;
    this.vCritF = criticalVoltage(this.vtF, m.IS);
    this.vCritR = criticalVoltage(this.vtR, m.IS);
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  get internalNodes() {
    const { RC, RB, RE } = this.model;
    return [RC > 0 && 'C', RB > 0 && 'B', RE > 0 && 'E'].filter(Boolean);
  }

  reset() {
    this.vbe = null; // Übergangsspannungen der letzten Iteration (bei PNP umgepolt)
    this.vbc = null;
    this.op = null; // Ströme und Ableitungen dort (im Zeitbereich einschließlich Umladeströme)
    this.inTransient = false;
  }

  /** Innere Knoten [C', B', E'] (oder die Anschlüsse selbst, wenn kein Bahnwiderstand da ist). */
  innerNodes() {
    const inner = [...this.internalNodes];
    const pick = (label, i) => (inner.includes(label) ? this.internalIndices[inner.indexOf(label)] : this.nodeIndices[i]);
    return [pick('C', 0), pick('B', 1), pick('E', 2)];
  }

  /** U_BE und U_BC (bei PNP umgepolt, damit die Formeln für beide Typen gleich sind). */
  junctionVoltages(x) {
    const [c, b, e] = this.innerNodes();
    const vb = at(x, b);
    return { vbe: this.polarity * (vb - at(x, e)), vbc: this.polarity * (vb - at(x, c)) };
  }

  /** Gummel-Poon-Gleichstromkern: Ströme I_C, I_B und ihre Ableitungen nach U_BE, U_BC. */
  evaluate(vbe, vbc, gmin) {
    const m = this.model;
    const expF = Math.exp(vbe / this.vtF);
    const ibf = m.IS * (expF - 1);
    const gbf = (m.IS * expF) / this.vtF;
    const expR = Math.exp(vbc / this.vtR);
    const ibr = m.IS * (expR - 1);
    const gbr = (m.IS * expR) / this.vtR;
    const expE = m.ISE > 0 ? Math.exp(vbe / this.vtE) : 0;
    const ile = m.ISE * (expE - 1) + gmin * vbe;
    const gle = (m.ISE * expE) / this.vtE + gmin;
    const expC = m.ISC > 0 ? Math.exp(vbc / this.vtC) : 0;
    const ilc = m.ISC * (expC - 1) + gmin * vbc;
    const glc = (m.ISC * expC) / this.vtC + gmin;

    // Basisladung qb (Early-Effekt und Hochstrom-Injektion)
    const q1 = 1 / (1 - vbc / m.VAF - vbe / m.VAR);
    const dq1be = (q1 * q1) / m.VAR;
    const dq1bc = (q1 * q1) / m.VAF;
    const q2 = ibf / m.IKF + ibr / m.IKR;
    const sq = Math.sqrt(Math.max(0, 1 + 4 * q2));
    const qb = (q1 * (1 + sq)) / 2;
    const dqbbe = (dq1be * (1 + sq)) / 2 + (sq > 0 ? (q1 * gbf) / m.IKF / sq : 0);
    const dqbbc = (dq1bc * (1 + sq)) / 2 + (sq > 0 ? (q1 * gbr) / m.IKR / sq : 0);

    const it = (ibf - ibr) / qb; // Transportstrom
    const ditbe = (gbf - it * dqbbe) / qb;
    const ditbc = (-gbr - it * dqbbc) / qb;

    return {
      ic: it - ibr / m.BR - ilc,
      ib: ibf / m.BF + ile + ibr / m.BR + ilc,
      dicbe: ditbe,
      dicbc: ditbc - gbr / m.BR - glc,
      dibbe: gbf / m.BF + gle,
      dibbc: gbr / m.BR + glc,
      // für die Ladungen
      ibf, gbf, ibr, gbr, qb, dqbbe, dqbbc,
    };
  }

  /**
   * Ladungen Q_BE, Q_BC und ihre Ableitungen (Kapazitäten).
   * cbebe = ∂Q_BE/∂U_BE, cbebc = ∂Q_BE/∂U_BC (Querkapazität), cbcbc = ∂Q_BC/∂U_BC.
   */
  charges(vbe, vbc, op = this.evaluate(vbe, vbc, 0)) {
    const m = this.model;
    const dBE = depletionCharge(vbe, m.CJE, m.VJE, m.MJE, m.FC);
    const dBC = depletionCharge(vbc, m.CJC, m.VJC, m.MJC, m.FC);
    const { ibf, gbf, ibr, gbr, qb, dqbbe, dqbbc } = op;
    return {
      qbe: (m.TF * ibf) / qb + dBE.q,
      qbc: m.TR * ibr + dBC.q,
      cbebe: (m.TF * (gbf - (ibf / qb) * dqbbe)) / qb + dBE.c,
      cbebc: (-m.TF * ibf * dqbbc) / (qb * qb),
      cbcbc: m.TR * gbr + dBC.c,
    };
  }

  /** Neue Übergangsspannungen: Kaltstart (U_BE = Vcrit, U_BC = 0) oder begrenzt wie ngspice. */
  #nextVoltages(x, ctx) {
    if (ctx.initJunctions) return { vbe: this.vCritF, vbc: 0 };
    const v = this.junctionVoltages(x);
    if (this.vbe === null) return v;
    const be = limitJunctionVoltage(v.vbe, this.vbe, this.vtF, this.vCritF);
    const bc = limitJunctionVoltage(v.vbc, this.vbc, this.vtR, this.vCritR);
    if (be.limited || bc.limited) ctx.limited = true;
    return { vbe: be.v, vbc: bc.v };
  }

  stamp(system, x, ctx) {
    const { RC, RB, RE } = this.model;
    const [c, b, e] = this.innerNodes();
    const [C, B, E] = this.nodeIndices;
    if (RC > 0) system.stampConductance(C, c, 1 / RC);
    if (RB > 0) system.stampConductance(B, b, 1 / RB);
    if (RE > 0) system.stampConductance(E, e, 1 / RE);

    const { vbe, vbc } = this.#nextVoltages(x, ctx);
    let op = this.evaluate(vbe, vbc, ctx.options.gmin);
    if (ctx.mode === 'tran' && this.hasCharge) op = this.#withChargeCurrents(op, vbe, vbc, ctx);
    this.vbe = vbe;
    this.vbc = vbc;
    this.op = op;
    this.#stampCurrents(system, [c, b, e], op, vbe, vbc);
  }

  /**
   * Umladeströme der Ladungen dazurechnen:  i_BE = dQ_BE/dt (B' → E'),  i_BC = dQ_BC/dt (B' → C').
   * Dann gilt  I_C,ges = I_C − i_BC,  I_B,ges = I_B + i_BE + i_BC  (I_E folgt aus der Knotenregel).
   */
  #withChargeCurrents(op, vbe, vbc, ctx) {
    const ch = this.charges(vbe, vbc, op);
    const iBE = ctx.ag0 * ch.qbe + this.historyBE.history(ctx);
    const iBC = ctx.ag0 * ch.qbc + this.historyBC.history(ctx);
    return {
      ...op,
      ic: op.ic - iBC,
      ib: op.ib + iBE + iBC,
      dicbc: op.dicbc - ctx.ag0 * ch.cbcbc,
      dibbe: op.dibbe + ctx.ag0 * ch.cbebe,
      dibbc: op.dibbc + ctx.ag0 * (ch.cbebc + ch.cbcbc),
    };
  }

  // ── Zeitbereich ──

  initTransient(x, _ctx, useInitialConditions) {
    const { vbe, vbc } = useInitialConditions ? { vbe: 0, vbc: 0 } : this.junctionVoltages(x);
    const ch = this.charges(vbe, vbc);
    this.historyBE.init(ch.qbe, 0);
    this.historyBC.init(ch.qbc, 0);
    this.inTransient = true;
  }

  computeState(x, ctx) {
    if (!this.hasCharge) return;
    const { vbe, vbc } = this.junctionVoltages(x);
    const ch = this.charges(vbe, vbc);
    this.historyBE.update(ch.qbe, ctx);
    this.historyBC.update(ch.qbc, ctx);
  }

  truncationStep(ctx) {
    if (!this.hasCharge) return Infinity;
    return Math.min(this.historyBE.truncationStep(ctx), this.historyBC.truncationStep(ctx));
  }

  acceptStep() {
    if (!this.hasCharge) return;
    this.historyBE.accept();
    this.historyBC.accept();
  }

  /**
   * Ströme in die inneren Knoten C', B', E' und ihre Ableitungen nach den Knotenpotenzialen.
   * Mit U_BE = p·(V_B − V_E), U_BC = p·(V_B − V_C), I_Anschluss = p·I_Modell (p = ±1) gilt
   * ∂I/∂V_B = ∂I/∂U_BE + ∂I/∂U_BC,  ∂I/∂V_E = −∂I/∂U_BE,  ∂I/∂V_C = −∂I/∂U_BC (p² = 1).
   */
  #stampCurrents(system, nodes, op, vbe, vbc) {
    const p = this.polarity;
    const rowC = [-op.dicbc, op.dicbe + op.dicbc, -op.dicbe];
    const rowB = [-op.dibbc, op.dibbe + op.dibbc, -op.dibbe];
    const rowE = rowC.map((v, k) => -(v + rowB[k]));
    // Linearisierungspunkt als Potenziale (nur Differenzen zählen): V_E = 0
    const V0 = [p * (vbe - vbc), p * vbe, 0];
    system.stampLinearized(nodes, [p * op.ic, p * op.ib, -p * (op.ic + op.ib)], [rowC, rowB, rowE], V0);
  }

  /** Konvergenzprüfung wie ngspice (BJTconvTest): Änderung von I_C und I_B laut Tangente klein genug? */
  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const { vbe, vbc } = this.junctionVoltages(x);
    const dbe = vbe - this.vbe;
    const dbc = vbc - this.vbc;
    const { ic, ib, dicbe, dicbc, dibbe, dibbc } = this.op;
    const icHat = ic + dicbe * dbe + dicbc * dbc;
    const ibHat = ib + dibbe * dbe + dibbc * dbc;
    return (
      Math.abs(icHat - ic) <= reltol * Math.max(Math.abs(icHat), Math.abs(ic)) + abstol &&
      Math.abs(ibHat - ib) <= reltol * Math.max(Math.abs(ibHat), Math.abs(ib)) + abstol
    );
  }

  /** Ströme in die Anschlüsse C, B, E (positiv = fließt in den Transistor hinein). */
  terminalCurrents(x) {
    const { vbe, vbc } = this.junctionVoltages(x);
    let { ic, ib } = this.evaluate(vbe, vbc, 0);
    if (this.inTransient && this.hasCharge) {
      ic -= this.historyBC.dqNow;
      ib += this.historyBE.dqNow + this.historyBC.dqNow;
    }
    const p = this.polarity;
    return { C: p * ic, B: p * ib, E: -p * (ic + ib) };
  }

  /** Messwerte: U = U_CE, I = Kollektorstrom. */
  voltage(x) {
    return this.potential(x, 0) - this.potential(x, 2);
  }

  current(x) {
    return this.terminalCurrents(x).C;
  }

  #fail(text) {
    throw new CircuitError(`${this.name}: Modellparameter ungültig – ${text}.`, { elements: [this.name] });
  }
}
