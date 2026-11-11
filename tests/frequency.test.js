// Frequenzgang gegen die bekannten Formeln der Filter aus dem Unterricht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frequencyResponse, logFrequencies, cutoffFrequencies, fourierComponent } from '../app/js/engine/frequency.js';
import { CircuitError } from '../app/js/engine/errors.js';

const sine = (name = 'V1') => ({ type: 'V', name, nodes: ['in', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 1, frequency: 1000 } });
const R = (name, a, b, value) => ({ type: 'R', name, nodes: [a, b], value });
const C = (name, a, b, value) => ({ type: 'C', name, nodes: [a, b], value });
const L = (name, a, b, value) => ({ type: 'L', name, nodes: [a, b], value });
const rad = (deg) => (deg * Math.PI) / 180;

test('Fourier-Komponente: Amplitude und Phase einer Sinusschwingung', () => {
  const f = 50;
  const time = Float64Array.from({ length: 2001 }, (_, k) => k * 1e-4);
  const values = time.map((t) => 3 + 2.5 * Math.sin(2 * Math.PI * f * t + 0.7)); // Gleichanteil stört nicht
  const c = fourierComponent(time, values, f, 0.04, 0.2);
  assert.ok(Math.abs(c.amplitude - 2.5) < 1e-3, `A = ${c.amplitude}`);
  assert.ok(Math.abs(c.phase - 0.7) < 1e-3, `φ = ${c.phase}`);
});

test('logarithmische Frequenzen: Endpunkte und gleiches Verhältnis', () => {
  const f = logFrequencies(10, 10000, 5);
  assert.equal(f.length, 16);
  assert.ok(Math.abs(f[0] - 10) < 1e-9 && Math.abs(f.at(-1) - 10000) < 1e-6);
  assert.ok(Math.abs(f[1] / f[0] - f[2] / f[1]) < 1e-9);
  assert.throws(() => logFrequencies(0, 10), CircuitError);
});

test('RC-Tiefpass (1 kΩ, 159 nF): −3 dB und −45° bei fg = 1 kHz, −20 dB/Dekade', () => {
  const fg = 1 / (2 * Math.PI * 1000 * 159.155e-9);
  const freqs = [fg / 10, fg, fg * 10, fg * 100];
  const r = frequencyResponse({ elements: [sine(), R('R1', 'in', 'out', 1000), C('C1', 'out', '0', 159.155e-9)] },
    { source: 'V1', outputs: ['out'], frequencies: freqs });
  const o = r.outputs.out;
  const expected = freqs.map((f) => -10 * Math.log10(1 + (f / fg) ** 2));
  o.dB.forEach((v, k) => assert.ok(Math.abs(v - expected[k]) < 0.05, `f = ${freqs[k]}: ${v} dB, erwartet ${expected[k]}`));
  assert.ok(Math.abs(o.phase[1] + 45) < 1, `Phase bei fg: ${o.phase[1]}°`);
  assert.ok(Math.abs(o.phase[0] + Math.atan(0.1) * 180 / Math.PI) < 0.5);
  assert.ok(Math.abs(o.dB[3] - o.dB[2] + 20) < 0.1, 'Steigung −20 dB/Dekade');
});

test('CR-Hochpass: +45° bei fg, Verstärkung steigt', () => {
  const fg = 1 / (2 * Math.PI * 1000 * 159.155e-9);
  const r = frequencyResponse({ elements: [sine(), C('C1', 'in', 'out', 159.155e-9), R('R1', 'out', '0', 1000)] },
    { source: 'V1', outputs: ['out'], frequencies: [fg / 10, fg, fg * 10] });
  assert.ok(Math.abs(r.outputs.out.dB[1] + 3.01) < 0.05);
  assert.ok(Math.abs(r.outputs.out.phase[1] - 45) < 1);
  assert.ok(r.outputs.out.dB[0] < r.outputs.out.dB[1] && r.outputs.out.dB[1] < r.outputs.out.dB[2]);
});

test('Reihenschwingkreis, Ausgang am Widerstand (Bandpass): Maximum 0 dB bei f0, Phase 0°, Güte', () => {
  const [Lv, Cv, Rv] = [10e-3, 10e-6, 5];
  const f0 = 1 / (2 * Math.PI * Math.sqrt(Lv * Cv));
  const Q = Math.sqrt(Lv / Cv) / Rv;
  const freqs = logFrequencies(f0 / 3, f0 * 3, 40);
  const r = frequencyResponse({ elements: [sine(), L('L1', 'in', 'a', Lv), C('C1', 'a', 'out', Cv), R('R1', 'out', '0', Rv)] },
    { source: 'V1', outputs: ['out'], frequencies: freqs, settlePeriods: 25 });
  const o = r.outputs.out;
  const peak = o.dB.indexOf(Math.max(...o.dB));
  assert.ok(Math.abs(freqs[peak] / f0 - 1) < 0.03, `Maximum bei ${freqs[peak]} Hz, f0 = ${f0} Hz`);
  assert.ok(Math.abs(o.dB[peak]) < 0.1);
  assert.ok(Math.abs(o.phase[peak]) < 5);
  assert.ok(o.phase[0] > 45 && o.phase.at(-1) < -45, 'Phase läuft von +90° nach −90°');
  const edges = cutoffFrequencies(freqs, o.dB);
  assert.equal(edges.length, 2);
  const measuredQ = f0 / (edges[1] - edges[0]);
  assert.ok(Math.abs(measuredQ / Q - 1) < 0.05, `Güte ${measuredQ}, erwartet ${Q}`);
});

test('Grenzfrequenz-Bestimmung beim Tiefpass', () => {
  const fg = 1 / (2 * Math.PI * 1000 * 159.155e-9);
  const freqs = logFrequencies(10, 100000, 10);
  const dB = freqs.map((f) => -10 * Math.log10(1 + (f / fg) ** 2));
  const [found] = cutoffFrequencies(freqs, dB);
  assert.ok(Math.abs(found / fg - 1) < 0.01, `${found} Hz statt ${fg} Hz`);
});

test('Fehler ohne Sinusquelle', () => {
  assert.throws(() => frequencyResponse({ elements: [{ type: 'V', name: 'V1', nodes: ['in', '0'], value: 5 }, R('R1', 'in', '0', 1)] },
    { source: 'V1', outputs: ['in'], frequencies: [100] }), /Wechselspannungsquelle/);
});
