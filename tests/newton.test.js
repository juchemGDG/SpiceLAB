// Newton-Iteration, geprüft mit einem Testbauteil I = U³ (keine echte Diode nötig).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MnaSystem, GROUND } from '../app/js/engine/mna.js';
import { createContext, newtonSolve, ConvergenceError } from '../app/js/engine/newton.js';
import { operatingPoint } from '../app/js/engine/dc.js';

/** Nichtlineares Testbauteil zwischen Knoten 0 und Masse: I = U³. */
const cubic = {
  isNonlinear: true,
  stamp(system, x) {
    const u = x[0];
    const g = 3 * u * u; // Steigung dI/dU der Kennlinie
    const i = u ** 3;
    // Tangente: I ≈ i + g·(U − u) = g·U + (i − g·u)  →  Leitwert g und Stromquelle (i − g·u)
    system.stampConductance(0, GROUND, g);
    system.stampCurrentSource(0, GROUND, i - g * u);
  },
  converged: () => true,
};

/** 2 A werden in Knoten 0 eingespeist, parallel liegen 1 Ω und das Testbauteil: U + U³ = 2 → U = 1. */
const feed = {
  stamp(system) {
    system.stampCurrentSource(GROUND, 0, 2);
    system.stampConductance(0, GROUND, 1);
  },
  converged: () => true,
};

test('Newton findet U = 1 für U + U³ = 2', () => {
  const circuit = { elements: [feed, cubic], isNonlinear: true };
  const { x, iterations } = newtonSolve(circuit, new MnaSystem(1, 0), createContext(), [0.5]);
  assert.ok(Math.abs(x[0] - 1) < 1e-6, `U = ${x[0]}`);
  assert.ok(iterations >= 2 && iterations < 20, `${iterations} Iterationen`);
});

test('ohne Konvergenz innerhalb ITL1 kommt ConvergenceError', () => {
  const circuit = { elements: [feed, cubic], isNonlinear: true };
  assert.throws(
    () => newtonSolve(circuit, new MnaSystem(1, 0), createContext({ maxIterations: 2 }), [0.5]),
    ConvergenceError,
  );
});

test('lineare Schaltung: genau ein Durchlauf', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['a', '0'], value: 5 },
      { type: 'R', name: 'R1', nodes: ['a', '0'], value: 100 },
    ],
  });
  assert.equal(r.iterations, 1);
});
