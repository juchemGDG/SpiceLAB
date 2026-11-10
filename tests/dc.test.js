// Arbeitspunkt: Schulbeispiele, die man von Hand nachrechnen kann.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { CircuitError } from '../app/js/engine/errors.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const R = (name, a, b, value) => ({ type: 'R', name, nodes: [a, b], value });
const V = (name, plus, minus, value) => ({ type: 'V', name, nodes: [plus, minus], value });
const I = (name, from, to, value) => ({ type: 'I', name, nodes: [from, to], value });

test('Spannungsteiler unbelastet: 10 V an 1 kΩ + 1 kΩ', () => {
  const r = operatingPoint({ elements: [V('V1', 'oben', '0', 10), R('R1', 'oben', 'mitte', 1000), R('R2', 'mitte', '0', 1000)] });
  close(r.potentials.mitte, 5);
  close(r.elements.R1.U, 5);
  close(r.elements.R1.I, 0.005);
  close(r.elements.R1.P, 0.025);
  close(r.elements.V1.I, -0.005); // Quelle gibt Energie ab …
  close(r.elements.V1.P, -0.05); // … also P < 0
});

test('Spannungsteiler belastet: 1 kΩ Last am Mittelpunkt', () => {
  const r = operatingPoint({
    elements: [V('V1', 'oben', '0', 10), R('R1', 'oben', 'mitte', 1000), R('R2', 'mitte', '0', 1000), R('RL', 'mitte', '0', 1000)],
  });
  close(r.potentials.mitte, 10 / 3); // R2 ∥ RL = 500 Ω
});

test('Reihenschaltung zweier Batterien', () => {
  const r = operatingPoint({ elements: [V('B1', 'a', '0', 1.5), V('B2', 'b', 'a', 1.5), R('R1', 'b', '0', 30)] });
  close(r.potentials.b, 3);
  close(r.elements.R1.I, 0.1);
});

test('Stromquelle an Widerstand', () => {
  const r = operatingPoint({ elements: [I('I1', '0', 'n', 0.002), R('R1', 'n', '0', 1000)] });
  close(r.potentials.n, 2);
  close(r.elements.I1.P, -0.004); // gibt 4 mW ab
});

test('Wheatstone-Brücke im Abgleich: kein Strom im Brückenzweig', () => {
  const r = operatingPoint({
    elements: [
      V('V1', 'top', '0', 12),
      R('R1', 'top', 'l', 1000), R('R2', 'l', '0', 2000),
      R('R3', 'top', 'r', 470), R('R4', 'r', '0', 940),
      R('RB', 'l', 'r', 100),
    ],
  });
  close(r.elements.RB.I, 0, 1e-12);
  close(r.potentials.l, 8);
});

test('Energieerhaltung und Knotenregel in einem verzweigten Netz', () => {
  const r = operatingPoint({
    elements: [
      V('V1', 'a', '0', 9), V('V2', 'c', '0', 5),
      R('R1', 'a', 'b', 220), R('R2', 'b', 'c', 330), R('R3', 'b', '0', 470),
    ],
  });
  const totalP = Object.values(r.elements).reduce((s, e) => s + e.P, 0);
  close(totalP, 0, 1e-12);
  // Knotenregel an b: was über R1 zufließt, fließt über R2 und R3 ab
  close(r.elements.R1.I, r.elements.R2.I + r.elements.R3.I);
});

test('Fehler: Teil der Schaltung hängt in der Luft', () => {
  assert.throws(
    () => operatingPoint({ elements: [V('V1', 'a', '0', 5), R('R1', 'a', '0', 100), R('R2', 'x', 'y', 100)] }),
    (e) => e instanceof CircuitError && /in der Luft/.test(e.message) && e.elements.includes('R2'),
  );
});

test('Fehler: zwei Spannungsquellen parallel', () => {
  assert.throws(
    () => operatingPoint({ elements: [V('V1', 'a', '0', 5), V('V2', 'a', '0', 3), R('R1', 'a', '0', 100)] }),
    (e) => e instanceof CircuitError && /Kurzschluss/.test(e.message) && e.elements.length === 1,
  );
});
