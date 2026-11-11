import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, logTicks } from '../app/js/ui/plot.js';

test('runde Teilstriche: Schrittweite 1, 2, 5 · 10^n, Bereich wird erweitert', () => {
  const t = niceTicks(0, 9.3, 6);
  assert.equal(t.step, 2);
  assert.deepEqual(t.ticks, [0, 2, 4, 6, 8, 10]);
  assert.deepEqual([t.min, t.max], [0, 10]);
  const n = niceTicks(-0.73, 0.65, 6);
  assert.equal(n.step, 0.2);
  assert.ok(n.ticks.includes(0) && n.min <= -0.73 && n.max >= 0.65);
});

test('Teilstriche: leerer oder gleicher Bereich bekommt Platz; keine Gleitkomma-Reste', () => {
  const t = niceTicks(5, 5);
  assert.ok(t.max > t.min);
  assert.ok(niceTicks(0, 0.3, 3).ticks.every((v) => String(v).length < 8));
});

test('Dekaden-Teilung für logarithmische Achsen', () => {
  const t = logTicks(15, 8000);
  assert.equal(t.min, 10);
  assert.equal(t.max, 10000);
  assert.deepEqual(t.ticks.filter((x) => x.major).map((x) => x.v), [10, 100, 1000, 10000]);
  assert.ok(t.ticks.some((x) => x.v === 50 && !x.major));
});
