// Glühlampe – ein Widerstand, der mit der Temperatur des Glühfadens wächst.
//
// Physikalisches Modell (Wolfram-Glühfaden):
//   Widerstand:     R(T) = R_kalt · (T / T0)^a        a ≈ 1,2 für Wolfram
//   Wärmeabgabe:    P_ab(T) = k_S · (T⁴ − T0⁴) + k_L · (T − T0)
//                   (Strahlung nach Stefan-Boltzmann + Wärmeleitung über Halterung und Gas)
//   Gleichgewicht:  U² / R(T) = P_ab(T)   →  daraus folgt T und damit I = U / R(T)
//
// Kennwerte aus den Nenndaten (Aufdruck auf der Lampe, z. B. 6 V / 0,1 A):
//   R_heiß = U_N / I_N,  P_N = U_N · I_N
//   R_kalt = R_heiß / (T_N / T0)^a                 (kalt etwa 10- bis 15-mal kleiner)
//   k_S, k_L so, dass bei T_N genau P_N abgegeben wird; der Anteil der Wärmeleitung ist einstellbar.
//
// spec: { name, nodes: [a, b], ratedVoltage: U_N in V, ratedCurrent: I_N in A,
//         filamentTemperature: T_N in K (2700), exponent: a (1,2), conductionShare: (0,1) }

import { Element } from './element.js';
import { NOMINAL_TEMPERATURE } from '../junction.js';

const T0 = NOMINAL_TEMPERATURE; // Umgebungstemperatur

export class Lamp extends Element {
  static type = 'LAMP';
  static label = 'Glühlampe';

  constructor(spec) {
    super(spec);
    const U_N = this.requireNumber(spec, 'ratedVoltage', { positive: true, label: 'Die Nennspannung', unit: 'V' });
    const I_N = this.requireNumber(spec, 'ratedCurrent', { positive: true, label: 'Der Nennstrom', unit: 'A' });
    const p = { filamentTemperature: 2700, exponent: 1.2, conductionShare: 0.1, ...spec };
    this.T_N = p.filamentTemperature;
    this.a = p.exponent;
    const P_N = U_N * I_N;
    this.R_hot = U_N / I_N;
    this.R_cold = this.R_hot / (this.T_N / T0) ** this.a;
    this.kL = (p.conductionShare * P_N) / (this.T_N - T0);
    this.kS = ((1 - p.conductionShare) * P_N) / (this.T_N ** 4 - T0 ** 4);
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
   * Fadentemperatur im Gleichgewicht bei der Spannung u.
   * f(T) = u²/R(T) − P_ab(T) fällt streng mit T, die Nullstelle ist eindeutig.
   * Newton-Verfahren, abgesichert durch ein Einschlussintervall [lo, hi].
   */
  temperatureAt(u) {
    const p = u * u;
    if (p === 0) return T0;
    let lo = T0;
    let hi = T0 + p / (this.R_cold * this.kL); // dort gibt allein die Wärmeleitung schon genug ab
    let T = Math.min(Math.max(this.T, lo), hi);
    for (let k = 0; k < 100; k++) {
      const R = this.resistance(T);
      const f = p / R - this.heatLoss(T);
      if (f > 0) lo = T;
      else hi = T;
      const df = (-p * this.a) / (R * T) - this.heatLossSlope(T);
      let next = T - f / df;
      if (!(next > lo && next < hi)) next = (lo + hi) / 2; // Newton verlässt das Intervall → halbieren
      if (Math.abs(next - T) <= 1e-12 * T) return next;
      T = next;
    }
    return T;
  }

  /** Strom und Steigung dI/dU bei der Spannung u (im thermischen Gleichgewicht). */
  evaluate(u) {
    const T = this.temperatureAt(u);
    const R = this.resistance(T);
    const dR = (this.a * R) / T;
    // dT/dU aus dem Gleichgewicht (implizite Ableitung von f(T, U) = U²/R(T) − P_ab(T) = 0)
    const fU = (2 * u) / R;
    const fT = (-u * u * dR) / (R * R) - this.heatLossSlope(T);
    const dTdU = -fU / fT;
    return { T, i: u / R, g: 1 / R - ((u * dR) / (R * R)) * dTdU };
  }

  stamp(system, x, _ctx) {
    const [a, b] = this.nodeIndices;
    const u = this.voltage(x);
    const { T, i, g } = this.evaluate(u);
    Object.assign(this, { u, i, g, T });
    system.stampConductance(a, b, g);
    system.stampCurrentSource(a, b, i - g * u);
  }

  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const predicted = this.i + this.g * (this.voltage(x) - this.u);
    const actual = this.evaluate(this.voltage(x)).i;
    return Math.abs(predicted - actual) <= reltol * Math.max(Math.abs(predicted), Math.abs(actual)) + abstol;
  }

  current(x) {
    return this.evaluate(this.voltage(x)).i;
  }

  /** Fadentemperatur in K – für die Helligkeitsanzeige. */
  temperature(x) {
    return this.temperatureAt(this.voltage(x));
  }
}
