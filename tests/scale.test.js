import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steps125, TIME_STEPS, VOLT_STEPS, stepAtLeast, autoVertical, autoTimePerDiv } from '../app/js/ui/scale.js';

test('1-2-5-Stufen', () => {
  assert.deepEqual(steps125(1, 100), [1, 2, 5, 10, 20, 50, 100]);
  assert.equal(TIME_STEPS[0], 1e-6);
  assert.equal(TIME_STEPS.at(-1), 1);
  assert.ok(VOLT_STEPS.includes(0.5) && VOLT_STEPS.includes(5) && VOLT_STEPS.includes(0.002));
  assert.equal(stepAtLeast([1, 2, 5], 1.5), 2);
  assert.equal(stepAtLeast([1, 2, 5], 9), 5);
});

test('Auto-Volt/Div: nur positive Werte → Nulllinie unten, sonst Mitte; alles passt auf den Schirm', () => {
  const pos = autoVertical(0, 9);
  assert.deepEqual(pos, { voltsPerDiv: 2, zeroDiv: 0 }); // 9 V in 7,5 Kästchen → 2 V/Div
  const sym = autoVertical(-325, 325);
  assert.equal(sym.zeroDiv, 4);
  assert.ok(sym.voltsPerDiv * 4 >= 325 && sym.voltsPerDiv === 100);
  assert.deepEqual(autoVertical(NaN, NaN), { voltsPerDiv: 1, zeroDiv: 4 });
});

test('Auto-Zeit/Div: drei Perioden der schnellsten Quelle, sonst 100 ms/Div', () => {
  assert.equal(autoTimePerDiv([50]), 0.01); // 60 ms → 10 ms/Div
  assert.equal(autoTimePerDiv([1000, 50]), 0.0005); // 3 ms → 0,5 ms/Div
  assert.equal(autoTimePerDiv([]), 0.1);
});
