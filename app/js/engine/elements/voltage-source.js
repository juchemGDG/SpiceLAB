// Ideale Spannungsquelle: φ(plus) − φ(minus) = U, egal welcher Strom fließt.
// Reale Batterien und Netzgeräte (mit Innenwiderstand) baut die Bibliothek später daraus auf.
import { Element } from './element.js';

export class VoltageSource extends Element {
  static type = 'V';

  /** spec: { name, nodes: [plus, minus], value: U in V } */
  constructor(spec) {
    super(spec);
    this.voltageValue = this.requireNumber(spec, 'value', { label: 'Die Spannung' });
  }

  get branchCount() {
    return 1;
  }

  stamp(system, _x, ctx) {
    const [plus, minus] = this.nodeIndices;
    // sourceFactor < 1 nur beim Quellen-Stepping (Konvergenzhilfe, siehe dc.js)
    system.stampVoltageSource(plus, minus, this.branchIndices[0], this.voltageValue * ctx.sourceFactor);
  }

  /** Strom in der Quelle von plus nach minus (gibt die Quelle Energie ab, ist er negativ). */
  current(x) {
    return x[this.branchIndices[0]];
  }
}
