// Konvergenzhilfen für den Arbeitspunkt – dieselbe Reihenfolge wie ngspice:
//   1. direkt:  Newton-Raphson vom Kaltstart aus
//   2. Gmin-Stepping:  Jeder Knoten bekommt zunächst einen großen Leitwert nach Masse (10 mS).
//      Das macht die Schaltung „weich“ und leicht lösbar. Der Leitwert wird schrittweise verkleinert,
//      jede Lösung ist Startwert für die nächste. Am Ende wird ohne Zusatzleitwert gerechnet.
//   3. Quellen-Stepping:  Alle Quellen starten bei 0 (Lösung trivial) und werden schrittweise auf
//      100 % hochgefahren – wie ein Netzgerät, das man langsam aufdreht.
// Misslingt ein Schritt, wird er von der letzten guten Lösung aus mit kleinerer Schrittweite wiederholt.
// Jeder Schritt darf höchstens ITL2 Newton-Iterationen brauchen (ngspice: CKTdcTrcvMaxIter).

import { ConvergenceError, newtonSolve } from './newton.js';

const GMIN_START = 1e-2; // S
const GMIN_FACTOR = 10; // ngspice: GMINFACTOR
const SOURCE_STEP_START = 0.1;
const SOURCE_STEP_MIN = 1e-4;

/**
 * Probiert die Strategien der Reihe nach.
 * @returns {{x: Float64Array, iterations: number, method: 'direkt'|'gmin'|'quellen'}}
 * @throws {ConvergenceError} wenn alle Strategien scheitern
 */
export function solveOperatingPoint(circuit, system, ctx) {
  const strategies = [['direkt', solveDirect], ['gmin', gminStepping], ['quellen', sourceStepping]];
  let lastError;
  for (const [method, strategy] of strategies) {
    resetAll(circuit);
    ctx.sourceFactor = 1;
    ctx.diagonalGmin = 0;
    try {
      return { ...strategy(circuit, system, ctx), method };
    } catch (err) {
      if (!(err instanceof ConvergenceError)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export function solveDirect(circuit, system, ctx) {
  return newtonSolve(circuit, system, ctx);
}

export function gminStepping(circuit, system, ctx) {
  const target = ctx.options.gmin;
  let g = GMIN_START;
  let factor = GMIN_FACTOR;
  let iterations = 0;

  ctx.diagonalGmin = g;
  let x = count(newtonSolve(circuit, system, ctx, undefined, ctx.options.stepIterations));

  while (g > target) {
    const next = Math.max(g / factor, target);
    ctx.diagonalGmin = next;
    try {
      x = count(newtonSolve(circuit, system, ctx, x, ctx.options.stepIterations));
      g = next;
      factor = Math.min(factor * Math.sqrt(factor), GMIN_FACTOR); // lief gut → wieder größere Schritte
    } catch (err) {
      if (!(err instanceof ConvergenceError)) throw err;
      factor = Math.sqrt(factor); // kleinere Schritte
      if (factor < 1.00005) throw err;
      resetAll(circuit); // von der letzten guten Lösung neu ansetzen
    }
  }
  ctx.diagonalGmin = 0;
  x = count(newtonSolve(circuit, system, ctx, x, ctx.options.stepIterations));
  return { x, iterations };

  function count(result) {
    iterations += result.iterations;
    return result.x;
  }
}

export function sourceStepping(circuit, system, ctx) {
  let f = 0;
  let step = SOURCE_STEP_START;
  let iterations = 0;

  ctx.sourceFactor = 0;
  let x = count(newtonSolve(circuit, system, ctx, undefined, ctx.options.stepIterations));

  while (f < 1) {
    const next = Math.min(1, f + step);
    ctx.sourceFactor = next;
    try {
      x = count(newtonSolve(circuit, system, ctx, x, ctx.options.stepIterations));
      f = next;
      step = Math.min(step * 2, 0.5);
    } catch (err) {
      if (!(err instanceof ConvergenceError)) throw err;
      step /= 2;
      if (step < SOURCE_STEP_MIN) throw err;
      resetAll(circuit);
    }
  }
  return { x, iterations };

  function count(result) {
    iterations += result.iterations;
    return result.x;
  }
}

function resetAll(circuit) {
  for (const el of circuit.elements) el.reset();
}
