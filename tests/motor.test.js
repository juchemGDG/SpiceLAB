// Gleichstrommotor: Leerlauf, Anlaufspannung, Last, Anlaufstrom im Zeitbereich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from '../app/js/engine/circuit.js';
import { MnaSystem } from '../app/js/engine/mna.js';
import { createContext } from '../app/js/engine/newton.js';
import { solveDc } from '../app/js/engine/dc.js';
import { transient, valueAt } from '../app/js/engine/transient.js';
import { MOTORS } from '../app/js/library/motors.js';

/** Arbeitspunkt am Netzgerät: Strom und Drehzahl. */
function run(motor, U, extra = {}) {
  const circuit = new Circuit({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: U },
      { type: 'MOT', name: 'M1', nodes: ['p', '0'], ...motor, ...extra },
    ],
  });
  const { x } = solveDc(circuit, new MnaSystem(circuit.nodeCount, circuit.branchCount), createContext());
  const m = circuit.elements[1];
  return { I: m.current(x), n: m.speed(x) };
}

for (const [key, motor] of Object.entries(MOTORS)) {
  test(`${motor.label}: Leerlauf bei Nennspannung wie im Datenblatt`, () => {
    const { I, n } = run(motor, motor.ratedVoltage);
    assert.ok(Math.abs(n - motor.noLoadSpeed) < 0.01 * motor.noLoadSpeed, `${key}: n = ${n}`);
    assert.ok(Math.abs(I - motor.noLoadCurrent) < 0.01 * motor.noLoadCurrent, `${key}: I = ${I}`);
  });
}

test('Anlaufspannung: unter R·I_0 dreht der Motor (fast) nicht, darüber steigt die Drehzahl linear', () => {
  const m = MOTORS.small3V;
  const start = (m.ratedVoltage / m.stallCurrent) * m.noLoadCurrent; // ≈ 0,27 V
  assert.ok(run(m, 0.5 * start).n < 0.01 * m.noLoadSpeed);
  const half = run(m, m.ratedVoltage / 2).n;
  const full = run(m, m.ratedVoltage).n;
  // n ~ (U − R·I_0): bei halber Spannung etwas weniger als die halbe Drehzahl
  const expected = (full * (m.ratedVoltage / 2 - start)) / (m.ratedVoltage - start);
  assert.ok(Math.abs(half - expected) < 0.01 * full, `n(U/2) = ${half}, erwartet ${expected}`);
});

test('Last bremst: Drehzahl sinkt, Strom steigt um M_Last/k', () => {
  const m = MOTORS.gear6V;
  const free = run(m, 6);
  const loaded = run(m, 6, { loadTorque: 0.05 });
  const R = m.ratedVoltage / m.stallCurrent;
  const k = (m.ratedVoltage - R * m.noLoadCurrent) / ((m.noLoadSpeed * 2 * Math.PI) / 60);
  assert.ok(loaded.n < free.n);
  assert.ok(Math.abs(loaded.I - free.I - 0.05 / k) < 1e-6, `ΔI = ${loaded.I - free.I}, erwartet ${0.05 / k}`);
});

test('Einschalten: Anlaufstrom ≈ U/R, dann Leerlaufstrom; Drehzahl steigt mit τ_m', () => {
  const m = MOTORS.small3V;
  const r = transient(
    { elements: [{ type: 'V', name: 'V1', nodes: ['p', '0'], value: 3 }, { type: 'MOT', name: 'M1', nodes: ['p', '0'], ...m }] },
    { stopTime: 0.2, useInitialConditions: true },
  );
  const I = r.elements.M1.I;
  const peak = Math.max(...I.map(Math.abs));
  assert.ok(peak > 0.9 * m.stallCurrent && peak <= 1.01 * m.stallCurrent, `Anlaufstrom ${peak} A`);
  assert.ok(Math.abs(Math.abs(I.at(-1)) - m.noLoadCurrent) < 0.01, `Endstrom ${I.at(-1)} A`);
  // nach τ_m ist der Strom auf etwa 37 % des Weges zum Endwert abgeklungen
  const iTau = Math.abs(valueAt(r.time, I, m.mechanicalTimeConstant));
  const expected = m.noLoadCurrent + (m.stallCurrent - m.noLoadCurrent) * Math.exp(-1);
  assert.ok(Math.abs(iTau - expected) < 0.1 * expected, `I(τ) = ${iTau}, erwartet ${expected}`);
});
