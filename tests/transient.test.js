// Zeitbereich gegen Lehrbuchformeln (Kursstufe Physik: Auf-/Entladen, Ein-/Ausschalten, Schwingkreis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient, valueAt } from '../app/js/engine/transient.js';

const V = (name, plus, minus, value) => ({ type: 'V', name, nodes: [plus, minus], value });
const R = (name, a, b, value) => ({ type: 'R', name, nodes: [a, b], value });

/** Prüft eine Kurve gegen eine Formel an mehreren Zeitpunkten (Toleranz relativ zur Skala). */
function assertCurve(time, values, formula, times, scale, rel = 2e-3) {
  for (const t of times) {
    const got = valueAt(time, values, t);
    const want = formula(t);
    assert.ok(Math.abs(got - want) <= rel * scale, `t = ${t}: ${got} statt ${want}`);
  }
}

test('Kondensator laden (entladen gestartet): u = U·(1 − e^(−t/τ)), Ladestrom zu Beginn U/R', () => {
  const tau = 1e-3; // 1 kΩ · 1 µF
  const r = transient(
    { elements: [V('V1', 'p', '0', 5), R('R1', 'p', 'a', 1000), { type: 'C', name: 'C1', nodes: ['a', '0'], value: 1e-6 }] },
    { stopTime: 5 * tau, useInitialConditions: true },
  );
  assertCurve(r.time, r.potentials.a, (t) => 5 * (1 - Math.exp(-t / tau)), [0, 0.5e-3, 1e-3, 2e-3, 3e-3, 5e-3], 5);
  assert.ok(Math.abs(r.elements.C1.I[0] - 5e-3) < 1e-5, `I(0) = ${r.elements.C1.I[0]}`);
  // Vorgabe: 500 Ausgabepunkte → Schrittweite höchstens stopTime/500
  assert.ok(r.steps >= 500 && r.steps < 600, `${r.steps} Schritte`);
});

test('nur Fehlersteuerung (große Schrittweite erlaubt): wenige Schritte, Abweichung unter 2 %', () => {
  const tau = 1e-3;
  const r = transient(
    { elements: [V('V1', 'p', '0', 5), R('R1', 'p', 'a', 1000), { type: 'C', name: 'C1', nodes: ['a', '0'], value: 1e-6 }] },
    { stopTime: 5 * tau, maxStep: 5 * tau, useInitialConditions: true },
  );
  assert.ok(r.steps < 40, `${r.steps} Schritte`);
  r.time.forEach((t, k) => {
    const want = 5 * (1 - Math.exp(-t / tau));
    assert.ok(Math.abs(r.potentials.a[k] - want) < 0.02 * 5, `t = ${t}: ${r.potentials.a[k]} statt ${want}`);
  });
});

test('Kondensator entladen über Widerstand (Anfangsspannung 9 V)', () => {
  const tau = 10e3 * 100e-6; // 1 s
  const r = transient(
    { elements: [R('R1', 'a', '0', 10e3), { type: 'C', name: 'C1', nodes: ['a', '0'], value: 100e-6, ic: 9 }] },
    { stopTime: 4, useInitialConditions: true },
  );
  assertCurve(r.time, r.potentials.a, (t) => 9 * Math.exp(-t / tau), [0, 0.5, 1, 2, 4], 9);
});

test('Spule einschalten: i = U/R·(1 − e^(−t·R/L))', () => {
  const tau = 0.1 / 10;
  const r = transient(
    { elements: [V('V1', 'p', '0', 6), R('R1', 'p', 'a', 10), { type: 'L', name: 'L1', nodes: ['a', '0'], value: 0.1 }] },
    { stopTime: 5 * tau, useInitialConditions: true },
  );
  assertCurve(r.time, r.elements.L1.I, (t) => 0.6 * (1 - Math.exp(-t / tau)), [0, 5e-3, 10e-3, 20e-3, 50e-3], 0.6);
});

test('Laden über Pulsquelle ohne Anfangsbedingungen; Flanke ist ein Rechenzeitpunkt', () => {
  const tau = 1e-3;
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'pulse', low: 0, high: 5, delay: 1e-3, rise: 1e-6, width: 10 } },
        R('R1', 'p', 'a', 1000),
        { type: 'C', name: 'C1', nodes: ['a', '0'], value: 1e-6 },
      ],
    },
    { stopTime: 6e-3 },
  );
  assert.ok(r.time.some((t) => Math.abs(t - 1e-3) < 1e-15), 'Beginn der Flanke fehlt');
  assert.ok(r.time.some((t) => Math.abs(t - 1.001e-3) < 1e-15), 'Ende der Flanke fehlt');
  assertCurve(r.time, r.potentials.a, (t) => (t < 1e-3 ? 0 : 5 * (1 - Math.exp(-(t - 1e-3) / tau))), [0.5e-3, 1.5e-3, 2e-3, 4e-3, 6e-3], 5, 4e-3);
});

test('LC-Schwingkreis: Periodendauer T = 2π·√(LC), Amplitude bleibt erhalten (Trapez)', () => {
  const L = 10e-3;
  const C = 10e-6;
  const period = 2 * Math.PI * Math.sqrt(L * C);
  const r = transient(
    { elements: [{ type: 'C', name: 'C1', nodes: ['a', '0'], value: C, ic: 5 }, { type: 'L', name: 'L1', nodes: ['a', '0'], value: L }] },
    { stopTime: 10 * period, maxStep: period / 200, useInitialConditions: true },
  );
  // Nulldurchgänge von oben nach unten → Periodendauer
  const crossings = [];
  const u = r.potentials.a;
  for (let k = 1; k < u.length; k++) {
    if (u[k - 1] > 0 && u[k] <= 0) crossings.push(r.time[k - 1] + (u[k - 1] / (u[k - 1] - u[k])) * (r.time[k] - r.time[k - 1]));
  }
  const measured = (crossings.at(-1) - crossings[0]) / (crossings.length - 1);
  assert.ok(Math.abs(measured / period - 1) < 2e-3, `T = ${measured} statt ${period}`);
  const lastPeriod = r.time.map((t, k) => (t > 9 * period ? Math.abs(u[k]) : 0));
  assert.ok(Math.abs(Math.max(...lastPeriod) - 5) < 0.05, `Amplitude ${Math.max(...lastPeriod)}`);
});

test('gedämpfte Schwingung (Reihenschwingkreis): i = U/(ω_d·L)·e^(−δt)·sin(ω_d·t)', () => {
  const [Rv, L, C, U] = [20, 10e-3, 10e-6, 5];
  const delta = Rv / (2 * L);
  const wd = Math.sqrt(1 / (L * C) - delta * delta);
  const r = transient(
    {
      elements: [
        V('V1', 'p', '0', U), R('R1', 'p', 'a', Rv),
        { type: 'L', name: 'L1', nodes: ['a', 'b'], value: L },
        { type: 'C', name: 'C1', nodes: ['b', '0'], value: C },
      ],
    },
    { stopTime: 10e-3, maxStep: 10e-6, useInitialConditions: true },
  );
  const formula = (t) => (U / (wd * L)) * Math.exp(-delta * t) * Math.sin(wd * t);
  assertCurve(r.time, r.elements.L1.I, formula, [0.2e-3, 0.5e-3, 1e-3, 2e-3, 3e-3, 5e-3], U / (wd * L), 5e-3);
});

test('RC-Tiefpass bei der Grenzfrequenz: Amplitude 1/√2', () => {
  const [Rv, C] = [1000, 1e-6];
  const f = 1 / (2 * Math.PI * Rv * C);
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 1, frequency: f } },
        R('R1', 'p', 'a', Rv), { type: 'C', name: 'C1', nodes: ['a', '0'], value: C },
      ],
    },
    { stopTime: 20 / f, maxStep: 1 / (200 * f) },
  );
  const tail = r.time.map((t, k) => (t > 18 / f ? Math.abs(r.potentials.a[k]) : 0));
  assert.ok(Math.abs(Math.max(...tail) - Math.SQRT1_2) < 3e-3, `Amplitude ${Math.max(...tail)}`);
});

test('Simulationsdauer muss positiv sein', () => {
  assert.throws(() => transient({ elements: [V('V1', 'a', '0', 1), R('R1', 'a', '0', 1)] }, { stopTime: 0 }), /größer als 0 s/);
});
