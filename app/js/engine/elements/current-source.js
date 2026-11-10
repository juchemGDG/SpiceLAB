// Ideale Stromquelle: der Strom I fließt in der Quelle von nodes[0] nach nodes[1],
// tritt also an nodes[1] in die Schaltung aus – egal welche Spannung dafür nötig ist.
import { Element } from './element.js';

export class CurrentSource extends Element {
  static type = 'I';

  /** spec: { name, nodes: [from, to], value: I in A } */
  constructor(spec) {
    super(spec);
    this.currentValue = this.requireNumber(spec, 'value', { label: 'Die Stromstärke' });
  }

  stamp(system) {
    const [from, to] = this.nodeIndices;
    system.stampCurrentSource(from, to, this.currentValue);
  }

  current(_x) {
    return this.currentValue;
  }
}
