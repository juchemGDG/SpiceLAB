// Tests direkt auf den Stempeln – noch ohne Bauteilklassen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MnaSystem, GROUND } from '../app/js/engine/mna.js';

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('Leitwert-Stempel ist symmetrisch, Masse entfällt', () => {
  const sys = new MnaSystem(2, 0);
  sys.stampConductance(0, 1, 2);
  sys.stampConductance(1, GROUND, 3);
  assert.deepEqual(sys.A.map((r) => [...r]), [[2, -2], [-2, 5]]);
});

test('Spannungsteiler von Hand gestempelt: 10 V an 1 kΩ + 1 kΩ', () => {
  // Knoten 0 = oben, Knoten 1 = Mitte, Zweig 2 = Strom durch die Quelle
  const sys = new MnaSystem(2, 1);
  sys.stampVoltageSource(0, GROUND, 2, 10);
  sys.stampConductance(0, 1, 1 / 1000);
  sys.stampConductance(1, GROUND, 1 / 1000);
  const x = sys.solve();
  close(x[0], 10);
  close(x[1], 5);
  close(x[2], -0.005); // Quelle gibt 5 mA ab → negativ (SPICE-Konvention)
});

test('Stromquelle speist in den Ziel-Knoten ein', () => {
  // 2 mA von Masse nach Knoten 0, Knoten 0 über 1 kΩ an Masse → 2 V
  const sys = new MnaSystem(1, 0);
  sys.stampCurrentSource(GROUND, 0, 0.002);
  sys.stampConductance(0, GROUND, 1 / 1000);
  close(sys.solve()[0], 2);
});

test('clear setzt alles zurück', () => {
  const sys = new MnaSystem(1, 1);
  sys.stampVoltageSource(0, GROUND, 1, 5);
  sys.clear();
  assert.ok(sys.A.every((r) => r.every((v) => v === 0)));
  assert.ok(sys.b.every((v) => v === 0));
});
