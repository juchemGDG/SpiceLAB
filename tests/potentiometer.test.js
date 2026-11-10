import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';

const divider = (position, load) =>
  operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 10 },
      { type: 'POT', name: 'P1', nodes: ['p', '0', 'w'], value: 10e3, position },
      ...(load ? [{ type: 'R', name: 'RL', nodes: ['w', '0'], value: load }] : []),
    ],
  });

test('unbelastet: Schleiferspannung proportional zur Stellung', () => {
  for (const p of [0, 0.25, 0.5, 1]) {
    const u = divider(p).potentials.w;
    assert.ok(Math.abs(u - 10 * (1 - p)) < 1e-2, `p = ${p}: ${u} V`);
  }
});

test('belasteter Spannungsteiler: Spannung sinkt unter Last', () => {
  const u = divider(0.5, 10e3).potentials.w;
  // 5 kΩ ∥ 10 kΩ = 3,33 kΩ unten, 5 kΩ oben → 4 V
  assert.ok(Math.abs(u - 4) < 1e-3, `${u} V`);
});

test('Strom durch das Poti und Fehler bei ungültiger Stellung', () => {
  assert.ok(Math.abs(divider(0.3).elements.P1.I - 10 / (10e3 + 1)) < 1e-9);
  assert.throws(() => divider(1.2), /zwischen 0 und 1/);
});
