// Newton-Raphson-Iteration für nichtlineare Schaltungen.
//
// Idee: Eine Diode hat keine feste Kennlinie I = U/R. Man rät eine Lösung x, ersetzt jedes
// nichtlineare Bauteil durch seine Tangente in diesem Punkt (Leitwert + Stromquelle), löst das
// nun lineare Gleichungssystem und wiederholt das mit der neuen Lösung, bis sich nichts mehr ändert.
//
// Konvergenzkriterien wie ngspice (NIconvTest + Bauteilprüfung):
//   1. Jede Unbekannte ändert sich höchstens um RELTOL · max(|neu|, |alt|) + VNTOL (Spannungen)
//      bzw. + ABSTOL (Ströme).
//   2. Kein Bauteil musste in dieser Iteration seine Spannung begrenzen (ctx.limited).
//   3. Jedes Bauteil meldet converged(): Die Tangente sagt den Strom genau genug voraus.
// Mindestens zwei Iterationen, damit überhaupt verglichen werden kann.
// Lineare Schaltungen brauchen keine Iteration: eine Lösung genügt.

/** Voreinstellungen, Namen und Werte wie in ngspice. */
export const SIM_DEFAULTS = Object.freeze({
  reltol: 1e-3, // RELTOL: relative Toleranz
  vntol: 1e-6, // VNTOL: absolute Toleranz für Spannungen in V
  abstol: 1e-12, // ABSTOL: absolute Toleranz für Ströme in A
  gmin: 1e-12, // GMIN: kleinster Leitwert parallel zu jedem pn-Übergang in S
  maxIterations: 100, // ITL1: höchstens so viele Newton-Schritte für den Arbeitspunkt
  stepIterations: 50, // ITL2: höchstens so viele je Schritt der Konvergenzhilfen
  tranIterations: 10, // ITL4: höchstens so viele je Zeitschritt
  trtol: 7, // TRTOL: Faktor, um den der geschätzte Abschneidefehler die Toleranz überschätzt
  chgtol: 1e-14, // CHGTOL: kleinste beachtete Ladung in C
});

export class ConvergenceError extends Error {
  constructor(iterations) {
    super(`Newton-Iteration nach ${iterations} Schritten nicht konvergiert.`);
    this.name = 'ConvergenceError';
  }
}

/**
 * Rechenkontext, den jedes Bauteil beim Stempeln bekommt.
 * @param {object} options Toleranzen (siehe SIM_DEFAULTS)
 */
export function createContext(options = {}) {
  return {
    options: { ...SIM_DEFAULTS, ...options },
    mode: 'dc', // 'dc' (Arbeitspunkt) oder 'tran' (Zeitschritt)
    time: 0, // Simulationszeit in s (Arbeitspunkt: 0)
    order: 1, // Ordnung des Integrationsverfahrens (1 Euler, 2 Trapez) – nur 'tran'
    ag0: 0, // Integrationskoeffizient 1/h bzw. 2/h – nur 'tran'
    deltaOld: [0, 0, 0], // letzte Schrittweiten [h_n, h_{n−1}, h_{n−2}] – nur 'tran'
    sourceFactor: 1, // Faktor für alle Quellen (Quellen-Stepping)
    diagonalGmin: 0, // zusätzlicher Leitwert jedes Knotens nach Masse (Gmin-Stepping)
    limited: false, // wird von Bauteilen gesetzt, die ihre Spannung begrenzen mussten
    initJunctions: false, // Kaltstart: pn-Übergänge beginnen bei Vcrit (nur 1. Iteration ohne Startlösung)
  };
}

/**
 * Löst die Schaltung mit Newton-Raphson.
 * @param {import('./circuit.js').Circuit} circuit
 * @param {import('./mna.js').MnaSystem} system
 * @param {ReturnType<typeof createContext>} ctx
 * @param {Float64Array} [x0] Startlösung; ohne sie Kaltstart (alles 0, pn-Übergänge bei Vcrit)
 * @param {number} [maxIterations] Höchstzahl der Schritte (Vorgabe ITL1)
 * @returns {{x: Float64Array, iterations: number}}
 * @throws {ConvergenceError}
 */
export function newtonSolve(circuit, system, ctx, x0, maxIterations = ctx.options.maxIterations) {
  let x = x0 ? Float64Array.from(x0) : new Float64Array(system.size);

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    system.clear();
    ctx.limited = false;
    ctx.initJunctions = iteration === 1 && !x0;
    for (const el of circuit.elements) el.stamp(system, x, ctx);
    if (ctx.diagonalGmin > 0) system.addNodeDiagonal(ctx.diagonalGmin);
    const xNew = system.solve();

    if (!circuit.isNonlinear) return { x: xNew, iterations: 1 };

    const done =
      iteration > 1 &&
      !ctx.limited &&
      solutionConverged(x, xNew, system.nodeCount, ctx.options) &&
      circuit.elements.every((el) => el.converged(xNew, ctx));
    x = xNew;
    if (done) return { x, iterations: iteration };
  }
  throw new ConvergenceError(maxIterations);
}

/** Kriterium 1: Hat sich jede Unbekannte nur noch innerhalb der Toleranz geändert? */
function solutionConverged(xOld, xNew, nodeCount, { reltol, vntol, abstol }) {
  for (let i = 0; i < xNew.length; i++) {
    const absolute = i < nodeCount ? vntol : abstol; // erst Potenziale, dann Zweigströme
    const tol = reltol * Math.max(Math.abs(xNew[i]), Math.abs(xOld[i])) + absolute;
    if (!(Math.abs(xNew[i] - xOld[i]) <= tol)) return false;
  }
  return true;
}
