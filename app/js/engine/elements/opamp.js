// Operationsverstärker – Verhaltensmodell (Makromodell) mit den realen Grenzen, die man im
// Unterricht sieht. Anschlüsse: nodes = [in+, in−, aus, V+, V−]. Der OPV braucht eine Versorgung!
//
//   Eingang:     Differenzspannung u_d = φ(in+) − φ(in−) + U_os, Eingangswiderstand R_in
//   Verstärker:  innerer Knoten x (gegen Masse):  I_gm = I_max · tanh(g_m · u_d / I_max) speist x,
//                parallel R1 und C1.   Leerlaufverstärkung A0 = g_m · R1,
//                Pol f_p = 1/(2π·R1·C1) = GBW/A0,  Anstiegsrate SR = I_max/C1 (tanh begrenzt den Strom)
//                Eine weiche Klemme hält u_x in der Nähe des Versorgungsbereichs (sonst „läuft“ der
//                Integrator in der Übersteuerung weg und die Erholung dauert unrealistisch lange).
//   Ausgang:     Sollwert u_t = Mitte der Versorgung + u_x, weich begrenzt auf
//                [V− + swingLow, V+ − swingHigh]  (z. B. LM358: kommt nur bis V+ − 1,5 V)
//                Ausgangsstrom I = I_lim · tanh((u_t − u_aus) / (R_out · I_lim))
//                → Ausgangswiderstand R_out, Strombegrenzung I_lim
//   Versorgung:  Der Ausgangsstrom kommt aus V+ (Quellen) bzw. fließt nach V− (Senken),
//                dazu der Ruhestrom I_q von V+ nach V−.
//
// spec: { name, nodes: [inP, inN, out, vPos, vNeg],
//         model: { A0, GBW, SR, Rin, Rout, Ilim, swingHigh, swingLow, Iq, Vos } }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { ChargeHistory } from '../integration.js';

const at = Element.at;
const R1 = 1e6; // Ω, innerer Widerstand des Verstärkerknotens (frei gewählt, nur A0/GBW/SR zählen)
const SMOOTH = 0.01; // V, Rundung der Ausgangsbegrenzung
const CLAMP_SMOOTH = 0.05; // V
const CLAMP_G = 1; // S, Stärke der Klemme am Verstärkerknoten
const CLAMP_MARGIN = 0.5; // V über die Versorgung hinaus
const SPLIT_EPS = 1e-6; // A, Rundung bei der Aufteilung des Ausgangsstroms auf V+ und V−
const IQ_SCALE = 0.5; // V, Ruhestrom fließt erst mit Versorgungsspannung

const DEFAULTS = { A0: 1e5, GBW: 1e6, SR: 1e6, Rin: 1e12, Rout: 50, Ilim: 0.03, swingHigh: 0, swingLow: 0, Iq: 0, Vos: 0 };

/** softplus s·ln(1 + e^(z/s)) numerisch stabil, und seine Ableitung σ(z/s). */
function softplus(z, s) {
  const t = z / s;
  return t > 0 ? z + s * Math.log1p(Math.exp(-t)) : s * Math.log1p(Math.exp(t));
}
function sigmoid(z, s) {
  const t = z / s;
  if (t >= 0) return 1 / (1 + Math.exp(-t));
  const e = Math.exp(t);
  return e / (1 + e);
}

export class OpAmp extends Element {
  static type = 'OPV';
  static label = 'Operationsverstärker';
  static terminalCount = 5;

  constructor(spec) {
    super(spec);
    const m = { ...DEFAULTS, ...spec.model };
    for (const key of ['A0', 'GBW', 'SR', 'Rin', 'Rout', 'Ilim']) if (!(m[key] > 0)) this.#fail(`${key} muss größer als 0 sein`);
    for (const key of ['swingHigh', 'swingLow', 'Iq']) if (!(m[key] >= 0)) this.#fail(`${key} darf nicht negativ sein`);
    if (typeof m.Vos !== 'number' || Number.isNaN(m.Vos)) this.#fail('Vos ist keine Zahl');
    this.model = m;
    this.gm = m.A0 / R1;
    this.C1 = m.A0 / (2 * Math.PI * R1 * m.GBW); // aus f_p = GBW/A0 = 1/(2π·R1·C1)
    this.Imax = m.SR * this.C1;
    this.history = new ChargeHistory();
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  get internalNodes() {
    return ['x'];
  }

  reset() {
    this.lin = null; // letzte Linearisierung { I0, J, V0 }
    this.drive = null; // Ansteuerung der Ausgangsstufe w = u_t − u_aus der letzten Iteration
    this.inTransient = false;
  }

  /** Sollwert u_t des Ausgangs (wie in evaluate, ohne Ableitungen). */
  targetVoltage(v) {
    const [, , , vpos, vneg, vx] = v;
    const vin = (vpos + vneg) / 2 + vx;
    const lo = vneg + this.model.swingLow;
    const hi = vpos - this.model.swingHigh;
    return lo + softplus(vin - lo, SMOOTH) - softplus(vin - hi, SMOOTH);
  }

  /**
   * Begrenzung der Ausgangsstufe (nach dem Vorbild von pnjlim): Liegt die Linearisierung tief in
   * der Strombegrenzung, ist tanh flach und Newton springt hin und her. Deshalb darf sich die
   * Ansteuerung w = u_t − u_aus je Iteration höchstens um R_out · I_lim ändern; beim Kaltstart
   * wird bei w = 0 linearisiert. Begrenzt wird über den Linearisierungspunkt des Ausgangspotenzials.
   */
  #limitDrive(V0, ctx) {
    const vt = this.targetVoltage(V0);
    const step = this.model.Rout * this.model.Ilim;
    let w = vt - V0[2];
    if (ctx.initJunctions) w = 0;
    else if (this.drive !== null && Math.abs(w - this.drive) > step) {
      w = this.drive + Math.sign(w - this.drive) * step;
      ctx.limited = true;
    }
    this.drive = w;
    V0[2] = vt - w;
  }

  /** Knoten in der Reihenfolge der Gleichungen: in+, in−, aus, V+, V−, x. */
  #nodes() {
    return [...this.nodeIndices, this.internalIndices[0]];
  }

  /**
   * Ströme, die an den Knoten [in+, in−, aus, V+, V−, x] in das Modell hineinfließen
   * (nur der nichtlineare Teil; R_in, R1 und C1 werden getrennt gestempelt), und ihre Ableitungen.
   * @param {number[]} v Potenziale [in+, in−, aus, V+, V−, x]
   */
  evaluate(v) {
    const m = this.model;
    const [vp, vn, vout, vpos, vneg, vx] = v;
    const I = [0, 0, 0, 0, 0, 0];
    const J = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);

    // Verstärkerstufe: I_gm speist x (fließt also aus dem Modell in x hinein → negativ)
    const th = Math.tanh((this.gm * (vp - vn + m.Vos)) / this.Imax);
    const igm = this.Imax * th;
    const dIgm = this.gm * (1 - th * th);
    I[5] -= igm;
    J[5][0] -= dIgm;
    J[5][1] += dIgm;

    // weiche Klemme am Verstärkerknoten (bezogen auf die Mitte der Versorgung)
    const half = (vpos - vneg) / 2;
    const zHi = vx - (half + CLAMP_MARGIN);
    const zLo = -half - CLAMP_MARGIN - vx;
    I[5] += CLAMP_G * (softplus(zHi, CLAMP_SMOOTH) - softplus(zLo, CLAMP_SMOOTH));
    const sHi = sigmoid(zHi, CLAMP_SMOOTH);
    const sLo = sigmoid(zLo, CLAMP_SMOOTH);
    J[5][5] += CLAMP_G * (sHi + sLo);
    J[5][3] += (-CLAMP_G * (sHi - sLo)) / 2;
    J[5][4] += (CLAMP_G * (sHi - sLo)) / 2;

    // Sollwert des Ausgangs, weich auf [V− + swingLow, V+ − swingHigh] begrenzt
    const vin = (vpos + vneg) / 2 + vx;
    const lo = vneg + m.swingLow;
    const hi = vpos - m.swingHigh;
    const vt = lo + softplus(vin - lo, SMOOTH) - softplus(vin - hi, SMOOTH);
    const sa = sigmoid(vin - lo, SMOOTH);
    const sb = sigmoid(vin - hi, SMOOTH);
    const dvt = { x: sa - sb, pos: (sa - sb) / 2 + sb, neg: (sa - sb) / 2 + (1 - sa) };

    // Ausgangsstrom mit Ausgangswiderstand und Strombegrenzung
    const tOut = Math.tanh((vt - vout) / (m.Rout * m.Ilim));
    const iOut = m.Ilim * tOut;
    const g = (1 - tOut * tOut) / m.Rout; // ∂I/∂u_t
    const dOut = { 2: -g, 5: g * dvt.x, 3: g * dvt.pos, 4: g * dvt.neg };

    // Aufteilung auf die Versorgung: Quellen aus V+, Senken nach V−
    const root = Math.sqrt(iOut * iOut + SPLIT_EPS * SPLIT_EPS);
    const fromPos = (iOut + root) / 2;
    const dPos = (1 + iOut / root) / 2;
    const tq = Math.tanh((vpos - vneg) / IQ_SCALE);
    const iq = m.Iq * tq;
    const diq = (m.Iq * (1 - tq * tq)) / IQ_SCALE;

    I[2] -= iOut; // Ausgang: Strom fließt aus dem Modell in den Ausgangsknoten
    I[3] += fromPos + iq;
    I[4] += iOut - fromPos - iq;
    for (const [col, d] of Object.entries(dOut)) {
      J[2][col] -= d;
      J[3][col] += dPos * d;
      J[4][col] += (1 - dPos) * d;
    }
    J[3][3] += diq;
    J[3][4] -= diq;
    J[4][3] -= diq;
    J[4][4] += diq;
    return { I, J };
  }

  #potentials(x) {
    return this.#nodes().map((k) => at(x, k));
  }

  stamp(system, x, ctx) {
    const nodes = this.#nodes();
    const [inP, inN] = nodes;
    const xNode = nodes[5];
    system.stampConductance(inP, inN, 1 / this.model.Rin);
    system.stampConductance(xNode, -1, 1 / R1);
    if (ctx.mode === 'tran') {
      system.stampConductance(xNode, -1, ctx.ag0 * this.C1);
      system.stampCurrentSource(xNode, -1, this.history.history(ctx));
    }
    const V0 = this.#potentials(x);
    this.#limitDrive(V0, ctx);
    const { I, J } = this.evaluate(V0);
    this.lin = { I, J, V0 };
    system.stampLinearized(nodes, I, J, V0);
  }

  /** Konvergenz: Die Tangente sagt für die neue Lösung an jedem Knoten nur eine kleine Stromänderung voraus. */
  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const V = this.#potentials(x);
    const { I, J, V0 } = this.lin;
    return I.every((i0, k) => {
      let delta = 0;
      for (let j = 0; j < 6; j++) delta += J[k][j] * (V[j] - V0[j]);
      return Math.abs(delta) <= reltol * Math.max(Math.abs(i0), Math.abs(i0 + delta)) + abstol;
    });
  }

  // ── Zeitbereich: Kondensator C1 am Verstärkerknoten ──

  initTransient(x, _ctx, useInitialConditions) {
    const vx = useInitialConditions ? 0 : at(x, this.internalIndices[0]);
    this.history.init(this.C1 * vx, 0);
    this.inTransient = true;
  }

  computeState(x, ctx) {
    this.history.update(this.C1 * at(x, this.internalIndices[0]), ctx);
  }

  truncationStep(ctx) {
    return this.history.truncationStep(ctx);
  }

  acceptStep() {
    this.history.accept();
  }

  /** Ströme in die Anschlüsse [in+, in−, aus, V+, V−] (positiv = in den OPV hinein). */
  terminalCurrents(x) {
    const V = this.#potentials(x);
    const { I } = this.evaluate(V);
    const iin = (V[0] - V[1]) / this.model.Rin;
    return { inP: iin, inN: -iin, out: I[2], vPos: I[3], vNeg: I[4] };
  }

  /** Messwerte: U = Ausgangsspannung gegen V−, I = Strom, der aus dem Ausgang herausfließt. */
  voltage(x) {
    return this.potential(x, 2) - this.potential(x, 4);
  }

  current(x) {
    return -this.terminalCurrents(x).out;
  }

  #fail(text) {
    throw new CircuitError(`${this.name}: Modellparameter ungültig – ${text}.`, { elements: [this.name] });
  }
}
