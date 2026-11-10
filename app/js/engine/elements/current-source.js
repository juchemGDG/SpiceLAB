// Ideale Stromquelle: der Strom I fließt in der Quelle von nodes[0] nach nodes[1],
// tritt also an nodes[1] in die Schaltung aus – egal welche Spannung dafür nötig ist.
import { Element } from './element.js';
import { normalizeWaveform, waveformValue, waveformNextBreakpoint, waveformMaxStep } from '../waveforms.js';

export class CurrentSource extends Element {
  static type = 'I';
  static label = 'Stromquelle';

  /**
   * spec: { name, nodes: [from, to], value: I in A }
   *    oder { name, nodes, waveform: { shape: 'sine' | 'pulse', … } }  (siehe waveforms.js)
   */
  constructor(spec) {
    super(spec);
    if (spec.waveform) this.waveform = normalizeWaveform(spec.waveform, this.name);
    else this.dcValue = this.requireNumber(spec, 'value', { label: 'Die Stromstärke' });
  }

  /** Quellenstrom zur Zeit t. */
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
    const [from, to] = this.nodeIndices;
    // sourceFactor < 1 nur beim Quellen-Stepping (Konvergenzhilfe, siehe op-strategies.js)
    system.stampCurrentSource(from, to, this.valueAt(ctx.time) * ctx.sourceFactor);
    this.lastValue = this.valueAt(ctx.time);
  }

  current(_x) {
    return this.lastValue ?? this.valueAt(0);
  }
}
