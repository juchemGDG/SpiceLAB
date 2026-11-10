// Ohm'scher Widerstand: I = U / R
import { Element } from './element.js';

export class Resistor extends Element {
  static type = 'R';
  static label = 'Widerstand';

  /** spec: { name, nodes: [a, b], value: R in Ω } */
  constructor(spec) {
    super(spec);
    this.resistance = this.requireNumber(spec, 'value', { positive: true, label: 'Der Widerstand', unit: 'Ω' });
  }

  stamp(system) {
    const [a, b] = this.nodeIndices;
    system.stampConductance(a, b, 1 / this.resistance);
  }

  current(x) {
    return this.voltage(x) / this.resistance;
  }
}
