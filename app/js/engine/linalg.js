// Lineares Gleichungssystem A · x = b lösen.
//
// Verfahren: Gauß-Elimination mit Spaltenpivotsuche (in jeder Spalte wird die Zeile mit dem
// betragsgrößten Eintrag nach oben getauscht, das hält die Rundungsfehler klein).
//
// Warum eine dichte Matrix? SPICE arbeitet mit dünn besetzten Matrizen, weil Industrieschaltungen
// tausende Knoten haben. Schulschaltungen haben selten mehr als 50 Unbekannte – dafür ist die
// dichte Variante schnell genug und viel leichter nachzuvollziehen.

/** Wird geworfen, wenn das Gleichungssystem keine eindeutige Lösung hat. */
export class SingularMatrixError extends Error {
  /** @param {number} index Nummer der Unbekannten, bei der die Elimination scheitert */
  constructor(index) {
    super(`Gleichungssystem ist nicht eindeutig lösbar (Unbekannte Nr. ${index}).`);
    this.name = 'SingularMatrixError';
    this.index = index;
  }
}

/** Erzeugt eine n×n-Matrix voller Nullen (Array von Zeilen). */
export function createMatrix(n) {
  return Array.from({ length: n }, () => new Float64Array(n));
}

// Ein Pivot gilt als null, wenn er kleiner ist als dieser Anteil des größten Matrixeintrags.
const RELATIVE_TOLERANCE = 1e-14;

/**
 * Löst A · x = b. A und b werden nicht verändert.
 * @param {ArrayLike<number>[]} A quadratische Matrix (Array von Zeilen)
 * @param {ArrayLike<number>} b rechte Seite
 * @returns {Float64Array} Lösung x
 * @throws {SingularMatrixError}
 */
export function solveLinear(A, b) {
  const n = b.length;
  const M = Array.from(A, (row) => Float64Array.from(row)); // Arbeitskopie
  const x = Float64Array.from(b);

  let largest = 0;
  for (const row of M) for (const v of row) largest = Math.max(largest, Math.abs(v));
  const tolerance = largest * RELATIVE_TOLERANCE;

  // 1. Vorwärts-Elimination: Nullen unterhalb der Diagonalen erzeugen
  for (let k = 0; k < n; k++) {
    // Pivotsuche: betragsgrößter Eintrag in Spalte k ab Zeile k
    let pivotRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[pivotRow][k])) pivotRow = i;
    }
    if (!(Math.abs(M[pivotRow][k]) > tolerance)) throw new SingularMatrixError(k);

    if (pivotRow !== k) {
      [M[k], M[pivotRow]] = [M[pivotRow], M[k]];
      [x[k], x[pivotRow]] = [x[pivotRow], x[k]];
    }

    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / M[k][k];
      if (factor === 0) continue;
      for (let j = k; j < n; j++) M[i][j] -= factor * M[k][j];
      x[i] -= factor * x[k];
    }
  }

  // 2. Rückwärts-Einsetzen: von der letzten Zeile nach oben
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}
