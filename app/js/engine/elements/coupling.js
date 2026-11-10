// Induktive Kopplung zweier Spulen (Transformator), wie das K-Element in SPICE.
//
// Gegeninduktivität:  M = k · √(L1 · L2),   0 < k ≤ 1  (k = 1: ohne Streufluss)
// Jede Spule bekommt den Fluss der anderen dazu:  Φ1 = L1·i1 + M·i2,  Φ2 = L2·i2 + M·i1
// Wicklungssinn: Der erste Anschluss jeder Spule ist der Wicklungsanfang (Punkt im Schaltzeichen).
// Spannung des idealen Übertragers: u2/u1 ≈ √(L2/L1) = N2/N1.
//
// spec: { type: 'K', name, inductors: ['L1', 'L2'], k: Koppelfaktor }
// Die Kopplung hat keine eigenen Anschlüsse und stempelt nichts – die Spulen rechnen M mit ein.

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { Inductor } from './inductor.js';

export class Coupling extends Element {
  static type = 'K';
  static label = 'Kopplung';
  static terminalCount = 0;

  constructor(spec) {
    super({ ...spec, nodes: [] });
    const fail = (text) => {
      throw new CircuitError(`${this.name}: ${text}`, { elements: [this.name] });
    };
    if (!Array.isArray(spec.inductors) || spec.inductors.length !== 2 || spec.inductors[0] === spec.inductors[1]) {
      fail('Eine Kopplung verbindet genau zwei verschiedene Spulen.');
    }
    this.inductorNames = spec.inductors;
    this.k = this.requireNumber(spec, 'k', { positive: true, label: 'Der Koppelfaktor' });
    if (this.k > 1) fail('Der Koppelfaktor darf höchstens 1 sein.');
  }

  link(elementsByName) {
    const [l1, l2] = this.inductorNames.map((n) => elementsByName.get(n));
    for (const [name, el] of [[this.inductorNames[0], l1], [this.inductorNames[1], l2]]) {
      if (!(el instanceof Inductor)) {
        throw new CircuitError(`${this.name}: „${name}“ ist keine Spule.`, { elements: [this.name, name] });
      }
    }
    this.mutualInductance = this.k * Math.sqrt(l1.inductance * l2.inductance);
    l1.couplings.push({ other: l2, M: this.mutualInductance });
    l2.couplings.push({ other: l1, M: this.mutualInductance });
  }

  stamp() {}
}
