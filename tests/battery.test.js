// Batterie mit Innenwiderstand: Klemmenspannung, Kurzschlussstrom, Leistungsanpassung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { BATTERIES } from '../app/js/library/batteries.js';

const withLoad = (battery, R) =>
  operatingPoint({
    elements: [
      { type: 'BAT', name: 'B1', nodes: ['p', '0'], ...battery },
      { type: 'R', name: 'RL', nodes: ['p', '0'], value: R },
    ],
  });

test('Klemmenspannung sinkt unter Last: U = U0 − Ri·I', () => {
  const r = withLoad({ voltage: 9, internalResistance: 1.5 }, 30);
  const I = 9 / 31.5;
  assert.ok(Math.abs(r.potentials.p - (9 - 1.5 * I)) < 1e-12);
  assert.ok(Math.abs(r.elements.B1.I + I) < 1e-12); // gibt Strom ab → negativ
});

test('Leerlauf: Klemmenspannung = Quellenspannung', () => {
  assert.ok(Math.abs(withLoad(BATTERIES.flat4V5, 1e9).potentials.p - 4.5) < 1e-6);
});

test('Kurzschluss (1 mΩ): Strom ≈ U0/Ri', () => {
  const r = withLoad(BATTERIES.aaAlkali, 1e-3);
  assert.ok(Math.abs(-r.elements.B1.I - 1.5 / 0.151) < 1e-9);
});

test('Leistungsanpassung: größte Leistung am Lastwiderstand bei RL = Ri', () => {
  const P = (R) => withLoad({ voltage: 9, internalResistance: 1.5 }, R).elements.RL.P;
  assert.ok(P(1.5) > P(1.2) && P(1.5) > P(1.8));
  assert.ok(Math.abs(P(1.5) - 81 / 6) < 1e-9); // U0²/(4·Ri)
});

test('ohne Innenwiderstand wie eine ideale Quelle', () => {
  assert.ok(Math.abs(withLoad({ voltage: 5 }, 10).potentials.p - 5) < 1e-12);
});
