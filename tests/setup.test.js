// Prüft nur, dass der Testlauf funktioniert. Wird entfernt, sobald echte Tests da sind.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Testlauf funktioniert', () => {
  assert.equal(1 + 1, 2);
});
