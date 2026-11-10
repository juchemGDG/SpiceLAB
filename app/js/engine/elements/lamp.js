// Glühlampe – ein Widerstand, der mit der Temperatur des Glühfadens wächst.
//
// Physikalisches Modell (Wolfram-Glühfaden):
//   Widerstand:     R(T) = R_kalt · (T / T0)^a        a ≈ 1,2 für Wolfram
//   Wärmeabgabe:    P_ab(T) = k_S · (T⁴ − T0⁴) + k_L · (T − T0)
//                   (Strahlung nach Stefan-Boltzmann + Wärmeleitung über Halterung und Gas)
//   Wärmebilanz:    C_th · dT/dt = U²/R(T) − P_ab(T)
//                   Arbeitspunkt: dT/dt = 0 (Gleichgewicht)
//                   Zeitbereich: dT/dt wie bei Kondensatoren integriert (q = C_th · T)
//   Strom:          I = U / R(T)
//
// Kennwerte aus den Nenndaten (Aufdruck auf der Lampe, z. B. 6 V / 0,1 A):
//   R_heiß = U_N / I_N,  P_N = U_N · I_N
//   R_kalt = R_heiß / (T_N / T0)^a                 (kalt etwa 10- bis 15-mal kleiner)
//   k_S, k_L so, dass bei T_N genau P_N abgegeben wird; der Anteil der Wärmeleitung ist einstellbar.
//   C_th = τ · dP_ab/dT bei T_N   (τ = Aufheizzeitkonstante, bestimmt die Einschaltstromspitze)
//
// spec: { name, nodes: [a, b], ratedVoltage: U_N in V, ratedCurrent: I_N in A,
//         filamentTemperature: T_N in K (2700), exponent: a (1,2), conductionShare: (0,1),
//         thermalTimeConstant: τ in s (0,05) }

import { Element } from './element.js';
import { NOMINAL_TEMPERATURE } from '../junction.js';
import { ChargeHistory } from '../integration.js';

const T0 = NOMINAL_TEMPERATURE; // Umgebungstemperatur
const STEADY = { g: 0, h: 0 }; // Gleichgewicht: keine Wärmespeicherung

export class Lamp extends Element {
  static type = 'LAMP';
  static label = 'Glühlampe';

  constructor(spec) {
    super(spec);
    const U_N = this.requireNumber(spec, 'ratedVoltage', { positive: true, label: 'Die Nennspannung', unit: 'V' });
    const I_N = this.requireNumber(spec, 'ratedCurrent', { positive: true, label: 'Der Nennstrom', unit: 'A' });
    const p = { filamentTemperature: 2700, exponent: 1.2, conductionShare: 0.1, thermalTimeConstant: 0.05, ...spec };
    this.requireNumber(p, 'thermalTimeConstant', { positive: true, label: 'Die Aufheizzeitkonstante', unit: 's' });
    this.T_N = p.filamentTemperature;
    this.a = p.exponent;
    const P_N = U_N * I_N;
    this.R_hot = U_N / I_N;
    this.R_cold = this.R_hot / (this.T_N / T0) ** this.a;
    this.kL = (p.conductionShare * P_N) / (this.T_N - T0);
    this.kS = ((1 - p.conductionShare) * P_N) / (this.T_N ** 4 - T0 ** 4);
    this.heatCapacity = p.thermalTimeConstant * this.heatLossSlope(this.T_N);
    this.history = new ChargeHistory();
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  reset() {
    this.u = 0; // Spannung am Linearisierungspunkt
    this.i = 0;
    this.g = 1 / this.R_cold;
    this.T = T0; // Fadentemperatur
    this.inTransient = false;
  }

  resistance(T) {
    return this.R_cold * (T / T0) ** this.a;
  }

  heatLoss(T) {
    return this.kS * (T ** 4 - T0 ** 4) + this.kL * (T - T0);
  }

  heatLossSlope(T) {
    return 4 * this.kS * T ** 3 + this.kL;
  }

  /**
   * Wärmespeicherung im laufenden Schritt:  C_th · dT/dt = g · T + h
   * (Arbeitspunkt: g = h = 0; Zeitbereich: g = ag0 · C_th, h = Vergangenheit der Integration).
   */
  #thermal(ctx) {
    if (ctx.mode !== 'tran') return STEADY;
    return { g: ctx.ag0 * this.heatCapacity, h: this.history.history(ctx) };
  }

  /**
   * Fadentemperatur bei der Spannung u:  Nullstelle von
   *   f(T) = u²/R(T) − P_ab(T) − (g·T + h)
   * f fällt streng mit T, die Nullstelle ist eindeutig. Newton-Verfahren, abgesichert durch ein
   * Einschlussintervall [lo, hi], das bei Bedarf vergrößert wird.
   */
  temperatureAt(u, { g, h } = STEADY) {
    const p = u * u;
    const f = (T) => p / this.resistance(T) - this.heatLoss(T) - (g * T + h);
    if (g === 0 && h === 0 && p === 0) return T0;
    let lo = 1; // K
    let hi = Math.max(this.T, T0) * 2;
    while (f(hi) > 0) hi *= 2;
    let T = Math.min(Math.max(this.T, lo), hi);
    for (let k = 0; k < 200; k++) {
      const R = this.resistance(T);
      const fT = f(T);
      if (fT > 0) lo = T;
      else hi = T;
      const df = (-p * this.a) / (R * T) - this.heatLossSlope(T) - g;
      let next = T - fT / df;
      if (!(next > lo && next < hi)) next = (lo + hi) / 2; // Newton verlässt das Intervall → halbieren
      if (Math.abs(next - T) <= 1e-12 * T) return next;
      T = next;
    }
    return T;
  }

  /** Strom, Steigung dI/dU und Temperatur bei der Spannung u. */
  evaluate(u, thermal = STEADY) {
    const T = this.temperatureAt(u, thermal);
    const R = this.resistance(T);
    const dR = (this.a * R) / T;
    // dT/dU aus der Wärmebilanz (implizite Ableitung von f(T, U) = 0)
    const fU = (2 * u) / R;
    const fT = (-u * u * dR) / (R * R) - this.heatLossSlope(T) - thermal.g;
    const dTdU = -fU / fT;
    return { T, i: u / R, g: 1 / R - ((u * dR) / (R * R)) * dTdU };
  }

  stamp(system, x, ctx) {
    const [a, b] = this.nodeIndices;
    const u = this.voltage(x);
    const { T, i, g } = this.evaluate(u, this.#thermal(ctx));
    Object.assign(this, { u, i, g, T });
    system.stampConductance(a, b, g);
    system.stampCurrentSource(a, b, i - g * u);
  }

  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const u = this.voltage(x);
    const predicted = this.i + this.g * (u - this.u);
    const actual = this.evaluate(u, this.#thermal(ctx)).i;
    return Math.abs(predicted - actual) <= reltol * Math.max(Math.abs(predicted), Math.abs(actual)) + abstol;
  }

  // ── Zeitbereich: Fadentemperatur als Speichergröße ──

  initTransient(x, _ctx, useInitialConditions) {
    // Anfangsbedingung: Lampe kalt. Sonst Gleichgewicht des Arbeitspunkts.
    const T = useInitialConditions ? T0 : this.temperatureAt(this.voltage(x));
    this.T = T;
    this.iNow = useInitialConditions ? 0 : this.voltage(x) / this.resistance(T); // Strom bei t = 0
    this.history.init(this.heatCapacity * T, 0);
    this.inTransient = true;
  }

  computeState(x, ctx) {
    const u = this.voltage(x);
    const { T, i } = this.evaluate(u, this.#thermal(ctx));
    this.T = T;
    this.iNow = i;
    this.history.update(this.heatCapacity * T, ctx);
  }

  truncationStep(ctx) {
    return this.history.truncationStep(ctx);
  }

  acceptStep() {
    this.history.accept();
  }

  current(x) {
    return this.inTransient ? this.iNow ?? 0 : this.evaluate(this.voltage(x)).i;
  }

  /** Fadentemperatur in K – für die Helligkeitsanzeige. */
  temperature(x) {
    return this.inTransient ? this.T : this.temperatureAt(this.voltage(x));
  }
}
