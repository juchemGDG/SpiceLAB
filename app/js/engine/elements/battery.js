// Batterie / Akku / Netzgerät: Quellenspannung U0 mit Innenwiderstand Ri.
//
//   Klemmenspannung  U = U0 − Ri · I_ab        (I_ab = abgegebener Strom)
//
// Umsetzung wie eine Spannungsquelle mit Zweigstrom i (fließt in der Quelle von plus nach minus,
// bei Entladung also negativ). Zweiggleichung:  φ(plus) − φ(minus) − Ri · i = U0
// So ist kein innerer Knoten nötig, und Ri = 0 ergibt eine ideale Quelle.
//
// spec: { name, nodes: [plus, minus], voltage: U0 in V, internalResistance: Ri in Ω (Vorgabe 0) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';

export class Battery extends Element {
  static type = 'BAT';
  static label = 'Batterie';

  constructor(spec) {
    super(spec);
    this.emf = this.requireNumber(spec, 'voltage', { label: 'Die Quellenspannung' });
    this.internalResistance = spec.internalResistance === undefined
      ? 0
      : this.requireNumber(spec, 'internalResistance', { label: 'Der Innenwiderstand' });
    if (this.internalResistance < 0) {
      throw new CircuitError(`${this.name}: Der Innenwiderstand darf nicht negativ sein.`, { elements: [this.name] });
    }
  }

  get branchCount() {
    return 1;
  }

  stamp(system, _x, ctx) {
    const [plus, minus] = this.nodeIndices;
    const br = this.branchIndices[0];
    system.stampVoltageSource(plus, minus, br, this.emf * ctx.sourceFactor);
    system.addToMatrix(br, br, -this.internalResistance);
  }

  /** Strom in der Quelle von plus nach minus (bei Entladung negativ, wie bei der Spannungsquelle). */
  current(x) {
    return x[this.branchIndices[0]];
  }
}
