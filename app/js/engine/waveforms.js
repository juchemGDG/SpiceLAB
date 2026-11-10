// Zeitverläufe für Spannungs- und Stromquellen (wie SIN und PULSE in SPICE).
//
// Sinus:  { shape: 'sine', offset, amplitude, frequency, delay = 0, phase = 0 (Grad), damping = 0 (1/s) }
//         u(t) = offset + amplitude · e^(−damping·(t−delay)) · sin(2π·f·(t−delay) + phase)   für t ≥ delay
//         vor delay: offset + amplitude · sin(phase)
// Puls:   { shape: 'pulse', low, high, delay = 0, rise = 1 ns, fall = 1 ns, width, period = ∞ }
//         Rechteckspannung = Puls mit period; Tastgrad = width / period.
//
// Haltepunkte: Die Zeitbereichsanalyse fragt nextBreakpoint(t) ab und rechnet genau bis zur
// nächsten Ecke des Verlaufs – sonst würde sie über eine Flanke hinwegspringen.

import { CircuitError } from './errors.js';

const DEFAULT_EDGE = 1e-9; // s

/** Prüft die Angaben und füllt Vorgaben auf. */
export function normalizeWaveform(w, name) {
  const fail = (text) => {
    throw new CircuitError(`${name}: ${text}`, { elements: [name] });
  };
  const num = (v, label, { positive = false, nonNegative = false } = {}) => {
    if (typeof v !== 'number' || Number.isNaN(v)) fail(`${label} fehlt oder ist keine Zahl.`);
    if (positive && !(v > 0)) fail(`${label} muss größer als 0 sein.`);
    if (nonNegative && !(v >= 0)) fail(`${label} darf nicht negativ sein.`);
    return v;
  };

  if (w.shape === 'sine') {
    const r = { shape: 'sine', delay: 0, phase: 0, damping: 0, ...w };
    num(r.offset, 'Gleichanteil');
    num(r.amplitude, 'Amplitude');
    num(r.frequency, 'Frequenz', { positive: true });
    num(r.delay, 'Verzögerung', { nonNegative: true });
    num(r.phase, 'Phase');
    num(r.damping, 'Dämpfung', { nonNegative: true });
    return r;
  }
  if (w.shape === 'pulse') {
    const r = { shape: 'pulse', delay: 0, rise: DEFAULT_EDGE, fall: DEFAULT_EDGE, period: Infinity, ...w };
    num(r.low, 'Unterer Wert');
    num(r.high, 'Oberer Wert');
    num(r.delay, 'Verzögerung', { nonNegative: true });
    num(r.rise, 'Anstiegszeit', { positive: true });
    num(r.fall, 'Abfallzeit', { positive: true });
    num(r.width, 'Pulsdauer', { nonNegative: true });
    num(r.period, 'Periodendauer', { positive: true });
    if (r.rise + r.width + r.fall > r.period) fail('Anstieg + Pulsdauer + Abfall sind länger als die Periode.');
    return r;
  }
  return fail(`unbekannter Zeitverlauf „${w.shape}“.`);
}

/** Wert des Zeitverlaufs zur Zeit t. */
export function waveformValue(w, t) {
  if (w.shape === 'sine') {
    const phase = (w.phase * Math.PI) / 180;
    if (t < w.delay) return w.offset + w.amplitude * Math.sin(phase);
    const s = t - w.delay;
    return w.offset + w.amplitude * Math.exp(-w.damping * s) * Math.sin(2 * Math.PI * w.frequency * s + phase);
  }
  // Puls
  if (t < w.delay) return w.low;
  const s = Number.isFinite(w.period) ? (t - w.delay) % w.period : t - w.delay;
  if (s < w.rise) return w.low + ((w.high - w.low) * s) / w.rise;
  if (s < w.rise + w.width) return w.high;
  if (s < w.rise + w.width + w.fall) return w.high - ((w.high - w.low) * (s - w.rise - w.width)) / w.fall;
  return w.low;
}

/** Nächster Knick des Verlaufs nach der Zeit t (Infinity, wenn keiner mehr kommt). */
export function waveformNextBreakpoint(w, t) {
  if (w.shape === 'sine') return t < w.delay ? w.delay : Infinity;
  if (t < w.delay) return w.delay;
  const corners = [0, w.rise, w.rise + w.width, w.rise + w.width + w.fall];
  const periodIndex = Number.isFinite(w.period) ? Math.floor((t - w.delay) / w.period) : 0;
  // Ecken dieser und der nächsten Periode durchsuchen
  for (let k = periodIndex; k <= periodIndex + 1; k++) {
    if (k > 0 && !Number.isFinite(w.period)) break;
    const start = w.delay + k * (Number.isFinite(w.period) ? w.period : 0);
    for (const c of corners) {
      const bp = start + c;
      if (bp > t * (1 + 1e-12) + 1e-18) return bp;
    }
  }
  return Infinity;
}

/**
 * Empfohlene größte Schrittweite: Ein Sinus soll auf dem Oszilloskop rund aussehen
 * (mindestens 40 Punkte je Periode). Die Genauigkeit regelt ohnehin die Fehlerschätzung.
 */
export function waveformMaxStep(w) {
  return w.shape === 'sine' ? 1 / (40 * w.frequency) : Infinity;
}
