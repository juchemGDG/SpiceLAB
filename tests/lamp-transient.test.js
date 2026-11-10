// Glühlampe im Zeitbereich: Einschaltstromspitze und Betrieb an Wechselspannung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient, valueAt } from '../app/js/engine/transient.js';

const lamp = { type: 'LAMP', name: 'H1', nodes: ['a', '0'], ratedVoltage: 6, ratedCurrent: 0.1, thermalTimeConstant: 0.05 };
const R_cold = 60 / (2700 / 300.15) ** 1.2;

test('Einschalten: kalter Faden → Stromspitze ≈ U/R_kalt, danach Nennstrom', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['a', '0'], waveform: { shape: 'pulse', low: 0, high: 6, delay: 1e-3, rise: 1e-6, width: 10 } },
        lamp,
      ],
    },
    { stopTime: 0.5 },
  );
  const I = r.elements.H1.I;
  const peak = Math.max(...I);
  assert.ok(peak > 0.9 * (6 / R_cold) && peak <= 6 / R_cold * 1.001, `Spitze ${peak} A, kalt wären ${6 / R_cold} A`);
  assert.ok(Math.abs(I.at(-1) - 0.1) < 1e-3, `Endwert ${I.at(-1)} A`);
  // nach einigen Millisekunden schon deutlich unter der Spitze, nach 0,2 s fast am Nennstrom
  assert.ok(valueAt(r.time, I, 0.02) < 0.5 * peak);
  assert.ok(Math.abs(valueAt(r.time, I, 0.2) - 0.1) < 0.01);
});

test('Wechselspannung 6 V eff., 50 Hz: Faden bleibt fast gleich heiß → Leistung ≈ Nennleistung', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['a', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 6 * Math.SQRT2, frequency: 50 } },
        lamp,
      ],
    },
    { stopTime: 0.6, maxStep: 2e-4 },
  );
  // mittlere Leistung über die letzten 5 Perioden (Trapezregel)
  let energy = 0;
  for (let k = 1; k < r.time.length; k++) {
    if (r.time[k - 1] < 0.5) continue;
    const p0 = r.elements.H1.U[k - 1] * r.elements.H1.I[k - 1];
    const p1 = r.elements.H1.U[k] * r.elements.H1.I[k];
    energy += ((p0 + p1) / 2) * (r.time[k] - r.time[k - 1]);
  }
  const P = energy / 0.1;
  assert.ok(Math.abs(P - 0.6) < 0.02, `P = ${P} W`);
  // Strom fast sinusförmig: Spitzenstrom ≈ Spitzenspannung / R_heiß
  const peak = Math.max(...r.elements.H1.I.filter((_, k) => r.time[k] > 0.5));
  assert.ok(Math.abs(peak - (6 * Math.SQRT2) / 60) < 0.05 * peak, `Spitzenstrom ${peak} A`);
});

test('Anfangsbedingung: Lampe kalt', () => {
  const r = transient(
    { elements: [{ type: 'V', name: 'V1', nodes: ['a', '0'], value: 6 }, lamp] },
    { stopTime: 0.3, useInitialConditions: true },
  );
  assert.ok(Math.abs(r.elements.H1.I[0] - 6 / R_cold) < 1e-3 * (6 / R_cold), `I(0) = ${r.elements.H1.I[0]}`);
  assert.ok(Math.abs(r.elements.H1.I.at(-1) - 0.1) < 2e-3);
});
