// Spule im Arbeitspunkt (der Zeitbereich wird mit transient.js getestet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { CircuitError } from '../app/js/engine/errors.js';

test('Gleichstrom: Spule leitet, nur der Wicklungswiderstand zählt', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 6 },
      { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 10 },
      { type: 'L', name: 'L1', nodes: ['a', '0'], value: 0.5, resistance: 2 },
    ],
  });
  assert.ok(Math.abs(r.elements.L1.I - 0.5) < 1e-12); // 6 V / 12 Ω
  assert.ok(Math.abs(r.elements.L1.U - 1) < 1e-12); // 0,5 A · 2 Ω
});

test('ideale Spule direkt an Spannungsquelle: Kurzschluss wird gemeldet', () => {
  assert.throws(
    () => operatingPoint({
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: 6 },
        { type: 'L', name: 'L1', nodes: ['p', '0'], value: 0.1 },
      ],
    }),
    (e) => e instanceof CircuitError && /Kurzschluss/.test(e.message) && /\((Spule|Spannungsquelle)\)/.test(e.message),
  );
});

test('ungültige Werte', () => {
  const L = (extra) => operatingPoint({ elements: [{ type: 'L', name: 'L1', nodes: ['a', '0'], value: 0.1, ...extra }] });
  assert.throws(() => L({ value: 0 }), /Induktivität muss größer als 0 H/);
  assert.throws(() => L({ resistance: -1 }), /Wicklungswiderstand darf nicht negativ/);
});
