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

test('Tangenten-Stempel: ein Leitwert als Spezialfall ergibt denselben Eintrag', () => {
  // Leitwert g zwischen Knoten 0 und 1: I_0 = g·(V0 − V1), I_1 = −I_0
  const g = 0.25;
  const a = new MnaSystem(2, 0);
  a.stampConductance(0, 1, g);
  const b = new MnaSystem(2, 0);
  const V0 = [3, 1]; // beliebiger Linearisierungspunkt – bei linearen Bauteilen egal
  b.stampLinearized([0, 1], [g * 2, -g * 2], [[g, -g], [-g, g]], V0);
  assert.deepEqual(b.A.map((r) => [...r]), a.A.map((r) => [...r]));
  assert.deepEqual([...b.b], [0, 0]);
});

test('Tangenten-Stempel: gesteuerte Stromquelle (Transistor-ähnlich) mit Masseanschluss', () => {
  // Bauteil an Knoten 0 (Steuerung) und Masse: zieht I = 2·V0² aus Knoten 0, gespeist von 1 A
  // Gleichung 2·V² = 1 → V = √0,5; ein Newton-Schritt ab V = 1 liefert 0,75
  const sys = new MnaSystem(1, 0);
  sys.stampCurrentSource(GROUND, 0, 1);
  sys.stampLinearized([0, GROUND], [2, -2], [[4, -4], [-4, 4]], [1, 0]);
  close(sys.solve()[0], 0.75);
});

test('clear setzt alles zurück', () => {
  const sys = new MnaSystem(1, 1);
  sys.stampVoltageSource(0, GROUND, 1, 5);
  sys.clear();
  assert.ok(sys.A.every((r) => r.every((v) => v === 0)));
  assert.ok(sys.b.every((v) => v === 0));
});
