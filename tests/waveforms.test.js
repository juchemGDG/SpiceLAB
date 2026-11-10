import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWaveform, waveformValue, waveformNextBreakpoint, waveformMaxStep,
} from '../app/js/engine/waveforms.js';
import { operatingPoint } from '../app/js/engine/dc.js';
import { CircuitError } from '../app/js/engine/errors.js';

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('Sinus: 50 Hz, Amplitude 325 V, mit Gleichanteil und Phase', () => {
  const w = normalizeWaveform({ shape: 'sine', offset: 0, amplitude: 325, frequency: 50 }, 'V1');
  close(waveformValue(w, 0), 0);
  close(waveformValue(w, 0.005), 325, 1e-9); // Viertelperiode
  close(waveformValue(w, 0.015), -325, 1e-9);
  const cos = normalizeWaveform({ shape: 'sine', offset: 1, amplitude: 2, frequency: 1, phase: 90 }, 'V1');
  close(waveformValue(cos, 0), 3);
});

test('Sinus mit Verzögerung und Dämpfung', () => {
  const w = normalizeWaveform({ shape: 'sine', offset: 0, amplitude: 1, frequency: 1, delay: 1, damping: 2 }, 'V1');
  close(waveformValue(w, 0.5), 0);
  close(waveformValue(w, 1.25), Math.exp(-0.5), 1e-12);
  assert.equal(waveformNextBreakpoint(w, 0), 1);
  assert.equal(waveformNextBreakpoint(w, 1), Infinity);
  close(waveformMaxStep(w), 1 / 40);
});

test('Rechteck 0/5 V, 1 kHz, Tastgrad 50 %: Werte und Haltepunkte', () => {
  const w = normalizeWaveform({ shape: 'pulse', low: 0, high: 5, rise: 1e-6, fall: 1e-6, width: 0.499e-3, period: 1e-3 }, 'V1');
  close(waveformValue(w, 0), 0);
  close(waveformValue(w, 0.5e-6), 2.5);
  close(waveformValue(w, 0.2e-3), 5);
  close(waveformValue(w, 0.7e-3), 0);
  close(waveformValue(w, 1.2e-3), 5); // zweite Periode
  // Haltepunkte: 1 µs, 500 µs, 501 µs, 1 ms, 1,001 ms …
  const bps = [];
  for (let t = 0, k = 0; k < 5; k++) bps.push((t = waveformNextBreakpoint(w, t)));
  const expected = [1e-6, 0.5e-3, 0.501e-3, 1e-3, 1.001e-3];
  bps.forEach((bp, i) => close(bp, expected[i], 1e-15));
});

test('einzelner Puls (ohne Periode): danach keine Haltepunkte mehr', () => {
  const w = normalizeWaveform({ shape: 'pulse', low: 0, high: 1, delay: 1e-3, width: 2e-3 }, 'V1');
  close(waveformValue(w, 2e-3), 1);
  close(waveformValue(w, 10e-3), 0);
  assert.equal(waveformNextBreakpoint(w, 4e-3), Infinity);
});

test('ungültige Angaben', () => {
  assert.throws(() => normalizeWaveform({ shape: 'sine', offset: 0, amplitude: 1, frequency: 0 }, 'V1'), CircuitError);
  assert.throws(() => normalizeWaveform({ shape: 'pulse', low: 0, high: 1, width: 2, period: 1 }, 'V1'), /länger als die Periode/);
  assert.throws(() => normalizeWaveform({ shape: 'dreieck' }, 'V1'), /unbekannter Zeitverlauf/);
});

test('Arbeitspunkt verwendet den Wert zur Zeit 0', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['a', '0'], waveform: { shape: 'sine', offset: 2, amplitude: 1, frequency: 50, phase: 90 } },
      { type: 'R', name: 'R1', nodes: ['a', '0'], value: 1000 },
    ],
  });
  close(r.potentials.a, 3, 1e-12);
});
