// Gleichstrommotor (permanenterregt) – elektrisch und mechanisch.
//
// Elektrisch (Zweigstrom i von plus nach minus):   U = R·i + L·di/dt + k·ω
// Mechanisch (innerer Knoten „w“, sein Potenzial ist die Winkelgeschwindigkeit ω in rad/s):
//                                                  J·dω/dt = k·i − M_R·tanh(ω/ω_s) − M_Last
//   k     Motorkonstante (Gegenspannung je rad/s = Drehmoment je A)
//   M_R   Reibungsmoment (Haftreibung, geglättet mit ω_s = 1 rad/s) → der Motor läuft erst an,
//         wenn k·i die Reibung übersteigt (Anlaufspannung ≈ R · I_0)
//   J     Trägheitsmoment aus der mechanischen Zeitkonstante τ_m = J·R/k²
//
// Kennwerte aus dem Datenblatt:
//   R   = U_N / I_Anlauf                    (Anlauf- bzw. Blockierstrom bei Nennspannung)
//   k   = (U_N − R·I_0) / ω_0               (Leerlauf: Drehzahl n_0, Strom I_0)
//   M_R = k · I_0
//
// spec: { name, nodes: [plus, minus], ratedVoltage: U_N, noLoadSpeed: n_0 in 1/min,
//         noLoadCurrent: I_0 in A, stallCurrent: I_Anlauf in A, inductance: L in H (Vorgabe 0),
//         mechanicalTimeConstant: τ_m in s (Vorgabe 0,05), loadTorque: M_Last in N·m (Vorgabe 0) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { ChargeHistory } from '../integration.js';

const at = Element.at;
const OMEGA_SMOOTH = 1; // rad/s

export class Motor extends Element {
  static type = 'MOT';
  static label = 'Motor';

  constructor(spec) {
    super(spec);
    const p = { inductance: 0, mechanicalTimeConstant: 0.05, loadTorque: 0, ...spec };
    const U = this.requireNumber(p, 'ratedVoltage', { positive: true, label: 'Die Nennspannung', unit: 'V' });
    const n0 = this.requireNumber(p, 'noLoadSpeed', { positive: true, label: 'Die Leerlaufdrehzahl', unit: '1/min' });
    const I0 = this.requireNumber(p, 'noLoadCurrent', { positive: true, label: 'Der Leerlaufstrom', unit: 'A' });
    const Is = this.requireNumber(p, 'stallCurrent', { positive: true, label: 'Der Anlaufstrom', unit: 'A' });
    const tau = this.requireNumber(p, 'mechanicalTimeConstant', { positive: true, label: 'Die Anlaufzeitkonstante', unit: 's' });
    this.inductance = this.requireNumber(p, 'inductance', { label: 'Die Induktivität' });
    this.loadTorque = this.requireNumber(p, 'loadTorque', { label: 'Das Lastmoment' });
    if (!(Is > I0) || this.inductance < 0) {
      throw new CircuitError(`${this.name}: Der Anlaufstrom muss größer als der Leerlaufstrom sein.`, { elements: [this.name] });
    }
    this.resistance = U / Is;
    this.k = (U - this.resistance * I0) / ((n0 * 2 * Math.PI) / 60);
    this.frictionTorque = this.k * I0;
    this.inertia = (tau * this.k * this.k) / this.resistance;
    this.flux = new ChargeHistory(); // q = L · i
    this.momentum = new ChargeHistory(); // q = J · ω (Drehimpuls)
    this.reset();
  }

  get branchCount() {
    return 1;
  }

  get internalNodes() {
    return ['w'];
  }

  get isNonlinear() {
    return true; // wegen der Haftreibung
  }

  reset() {
    this.lin = null;
    this.inTransient = false;
  }

  /** Reibungsmoment und seine Ableitung nach ω. */
  friction(omega) {
    const t = Math.tanh(omega / OMEGA_SMOOTH);
    return { m: this.frictionTorque * t, dm: (this.frictionTorque * (1 - t * t)) / OMEGA_SMOOTH };
  }

  stamp(system, x, ctx) {
    const [plus, minus] = this.nodeIndices;
    const br = this.branchIndices[0];
    const w = this.internalIndices[0];

    // elektrisch: Knotenregel und  φ+ − φ− − R·i − k·ω (− L·di/dt) = 0
    system.addToMatrix(plus, br, 1);
    system.addToMatrix(minus, br, -1);
    system.addToMatrix(br, plus, 1);
    system.addToMatrix(br, minus, -1);
    system.addToMatrix(br, br, -this.resistance);
    system.addToMatrix(br, w, -this.k);

    // mechanisch am Knoten w:  J·dω/dt + Reibung(ω) + M_Last − k·i = 0
    system.addToMatrix(w, br, -this.k);
    system.addToRhs(w, -this.loadTorque);
    const omega = at(x, w);
    const { m, dm } = this.friction(omega);
    this.lin = { omega, m, dm };
    system.stampConductance(w, -1, dm);
    system.stampCurrentSource(w, -1, m - dm * omega);

    if (ctx.mode === 'tran') {
      if (this.inductance > 0) {
        system.addToMatrix(br, br, -ctx.ag0 * this.inductance);
        system.addToRhs(br, this.flux.history(ctx));
      }
      system.stampConductance(w, -1, ctx.ag0 * this.inertia);
      system.stampCurrentSource(w, -1, this.momentum.history(ctx));
    }
  }

  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const omega = at(x, this.internalIndices[0]);
    const predicted = this.lin.m + this.lin.dm * (omega - this.lin.omega);
    return Math.abs(predicted - this.lin.m) <= reltol * Math.max(Math.abs(predicted), Math.abs(this.lin.m)) + abstol;
  }

  initTransient(x, _ctx, useInitialConditions) {
    const i = useInitialConditions ? 0 : x[this.branchIndices[0]];
    const omega = useInitialConditions ? 0 : at(x, this.internalIndices[0]);
    this.flux.init(this.inductance * i, 0);
    this.momentum.init(this.inertia * omega, 0);
    this.inTransient = true;
  }

  computeState(x, ctx) {
    this.flux.update(this.inductance * x[this.branchIndices[0]], ctx);
    this.momentum.update(this.inertia * at(x, this.internalIndices[0]), ctx);
  }

  truncationStep(ctx) {
    const h = this.momentum.truncationStep(ctx);
    return this.inductance > 0 ? Math.min(h, this.flux.truncationStep(ctx)) : h;
  }

  acceptStep() {
    this.flux.accept();
    this.momentum.accept();
  }

  current(x) {
    return x[this.branchIndices[0]];
  }

  /** Drehzahl in Umdrehungen pro Minute. */
  speed(x) {
    return (at(x, this.internalIndices[0]) * 60) / (2 * Math.PI);
  }
}
