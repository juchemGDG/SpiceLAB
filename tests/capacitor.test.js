// Kondensator im Arbeitspunkt (der Zeitbereich wird mit transient.js getestet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';

test('Gleichstrom: Kondensator sperrt, volle Spannung liegt an', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 9 },
      { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 10e3 },
      { type: 'C', name: 'C1', nodes: ['a', '0'], value: 100e-6 },
    ],
  });
  assert.ok(Math.abs(r.potentials.a - 9) < 1e-6);
  assert.ok(Math.abs(r.elements.C1.I) < 1e-10);
});

test('zwei Kondensatoren in Reihe: Mittelknoten ist trotzdem bestimmt', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 10 },
      { type: 'C', name: 'C1', nodes: ['p', 'm'], value: 1e-6 },
      { type: 'C', name: 'C2', nodes: ['m', '0'], value: 1e-6 },
    ],
  });
  assert.ok(Math.abs(r.potentials.m - 5) < 1e-6, `φ(m) = ${r.potentials.m}`);
});

test('ungültige Kapazität', () => {
  assert.throws(
    () => operatingPoint({ elements: [{ type: 'C', name: 'C1', nodes: ['a', '0'], value: -1 }] }),
    /Kapazität muss größer als 0 F/,
  );
});
