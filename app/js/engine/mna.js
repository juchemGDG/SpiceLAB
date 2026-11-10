// Modifizierte Knotenanalyse (MNA) – das Verfahren, das auch SPICE verwendet.
//
// Unbekannte:
//   - das Potenzial φ jedes Knotens (außer Masse, die hat 0 V),
//   - der Strom durch jede Spannungsquelle („Zweigstrom“), weil er sich nicht aus
//     einem Leitwert berechnen lässt.
//
// Gleichungen:
//   - je Knoten die Knotenregel (Kirchhoff 1): Summe der abfließenden Ströme = 0,
//   - je Spannungsquelle ihre Gleichung φ(+) − φ(−) = U.
//
// Jedes Bauteil trägt seinen Anteil in Matrix A und rechte Seite b ein („stempeln“, engl. stamp).
// Index −1 steht für Masse: Einträge dafür entfallen, weil φ(Masse) = 0 bekannt ist.

import { createMatrix, solveLinear } from './linalg.js';

export const GROUND = -1;

export class MnaSystem {
  /**
   * @param {number} nodeCount Anzahl der Knoten ohne Masse
   * @param {number} branchCount Anzahl der Zweigströme (Spannungsquellen …)
   */
  constructor(nodeCount, branchCount) {
    this.nodeCount = nodeCount;
    this.branchCount = branchCount;
    this.size = nodeCount + branchCount;
    this.A = createMatrix(this.size);
    this.b = new Float64Array(this.size);
  }

  /** Setzt A und b auf null (für die nächste Iteration oder den nächsten Zeitschritt). */
  clear() {
    for (const row of this.A) row.fill(0);
    this.b.fill(0);
  }

  addToMatrix(row, col, value) {
    if (row !== GROUND && col !== GROUND) this.A[row][col] += value;
  }

  addToRhs(row, value) {
    if (row !== GROUND) this.b[row] += value;
  }

  /**
   * Leitwert g zwischen den Knoten a und b (Widerstand R: g = 1/R).
   * Strom von a nach b: I = g · (φa − φb). Er fließt aus a ab und in b zu.
   */
  stampConductance(a, b, g) {
    this.addToMatrix(a, a, g);
    this.addToMatrix(b, b, g);
    this.addToMatrix(a, b, -g);
    this.addToMatrix(b, a, -g);
  }

  /**
   * Konstanter Strom, der im Bauteil von Knoten `from` nach Knoten `to` fließt:
   * er wird dem Knoten `from` entnommen und in den Knoten `to` eingespeist.
   */
  stampCurrentSource(from, to, current) {
    this.addToRhs(from, -current);
    this.addToRhs(to, current);
  }

  /**
   * Spannungsquelle φ(plus) − φ(minus) = voltage.
   * Die zusätzliche Unbekannte `branch` ist der Strom, der in der Quelle von plus nach minus fließt
   * (bei einer Batterie, die Energie abgibt, ist er deshalb negativ – wie bei SPICE).
   */
  stampVoltageSource(plus, minus, branch, voltage) {
    // Der Zweigstrom fließt aus dem Plus-Knoten ab und in den Minus-Knoten zu (Knotenregel) …
    this.addToMatrix(plus, branch, 1);
    this.addToMatrix(minus, branch, -1);
    // … und die Quelle erzwingt die Potenzialdifferenz (eigene Gleichung in Zeile `branch`).
    this.addToMatrix(branch, plus, 1);
    this.addToMatrix(branch, minus, -1);
    this.addToRhs(branch, voltage);
  }

  /**
   * Tangenten-Stempel für ein nichtlineares Bauteil mit beliebig vielen Anschlüssen.
   *
   * I_k = Strom, der am Anschluss k vom Knoten in das Bauteil hineinfließt (k = 0 … n−1).
   * Um den Punkt V0 (Anschlusspotenziale) linearisiert:
   *   I_k ≈ I0_k + Σ_j J_kj · (V_j − V0_j)          J_kj = ∂I_k/∂V_j
   * Der von V abhängige Teil kommt in die Matrix, der Rest als Konstante auf die rechte Seite.
   *
   * @param {number[]} nodes Knotennummern der Anschlüsse
   * @param {number[]} I0 Ströme im Linearisierungspunkt
   * @param {number[][]} J Ableitungen ∂I_k/∂V_j
   * @param {number[]} V0 Anschlusspotenziale im Linearisierungspunkt
   */
  stampLinearized(nodes, I0, J, V0) {
    for (let k = 0; k < nodes.length; k++) {
      let constant = I0[k];
      for (let j = 0; j < nodes.length; j++) {
        if (J[k][j] === 0) continue;
        this.addToMatrix(nodes[k], nodes[j], J[k][j]);
        constant -= J[k][j] * V0[j];
      }
      this.addToRhs(nodes[k], -constant);
    }
  }

  /**
   * Leitwert g von jedem Knoten nach Masse (nur für Gmin-Stepping, siehe dc.js):
   * macht das System gutmütiger, verfälscht aber das Ergebnis – wird am Ende auf 0 zurückgefahren.
   */
  addNodeDiagonal(g) {
    for (let i = 0; i < this.nodeCount; i++) this.A[i][i] += g;
  }

  /** Löst das Gleichungssystem und liefert alle Unbekannten (Potenziale, dann Zweigströme). */
  solve() {
    return solveLinear(this.A, this.b);
  }
}
