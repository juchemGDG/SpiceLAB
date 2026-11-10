// Schalter: Arbeitspunkt, Schalten im Zeitbereich, Abschalten einer Spule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { transient, valueAt } from '../app/js/engine/transient.js';
import { DIODES } from '../app/js/library/diodes.js';

const V = (value) => ({ type: 'V', name: 'V1', nodes: ['p', '0'], value });

test('Arbeitspunkt: offen fließt (fast) nichts, geschlossen fließt Strom', () => {
  const run = (closed) =>
    operatingPoint({ elements: [V(5), { type: 'S', name: 'S1', nodes: ['p', 'a'], closed }, { type: 'R', name: 'R1', nodes: ['a', '0'], value: 100 }] });
  assert.ok(Math.abs(run(false).elements.R1.I) < 1e-8);
  assert.ok(Math.abs(run(true).elements.R1.I - 5 / 100.01) < 1e-9);
});

test('Kondensator laden: Schalter schließt bei 1 ms (Schaltzeitpunkt ist Rechenzeitpunkt)', () => {
  // Mit Anfangsbedingungen (Kondensator entladen). Ohne sie startet die Simulation im Arbeitspunkt,
  // also nach „unendlich langer Zeit“ – dann hätte sich C1 über den offenen Schalter (1 GΩ) schon aufgeladen.
  const tau = 1e-3;
  const r = transient(
    {
      elements: [
        V(5),
        { type: 'S', name: 'S1', nodes: ['p', 'q'], toggleTimes: [1e-3] },
        { type: 'R', name: 'R1', nodes: ['q', 'a'], value: 1000 },
        { type: 'C', name: 'C1', nodes: ['a', '0'], value: 1e-6 },
      ],
    },
    { stopTime: 6e-3, useInitialConditions: true },
  );
  assert.ok(r.time.includes(1e-3));
  for (const t of [0.5e-3, 1.5e-3, 2e-3, 4e-3]) {
    const want = t < 1e-3 ? 0 : 5 * (1 - Math.exp(-(t - 1e-3) / tau));
    const got = valueAt(r.time, r.potentials.a, t);
    assert.ok(Math.abs(got - want) < 0.01, `t = ${t}: ${got} statt ${want}`);
  }
});

test('Taster: drücken bei 1 ms, loslassen bei 3 ms', () => {
  const r = transient(
    { elements: [V(5), { type: 'S', name: 'T1', nodes: ['p', 'a'], toggleTimes: [1e-3, 3e-3] }, { type: 'R', name: 'R1', nodes: ['a', '0'], value: 1000 }] },
    { stopTime: 4e-3 },
  );
  const at = (t) => valueAt(r.time, r.potentials.a, t);
  assert.ok(at(0.5e-3) < 1e-3 && at(2e-3) > 4.99 && at(3.5e-3) < 1e-3);
});

test('Spule abschalten mit Freilaufdiode: Strom klingt mit τ = L/R ab, keine Spannungsspitze', () => {
  const r = transient(
    {
      elements: [
        V(12),
        { type: 'S', name: 'S1', nodes: ['p', 'a'], closed: true, toggleTimes: [10e-3] },
        { type: 'L', name: 'L1', nodes: ['a', '0'], value: 0.5, resistance: 24 }, // Relaisspule
        { type: 'D', name: 'D1', nodes: ['0', 'a'], model: DIODES['1N4148'].model }, // Freilaufdiode
      ],
    },
    { stopTime: 0.1 },
  );
  const iL = (t) => valueAt(r.time, r.elements.L1.I, t);
  assert.ok(Math.abs(iL(9e-3) - 0.5) < 1e-3);
  assert.ok(iL(10e-3 + 0.5 / 24) < 0.5 * Math.exp(-1) * 1.1, `nach τ: ${iL(10e-3 + 0.5 / 24)} A`);
  assert.ok(Math.min(...r.potentials.a) > -1.5, 'Diode begrenzt auf etwa −1 V');
});

test('Spule abschalten ohne Freilaufdiode: Induktionsspannung von vielen Kilovolt', () => {
  const r = transient(
    {
      elements: [
        V(12),
        { type: 'S', name: 'S1', nodes: ['p', 'a'], closed: true, toggleTimes: [10e-3] },
        { type: 'L', name: 'L1', nodes: ['a', '0'], value: 0.5, resistance: 24 },
      ],
    },
    { stopTime: 20e-3 },
  );
  assert.ok(Math.min(...r.potentials.a) < -1000, `kleinstes Potenzial ${Math.min(...r.potentials.a)} V`);
});

test('ungültige Schaltzeitpunkte', () => {
  assert.throws(
    () => operatingPoint({ elements: [V(1), { type: 'S', name: 'S1', nodes: ['p', '0'], toggleTimes: [2, 1] }] }),
    /aufsteigend/,
  );
});
