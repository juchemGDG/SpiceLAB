import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetLimit, limitVds } from '../app/js/engine/fet-limits.js';

test('fetLimit: aus dem Sperrbereich höchstens bis knapp über die Schwelle', () => {
  assert.equal(fetLimit(10, 0, 2), 2.5); // vto + 0,5
  assert.equal(fetLimit(1.5, 0, 2), 1.5); // kleiner Schritt bleibt
});

test('fetLimit: im mittleren Bereich höchstens vto + 4 bzw. vto − 0,5', () => {
  assert.equal(fetLimit(20, 3, 2), 6);
  assert.equal(fetLimit(-5, 3, 2), 1.5);
});

test('fetLimit: voll eingeschaltet – große Sprünge werden gebremst', () => {
  assert.equal(fetLimit(40, 10, 2), 10 + (Math.abs(2 * (10 - 2)) + 2)); // vtsthi = 18
  assert.equal(fetLimit(7, 10, 2), 7); // innerhalb vtstlo
  assert.equal(fetLimit(5.6, 10, 2), 5.6); // unter vtox → max(vNew, vto + 2)
  assert.equal(fetLimit(0, 10, 2), 4);
});

test('limitVds', () => {
  assert.equal(limitVds(100, 5), 17); // 3·5 + 2
  assert.equal(limitVds(1, 5), 2);
  assert.equal(limitVds(10, 1), 4);
  assert.equal(limitVds(-10, 1), -0.5);
  assert.equal(limitVds(3, 1), 3);
});
