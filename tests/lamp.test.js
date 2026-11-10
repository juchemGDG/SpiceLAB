// Glühlampe: Nennpunkt, Kaltwiderstand, gekrümmte Kennlinie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { Lamp } from '../app/js/engine/elements/lamp.js';

const lamp6V = { type: 'LAMP', name: 'L1', nodes: ['a', '0'], ratedVoltage: 6, ratedCurrent: 0.1 };

function currentAt(U, lamp = lamp6V) {
  const r = operatingPoint({ elements: [{ type: 'V', name: 'V1', nodes: ['a', '0'], value: U }, lamp] });
  return r.elements.L1.I;
}

test('bei Nennspannung fließt der Nennstrom', () => {
  assert.ok(Math.abs(currentAt(6) - 0.1) < 1e-6, `I = ${currentAt(6)}`);
});

test('kalt etwa 13-mal kleinerer Widerstand (Wolfram, 2700 K)', () => {
  const U = 1e-3; // so wenig Spannung, dass der Faden kalt bleibt
  const R_cold = U / currentAt(U);
  assert.ok(Math.abs(60 / R_cold - (2700 / 300.15) ** 1.2) < 0.05, `R_kalt = ${R_cold} Ω`);
});

test('Kennlinie ist gekrümmt: bei halber Spannung mehr als der halbe Strom', () => {
  const half = currentAt(3);
  assert.ok(half > 0.06 && half < 0.085, `I(3 V) = ${half}`);
  // Widerstand steigt mit der Spannung
  let lastR = 0;
  for (const U of [0.1, 0.5, 1, 2, 4, 6, 7]) {
    const R = U / currentAt(U);
    assert.ok(R > lastR, `R(${U} V) = ${R}`);
    lastR = R;
  }
});

test('in beide Richtungen gleich (Glühfaden hat keine Polung)', () => {
  assert.ok(Math.abs(currentAt(-4) + currentAt(4)) < 1e-12);
});

test('Fadentemperatur: Umgebung bei 0 V, Nenntemperatur bei Nennspannung', () => {
  const l = new Lamp({ name: 'L', nodes: ['a', '0'], ratedVoltage: 6, ratedCurrent: 0.1 });
  assert.equal(l.temperatureAt(0), 300.15);
  assert.ok(Math.abs(l.temperatureAt(6) - 2700) < 1e-6);
});

test('Reihenschaltung mit Widerstand konvergiert', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 12 },
      { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 60 },
      lamp6V,
    ],
  });
  // Maschenregel und gleicher Strom
  assert.ok(Math.abs(r.elements.R1.U + r.elements.L1.U - 12) < 1e-6);
  assert.ok(Math.abs(r.elements.R1.I - r.elements.L1.I) < 1e-9);
  assert.ok(r.elements.L1.U < 6, 'mit Vorwiderstand weniger als Nennspannung');
});
