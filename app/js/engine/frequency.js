// Frequenzgang: Verstärkung und Phasenverschiebung über der Frequenz.
//
// Gemessen wie im Labor: Die Sinusquelle wird auf eine Frequenz gestellt, die Schaltung so lange
// durchgerechnet, bis der Einschwingvorgang abgeklungen ist (Zeitbereichsanalyse), und aus den letzten
// ganzen Perioden werden Amplitude und Phase von Ein- und Ausgang bestimmt (Fourier-Komponente bei der
// Messfrequenz). Das berücksichtigt auch nichtlineare Bauteile bei der gewählten Amplitude –
// im Gegensatz zu einer linearisierten AC-Analyse in SPICE („.ac“).

import { transient, valueAt } from './transient.js';
import { CircuitError } from './errors.js';

const SAMPLES_PER_PERIOD = 40; // Rechenpunkte je Periode
const DFT_POINTS_PER_PERIOD = 32;

/** Logarithmisch verteilte Frequenzen von fMin bis fMax. */
export function logFrequencies(fMin, fMax, perDecade = 10) {
  if (!(fMin > 0) || !(fMax > fMin)) throw new CircuitError('Die Frequenzen müssen positiv sein, und „bis“ muss größer als „von“ sein.');
  const n = Math.max(2, Math.round(Math.log10(fMax / fMin) * perDecade) + 1);
  return Array.from({ length: n }, (_, k) => fMin * (fMax / fMin) ** (k / (n - 1)));
}

/** Amplitude und Phase (Bogenmaß) der Komponente bei der Frequenz f aus der Kurve über [t0, t1]. */
export function fourierComponent(time, values, f, t0, t1) {
  const periods = Math.round((t1 - t0) * f);
  const n = Math.max(8, periods * DFT_POINTS_PER_PERIOD);
  let sine = 0;
  let cosine = 0;
  for (let k = 0; k < n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    const y = valueAt(time, values, t);
    const arg = 2 * Math.PI * f * t;
    sine += y * Math.sin(arg);
    cosine += y * Math.cos(arg);
  }
  sine *= 2 / n;
  cosine *= 2 / n;
  // y = A·sin(ωt + φ) = A·cosφ·sin(ωt) + A·sinφ·cos(ωt)
  return { amplitude: Math.hypot(sine, cosine), phase: Math.atan2(cosine, sine) };
}

/**
 * @param {object} netlist  SpiceLab-Netzliste mit einer Sinusquelle
 * @param {object} o
 * @param {string} o.source   Name der Sinusquelle (Element vom Typ V mit waveform sine)
 * @param {string[]} o.outputs Knoten, deren Potenzial gemessen wird
 * @param {number[]} o.frequencies
 * @param {number} [o.settlePeriods]  Perioden zum Einschwingen (Vorgabe 8)
 * @param {number} [o.measurePeriods] ausgewertete Perioden (Vorgabe 4)
 * @returns {{ frequencies: number[], outputs: Record<string, {gain: number[], dB: number[], phase: number[]}>, inputAmplitude: number }}
 *   phase in Grad, Ausgang gegenüber Eingang, stetig fortgesetzt (ohne Sprünge um 360°)
 */
export function frequencyResponse(netlist, { source, outputs, frequencies, settlePeriods = 8, measurePeriods = 4 }) {
  const spec = netlist.elements.find((e) => e.name === source);
  if (spec?.type !== 'V' || spec.waveform?.shape !== 'sine') {
    throw new CircuitError('Für den Frequenzgang braucht die Schaltung eine Wechselspannungsquelle (Sinus).');
  }
  if (!(spec.waveform.amplitude > 0)) throw new CircuitError('Die Amplitude der Wechselspannungsquelle muss größer als 0 sein.');
  const [plus, minus] = spec.nodes;
  const result = Object.fromEntries(outputs.map((o) => [o, { gain: [], dB: [], phase: [] }]));

  for (const f of frequencies) {
    const elements = netlist.elements.map((e) => (e.name === source ? { ...e, waveform: { ...e.waveform, frequency: f } } : e));
    const total = (settlePeriods + measurePeriods) / f;
    const dt = 1 / (f * SAMPLES_PER_PERIOD);
    const tr = transient({ elements }, { stopTime: total, step: dt, maxStep: dt });
    const t0 = settlePeriods / f;
    const pot = (n) => (n === '0' ? new Float64Array(tr.time.length) : tr.potentials[n]);
    const vin = Float64Array.from(pot(plus), (v, k) => v - pot(minus)[k]);
    const input = fourierComponent(tr.time, vin, f, t0, total);
    for (const out of outputs) {
      const o = fourierComponent(tr.time, pot(out), f, t0, total);
      const gain = o.amplitude / input.amplitude;
      let phase = ((o.phase - input.phase) * 180) / Math.PI;
      phase = ((phase + 180) % 360 + 360) % 360 - 180; // auf (−180, 180]
      const prev = result[out].phase.at(-1);
      if (prev !== undefined) {
        while (phase - prev > 180) phase -= 360; // stetig: keine Sprünge um 360°
        while (prev - phase > 180) phase += 360;
      }
      result[out].gain.push(gain);
      result[out].dB.push(20 * Math.log10(Math.max(gain, 1e-12)));
      result[out].phase.push(phase);
    }
  }
  return { frequencies: [...frequencies], outputs: result, inputAmplitude: spec.waveform.amplitude };
}

/**
 * Frequenzen, bei denen die Verstärkung 3 dB unter dem Maximum liegt (Grenzfrequenzen), logarithmisch interpoliert.
 * @returns {number[]} aufsteigend; bei Tiefpass eine, bei Bandpass zwei Frequenzen
 */
export function cutoffFrequencies(frequencies, dB) {
  const level = Math.max(...dB) - 3.0103;
  const out = [];
  for (let k = 1; k < dB.length; k++) {
    if ((dB[k - 1] - level) * (dB[k] - level) < 0) {
      const f = (level - dB[k - 1]) / (dB[k] - dB[k - 1]);
      out.push(frequencies[k - 1] * (frequencies[k] / frequencies[k - 1]) ** f);
    }
  }
  return out;
}
