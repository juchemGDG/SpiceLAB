import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveLinear, createMatrix, SingularMatrixError } from '../app/js/engine/linalg.js';

function assertClose(actual, expected, tol = 1e-12) {
  assert.equal(actual.length, expected.length);
  expected.forEach((e, i) => {
    assert.ok(Math.abs(actual[i] - e) <= tol * Math.max(1, Math.abs(e)),
      `x[${i}] = ${actual[i]}, erwartet ${e}`);
  });
}

test('2×2-System', () => {
  // 2x + y = 5, x − y = 1  →  x = 2, y = 1
  assertClose(solveLinear([[2, 1], [1, -1]], [5, 1]), [2, 1]);
});

test('Pivotsuche: Null auf der Diagonalen', () => {
  // ohne Zeilentausch würde durch A[0][0] = 0 geteilt
  assertClose(solveLinear([[0, 1, 1], [1, 0, 1], [1, 1, 0]], [5, 4, 3]), [1, 2, 3]);
});

test('Werte sehr unterschiedlicher Größe (wie Leitwerte 1/1 MΩ und 1/1 Ω)', () => {
  const A = [[1e-6 + 1, -1], [-1, 1 + 1e-3]];
  const x = solveLinear(A, [1, 0]);
  // Probe: A · x = b
  assert.ok(Math.abs(A[0][0] * x[0] + A[0][1] * x[1] - 1) < 1e-12);
  assert.ok(Math.abs(A[1][0] * x[0] + A[1][1] * x[1]) < 1e-12);
});

test('A und b bleiben unverändert', () => {
  const A = [[0, 1], [1, 0]];
  const b = [1, 2];
  solveLinear(A, b);
  assert.deepEqual(A, [[0, 1], [1, 0]]);
  assert.deepEqual(b, [1, 2]);
});

test('singuläre Matrix meldet die betroffene Unbekannte', () => {
  // Unbekannte 1 kommt in keiner Gleichung vor (wie ein Knoten, der in der Luft hängt)
  assert.throws(() => solveLinear([[1, 0], [2, 0]], [1, 2]),
    (err) => err instanceof SingularMatrixError && err.index === 1);
});

test('createMatrix liefert eine Nullmatrix', () => {
  const M = createMatrix(3);
  assert.equal(M.length, 3);
  assert.ok(M.every((row) => row.length === 3 && row.every((v) => v === 0)));
});
