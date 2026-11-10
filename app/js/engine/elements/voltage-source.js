// Ideale Spannungsquelle: φ(plus) − φ(minus) = U, egal welcher Strom fließt.
// Reale Batterien und Netzgeräte (mit Innenwiderstand) baut die Bibliothek später daraus auf.
import { Element } from './element.js';
import { normalizeWaveform, waveformValue, waveformNextBreakpoint, waveformMaxStep } from '../waveforms.js';

export class VoltageSource extends Element {
  static type = 'V';
  static label = 'Spannungsquelle';

  /**
   * spec: { name, nodes: [plus, minus], value: U in V }
   *    oder { name, nodes, waveform: { shape: 'sine' | 'pulse', … } }  (siehe waveforms.js)
   */
  constructor(spec) {
    super(spec);
    if (spec.waveform) this.waveform = normalizeWaveform(spec.waveform, this.name);
    else this.dcValue = this.requireNumber(spec, 'value', { label: 'Die Spannung' });
  }

  get branchCount() {
    return 1;
  }

  /** Quellenspannung zur Zeit t. */
  valueAt(t) {
    return this.waveform ? waveformValue(this.waveform, t) : this.dcValue;
  }

  nextBreakpoint(t) {
    return this.waveform ? waveformNextBreakpoint(this.waveform, t) : Infinity;
  }

  maxStep() {
    return this.waveform ? waveformMaxStep(this.waveform) : Infinity;
  }

  stamp(system, _x, ctx) {
    const [plus, minus] = this.nodeIndices;
    // sourceFactor < 1 nur beim Quellen-Stepping (Konvergenzhilfe, siehe op-strategies.js)
    system.stampVoltageSource(plus, minus, this.branchIndices[0], this.valueAt(ctx.time) * ctx.sourceFactor);
  }

  /** Strom in der Quelle von plus nach minus (gibt die Quelle Energie ab, ist er negativ). */
  current(x) {
    return x[this.branchIndices[0]];
  }
}
