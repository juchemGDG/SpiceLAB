import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thermalVoltage, criticalVoltage, limitJunctionVoltage } from '../app/js/engine/junction.js';

test('Temperaturspannung bei 27 °C ≈ 25,86 mV', () => {
  assert.ok(Math.abs(thermalVoltage() - 0.025865) < 1e-5);
  assert.ok(thermalVoltage(350) > thermalVoltage());
});

test('Vcrit einer typischen Siliziumdiode liegt um 0,7 V', () => {
  const vcrit = criticalVoltage(thermalVoltage(), 1e-14);
  assert.ok(vcrit > 0.6 && vcrit < 0.8, `Vcrit = ${vcrit}`);
});

test('pnjlim: großer Sprung über Vcrit wird logarithmisch gebremst', () => {
  const nVt = thermalVoltage();
  const vcrit = criticalVoltage(nVt, 1e-14);
  const { v, limited } = limitJunctionVoltage(5, 0.6, nVt, vcrit);
  assert.ok(limited);
  assert.ok(v > 0.6 && v < 0.8, `v = ${v}`);
  // aus 0 V heraus: v = nVt · ln(5 V / nVt)
  assert.ok(Math.abs(limitJunctionVoltage(5, 0, nVt, vcrit).v - nVt * Math.log(5 / nVt)) < 1e-12);
});

test('pnjlim: kleine Schritte und Sperrrichtung in Maßen bleiben unverändert', () => {
  const nVt = thermalVoltage();
  const vcrit = criticalVoltage(nVt, 1e-14);
  assert.deepEqual(limitJunctionVoltage(0.71, 0.70, nVt, vcrit), { v: 0.71, limited: false });
  assert.deepEqual(limitJunctionVoltage(-0.5, 0, nVt, vcrit), { v: -0.5, limited: false });
  // sehr großer Sprung in Sperrrichtung wird auf 2·vOld − 1 begrenzt
  assert.deepEqual(limitJunctionVoltage(-50, -1, nVt, vcrit), { v: -3, limited: true });
});
