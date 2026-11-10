// Arbeitspunkt (DC-Analyse): alle Potenziale, Spannungen, Ströme und Leistungen
// im eingeschwungenen Zustand mit Gleichspannung.
//
// Ablauf: Schaltung aufbauen → Newton-Iteration (jedes Bauteil stempelt, Gleichungssystem lösen,
// wiederholen bis konvergiert), bei Bedarf mit Konvergenzhilfen (op-strategies.js) → Werte ablesen.
// Lineare Schaltungen brauchen nur einen Durchlauf.

import { Circuit } from './circuit.js';
import { CircuitError } from './errors.js';
import { MnaSystem } from './mna.js';
import { SingularMatrixError } from './linalg.js';
import { ConvergenceError, createContext } from './newton.js';
import { solveOperatingPoint } from './op-strategies.js';

/**
 * @param {object|Circuit} netlist Netzliste (siehe circuit.js) oder fertige Schaltung
 * @param {object} [options] Toleranzen, siehe SIM_DEFAULTS in newton.js
 * @returns {{
 *   potentials: Record<string, number>,
 *   elements: Record<string, {U: number, I: number, P: number}>,
 *   iterations: number,
 *   method: string
 * }} Potenziale je Knoten (Masse = 0 V), U, I, P je Bauteil, Anzahl der Newton-Schritte
 *    und verwendete Strategie ('direkt', 'gmin' oder 'quellen')
 */
export function operatingPoint(netlist, options = {}) {
  const circuit = netlist instanceof Circuit ? netlist : new Circuit(netlist);
  const system = new MnaSystem(circuit.nodeCount, circuit.branchCount);
  const ctx = createContext(options);
  const { x, iterations, method } = solveDc(circuit, system, ctx);

  const potentials = { 0: 0 };
  for (let i = 0; i < circuit.externalNodeCount; i++) potentials[circuit.nodeNames[i]] = x[i];

  const elements = {};
  for (const el of circuit.elements) {
    if (el.nodes.length === 0) continue; // z. B. Kopplung zweier Spulen: kein eigener Strom
    const U = el.voltage(x);
    const I = el.current(x);
    elements[el.name] = { U, I, P: U * I };
  }
  return { potentials, elements, iterations, method };
}

/**
 * Löst den Arbeitspunkt und übersetzt numerische Fehler in verständliche Meldungen.
 * Wird auch von der Zeitbereichsanalyse für den Startzustand verwendet.
 * @returns {{x: Float64Array, iterations: number, method: string}}
 * @throws {CircuitError}
 */
export function solveDc(circuit, system, ctx) {
  try {
    return solveOperatingPoint(circuit, system, ctx);
  } catch (err) {
    throw translateError(circuit, err);
  }
}

/** Übersetzt Fehler des Gleichungslösers in eine Meldung, mit der man die Schaltung reparieren kann. */
export function translateError(circuit, err) {
  if (err instanceof SingularMatrixError) return explainSingular(circuit, err.index);
  if (err instanceof ConvergenceError) {
    return new CircuitError(
      'Für diese Schaltung lässt sich kein Arbeitspunkt berechnen. ' +
        'Prüfe, ob alle Bauteile sinnvoll angeschlossen sind, z. B. ob vor Dioden und LEDs ein Widerstand liegt.',
    );
  }
  return err;
}

function explainSingular(circuit, unknown) {
  if (circuit.internalOwner.has(unknown)) {
    const name = circuit.internalOwner.get(unknown).name;
    return new CircuitError(`Das Bauteil „${name}“ ist nicht richtig angeschlossen.`, { elements: [name] });
  }
  if (unknown < circuit.nodeCount) {
    const node = circuit.nodeNames[unknown];
    const attached = circuit.elements.filter((el) => el.nodes.includes(node)).map((el) => el.name);
    return new CircuitError(
      `Das Potenzial am Knoten „${node}“ ist nicht festgelegt. ` +
        'Wahrscheinlich hängt dieser Teil der Schaltung in der Luft (keine Verbindung zur Masse).',
      { nodes: [node], elements: attached },
    );
  }
  // Zweigströme gehören zu Spannungsquellen und Spulen (für Gleichstrom ein Leiter ohne Widerstand)
  const el = circuit.elementOfBranch(unknown);
  return new CircuitError(
    `„${el.name}“ (${el.constructor.label}) bildet mit Spannungsquellen oder Spulen eine Masche ohne Widerstand ` +
      '(z. B. zwei Spannungsquellen direkt parallel). Für Gleichstrom ist das ein Kurzschluss.',
    { elements: [el.name] },
  );
}
