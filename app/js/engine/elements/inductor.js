// Spule mit Wicklungswiderstand:  u = R · i + dΦ/dt,   Φ = L · i  (+ M · i_andere bei Kopplung)
//
// Der Strom i ist eine eigene Unbekannte (Zweigstrom), wie bei SPICE.
// Zweiggleichung:  φa − φb − R·i − dΦ/dt = 0
//   Arbeitspunkt:  dΦ/dt = 0  → die Spule ist ein Leiter mit dem Wicklungswiderstand R.
//   Zeitbereich:   dΦ/dt = ag0 · Φ_n + Vergangenheit  (integration.js)
//
// spec: { name, nodes: [a, b], value: L in H, resistance: Wicklungswiderstand in Ω (Vorgabe 0),
//         ic: Anfangsstrom in A (optional, Vorgabe 0; gilt beim Start „mit Anfangsbedingungen“) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { ChargeHistory } from '../integration.js';

export class Inductor extends Element {
  static type = 'L';
  static label = 'Spule';

  constructor(spec) {
    super(spec);
    this.inductance = this.requireNumber(spec, 'value', { positive: true, label: 'Die Induktivität', unit: 'H' });
    this.resistance = spec.resistance === undefined ? 0 : this.requireNumber(spec, 'resistance', { label: 'Der Wicklungswiderstand' });
    if (this.resistance < 0) {
      throw new CircuitError(`${this.name}: Der Wicklungswiderstand darf nicht negativ sein.`, { elements: [this.name] });
    }
    this.initialCurrent = spec.ic === undefined ? 0 : this.requireNumber(spec, 'ic', { label: 'Der Anfangsstrom' });
    this.couplings = []; // { other: Inductor, M: Gegeninduktivität } – wird von der Kopplung (K) gefüllt
    this.history = new ChargeHistory();
  }

  get branchCount() {
    return 1;
  }

  /** Magnetischer Fluss Φ = L·i + Σ M·i_andere aus den Strömen in x. */
  flux(x) {
    let phi = this.inductance * x[this.branchIndices[0]];
    for (const { other, M } of this.couplings) phi += M * x[other.branchIndices[0]];
    return phi;
  }

  initTransient(x, _ctx, useInitialConditions) {
    let phi;
    if (useInitialConditions) {
      phi = this.inductance * this.initialCurrent;
      for (const { other, M } of this.couplings) phi += M * other.initialCurrent;
    } else {
      phi = this.flux(x);
    }
    this.history.init(phi, 0); // im Arbeitspunkt ist dΦ/dt = 0
  }

  stamp(system, _x, ctx) {
    const [a, b] = this.nodeIndices;
    const br = this.branchIndices[0];
    // Knotenregel: i fließt aus a ab und in b zu
    system.addToMatrix(a, br, 1);
    system.addToMatrix(b, br, -1);
    // Zweiggleichung φa − φb − R·i − (ag0·Φ_n) = Vergangenheit
    system.addToMatrix(br, a, 1);
    system.addToMatrix(br, b, -1);
    system.addToMatrix(br, br, -this.resistance);
    if (ctx.mode !== 'tran') return;
    system.addToMatrix(br, br, -ctx.ag0 * this.inductance);
    for (const { other, M } of this.couplings) system.addToMatrix(br, other.branchIndices[0], -ctx.ag0 * M);
    system.addToRhs(br, this.history.history(ctx));
  }

  computeState(x, ctx) {
    this.history.update(this.flux(x), ctx);
  }

  truncationStep(ctx) {
    return this.history.truncationStep(ctx);
  }

  acceptStep() {
    this.history.accept();
  }

  current(x) {
    return x[this.branchIndices[0]];
  }
}
