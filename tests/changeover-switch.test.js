// Umschalter: Kondensator laden und entladen (Kursstufe Physik).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient, valueAt } from '../app/js/engine/transient.js';
import { operatingPoint } from '../app/js/engine/dc.js';

test('Stellung a bzw. b verbindet den Mittelkontakt', () => {
  const run = (position) =>
    operatingPoint({
      elements: [
        { type: 'V', name: 'V1', nodes: ['a', '0'], value: 5 },
        { type: 'R', name: 'RB', nodes: ['b', '0'], value: 1e3 },
        { type: 'SPDT', name: 'S1', nodes: ['m', 'a', 'b'], position },
        { type: 'R', name: 'RL', nodes: ['m', '0'], value: 1e3 },
      ],
    }).potentials.m;
  assert.ok(Math.abs(run('a') - 5) < 1e-3);
  assert.ok(Math.abs(run('b')) < 1e-3);
  assert.throws(() => run('c'), /„a“ oder „b“/);
});

test('Laden (a) bis 1 s, dann Entladen (b) über denselben Widerstand', () => {
  const tau = 10e3 * 22e-6; // 0,22 s
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['a', '0'], value: 6 },
        { type: 'SPDT', name: 'S1', nodes: ['m', 'a', '0'], position: 'a', toggleTimes: [1] },
        { type: 'R', name: 'R1', nodes: ['m', 'c'], value: 10e3 },
        { type: 'C', name: 'C1', nodes: ['c', '0'], value: 22e-6 },
      ],
    },
    { stopTime: 2, useInitialConditions: true },
  );
  const u = (t) => valueAt(r.time, r.potentials.c, t);
  assert.ok(Math.abs(u(tau) - 6 * (1 - Math.exp(-1))) < 0.01);
  const u1 = u(1);
  assert.ok(Math.abs(u(1 + tau) - u1 * Math.exp(-1)) < 0.01, `${u(1 + tau)} statt ${u1 * Math.exp(-1)}`);
});
