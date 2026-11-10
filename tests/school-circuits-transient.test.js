// Schulschaltungen im Zeitbereich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient } from '../app/js/engine/transient.js';
import { LEDS } from '../app/js/library/diodes.js';
import { TRANSISTORS } from '../app/js/library/transistors.js';
import { OPAMPS } from '../app/js/library/opamps.js';

/** Zeitpunkte, an denen eine Kurve die Schwelle steigend überschreitet. */
function risingCrossings(time, values, threshold) {
  const t = [];
  for (let k = 1; k < values.length; k++) {
    if (values[k - 1] < threshold && values[k] >= threshold) {
      t.push(time[k - 1] + ((threshold - values[k - 1]) / (values[k] - values[k - 1])) * (time[k] - time[k - 1]));
    }
  }
  return t;
}

// Die Faustformel T = ln 2 · (R1·C1 + R2·C2) setzt voraus, dass der Kollektor um die volle
// Betriebsspannung springt. Mit LED im Kollektorkreis steigt der gesperrte Kollektor nur bis
// U_B − U_LED; dann gilt T = (R1·C1 + R2·C2) · ln((U_B + ΔU − U_BE) / (U_B − U_BE)).
test('Wechselblinker (astabiler Multivibrator, 2 × BC547B, 2 LEDs): Periodendauer', () => {
  const Q = (name, nodes) => ({ type: 'Q', name, nodes, model: TRANSISTORS.BC547B.model });
  const [RB, C] = [47e3, 10e-6];
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 9 },
        { type: 'R', name: 'RV1', nodes: ['p', 'a1'], value: 680 },
        { type: 'D', name: 'LED1', nodes: ['a1', 'c1'], model: LEDS.rot.model },
        { type: 'R', name: 'RV2', nodes: ['p', 'a2'], value: 680 },
        { type: 'D', name: 'LED2', nodes: ['a2', 'c2'], model: LEDS.gruen.model },
        { type: 'R', name: 'RB1', nodes: ['p', 'b1'], value: RB },
        { type: 'R', name: 'RB2', nodes: ['p', 'b2'], value: RB * 1.1 }, // leicht unsymmetrisch, damit es anschwingt
        { type: 'C', name: 'C1', nodes: ['c2', 'b1'], value: C },
        { type: 'C', name: 'C2', nodes: ['c1', 'b2'], value: C },
        Q('Q1', ['c1', 'b1', '0']),
        Q('Q2', ['c2', 'b2', '0']),
      ],
    },
    { stopTime: 5, maxStep: 2e-3, useInitialConditions: true },
  );
  const edges = risingCrossings(r.time, r.potentials.c1, 4.5).filter((t) => t > 1);
  assert.ok(edges.length >= 3, `zu wenige Flanken: ${edges.length}`);
  const period = (edges.at(-1) - edges[0]) / (edges.length - 1);
  const [UB, ULED, UCEsat, UBE] = [9, 1.7, 0.1, 0.65];
  const swing = UB - ULED - UCEsat;
  const expected = (RB * C + 1.1 * RB * C) * Math.log((UB + swing - UBE) / (UB - UBE));
  assert.ok(Math.abs(period / expected - 1) < 0.03, `T = ${period.toFixed(3)} s, erwartet ≈ ${expected.toFixed(3)} s`);
  // die Faustformel mit ln 2 liegt deutlich darüber
  assert.ok(period < 0.95 * Math.LN2 * 2.1 * RB * C);
  // beide LEDs leuchten abwechselnd mit etwa (9 − 2 V)/680 Ω ≈ 10 mA
  const max1 = Math.max(...r.elements.LED1.I);
  assert.ok(max1 > 8e-3 && max1 < 12e-3, `LED-Strom ${max1 * 1e3} mA`);
});

test('Rechteckgenerator mit OPV (Schmitt-Trigger + RC): Frequenz f = 1/(2RC·ln 3) bei Hysterese ±U/2', () => {
  const [R, C] = [10e3, 100e-9];
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'VP', nodes: ['vp', '0'], value: 12 },
        { type: 'V', name: 'VN', nodes: ['vn', '0'], value: -12 },
        { type: 'R', name: 'R', nodes: ['out', 'n'], value: R },
        { type: 'C', name: 'C', nodes: ['n', '0'], value: C },
        { type: 'R', name: 'R1', nodes: ['out', 'pos'], value: 10e3 },
        { type: 'R', name: 'R2', nodes: ['pos', '0'], value: 10e3 }, // Mitkopplung 1/2
        { type: 'OPV', name: 'U1', nodes: ['pos', 'n', 'out', 'vp', 'vn'], model: { ...OPAMPS.TL072.model, Vos: 1e-3 } },
      ],
    },
    { stopTime: 20e-3, maxStep: 5e-6, useInitialConditions: true },
  );
  const edges = risingCrossings(r.time, r.potentials.out, 0).filter((t) => t > 5e-3);
  const period = (edges.at(-1) - edges[0]) / (edges.length - 1);
  const expected = 2 * R * C * Math.log(3);
  assert.ok(Math.abs(period / expected - 1) < 0.05, `T = ${period * 1e3} ms, erwartet ${expected * 1e3} ms`);
});
