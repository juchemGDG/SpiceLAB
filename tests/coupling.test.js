// Gekoppelte Spulen: Wicklungssinn, Gesamtinduktivität, Transformator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient, valueAt } from '../app/js/engine/transient.js';
import { operatingPoint } from '../app/js/engine/dc.js';
import { CircuitError } from '../app/js/engine/errors.js';

/**
 * Zwei gleiche Spulen (je 0,1 H, k = 0,5) in Reihe an 10 V über 10 Ω.
 * gleichsinnig:     L = L1 + L2 + 2M = 0,3 H  → τ = 30 ms
 * gegensinnig:      L = L1 + L2 − 2M = 0,1 H  → τ = 10 ms
 */
function seriesRise(secondNodes) {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: 10 },
        { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 10 },
        { type: 'L', name: 'L1', nodes: ['a', 'b'], value: 0.1 },
        { type: 'L', name: 'L2', nodes: secondNodes, value: 0.1 },
        { type: 'K', name: 'K1', inductors: ['L1', 'L2'], k: 0.5 },
      ],
    },
    { stopTime: 0.1, useInitialConditions: true },
  );
  return (t) => valueAt(r.time, r.elements.L1.I, t);
}

test('gleichsinnig in Reihe: L = L1 + L2 + 2M', () => {
  const i = seriesRise(['b', '0']);
  for (const t of [0.01, 0.03, 0.06]) {
    const want = 1 - Math.exp(-t / 0.03);
    assert.ok(Math.abs(i(t) - want) < 3e-3, `t = ${t}: ${i(t)} statt ${want}`);
  }
});

test('gegensinnig in Reihe: L = L1 + L2 − 2M', () => {
  const i = seriesRise(['0', 'b']); // zweite Spule umgedreht
  for (const t of [0.005, 0.01, 0.02]) {
    const want = 1 - Math.exp(-t / 0.01);
    assert.ok(Math.abs(i(t) - want) < 3e-3, `t = ${t}: ${i(t)} statt ${want}`);
  }
});

test('Transformator 2:1 (L2 = L1/4, k = 0,999) mit Last: Sekundärspannung ≈ halbe Primärspannung', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 10, frequency: 50 } },
        { type: 'L', name: 'LP', nodes: ['p', '0'], value: 4, resistance: 1 },
        { type: 'L', name: 'LS', nodes: ['s', '0'], value: 1, resistance: 0.5 },
        { type: 'K', name: 'K1', inductors: ['LP', 'LS'], k: 0.999 },
        { type: 'R', name: 'RL', nodes: ['s', '0'], value: 1000 },
      ],
    },
    { stopTime: 0.1, maxStep: 1e-4 },
  );
  const tail = r.time.map((t, k) => (t > 0.06 ? Math.abs(r.potentials.s[k]) : 0));
  const amplitude = Math.max(...tail);
  assert.ok(Math.abs(amplitude - 5) < 0.1, `Amplitude sekundär ${amplitude} V`);
});

test('Gleichstrom überträgt der Transformator nicht', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 5 },
      { type: 'L', name: 'LP', nodes: ['p', '0'], value: 1, resistance: 10 },
      { type: 'L', name: 'LS', nodes: ['s', '0'], value: 1, resistance: 10 },
      { type: 'K', name: 'K1', inductors: ['LP', 'LS'], k: 0.9 },
      { type: 'R', name: 'RL', nodes: ['s', '0'], value: 100 },
    ],
  });
  assert.ok(Math.abs(r.potentials.s) < 1e-12);
  assert.equal(r.elements.K1, undefined); // Kopplung hat keine eigenen Messwerte
});

test('Fehler: Koppelfaktor, falsche Bauteile', () => {
  const base = [
    { type: 'V', name: 'V1', nodes: ['p', '0'], value: 1 },
    { type: 'L', name: 'L1', nodes: ['p', '0'], value: 1, resistance: 1 },
    { type: 'R', name: 'R1', nodes: ['p', '0'], value: 1 },
  ];
  const run = (k) => operatingPoint({ elements: [...base, k] });
  assert.throws(() => run({ type: 'K', name: 'K1', inductors: ['L1', 'L1'], k: 0.5 }), /zwei verschiedene Spulen/);
  assert.throws(() => run({ type: 'K', name: 'K1', inductors: ['L1', 'R1'], k: 0.5 }), /„R1“ ist keine Spule/);
  assert.throws(() => run({ type: 'K', name: 'K1', inductors: ['L1', 'L9'], k: 0.5 }), CircuitError);
  assert.throws(() => run({ type: 'K', name: 'K1', inductors: ['L1', 'R1'], k: 1.5 }), /höchstens 1/);
});
