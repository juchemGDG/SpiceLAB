// Arbeitspunkt (DC-Analyse): alle Potenziale, Spannungen, Ströme und Leistungen
// im eingeschwungenen Zustand mit Gleichspannung.
//
// Ablauf: Schaltung aufbauen → jedes Bauteil stempelt → Gleichungssystem lösen → Werte ablesen.
// (Für nichtlineare Bauteile wie Dioden wird daraus in Phase 2 eine Newton-Iteration.)

import { Circuit } from './circuit.js';
import { CircuitError } from './errors.js';
import { MnaSystem } from './mna.js';
import { SingularMatrixError } from './linalg.js';

/**
 * @param {object|Circuit} netlist Netzliste (siehe circuit.js) oder fertige Schaltung
 * @returns {{
 *   potentials: Record<string, number>,
 *   elements: Record<string, {U: number, I: number, P: number}>
 * }} Potenziale je Knoten (Masse = 0 V) und U, I, P je Bauteil
 */
export function operatingPoint(netlist) {
  const circuit = netlist instanceof Circuit ? netlist : new Circuit(netlist);
  const system = new MnaSystem(circuit.nodeCount, circuit.branchCount);
  for (const el of circuit.elements) el.stamp(system);

  let x;
  try {
    x = system.solve();
  } catch (err) {
    if (err instanceof SingularMatrixError) throw explainSingular(circuit, err.index);
    throw err;
  }

  const potentials = { 0: 0 };
  circuit.nodeNames.forEach((name, i) => (potentials[name] = x[i]));

  const elements = {};
  for (const el of circuit.elements) {
    const U = el.voltage(x);
    const I = el.current(x);
    elements[el.name] = { U, I, P: U * I };
  }
  return { potentials, elements };
}

/** Übersetzt „Matrix singulär“ in eine Meldung, mit der man die Schaltung reparieren kann. */
function explainSingular(circuit, unknown) {
  if (unknown < circuit.nodeCount) {
    const node = circuit.nodeNames[unknown];
    const attached = circuit.elements.filter((el) => el.nodes.includes(node)).map((el) => el.name);
    return new CircuitError(
      `Das Potenzial am Knoten „${node}“ ist nicht festgelegt. ` +
        'Wahrscheinlich hängt dieser Teil der Schaltung in der Luft (keine Verbindung zur Masse).',
      { nodes: [node], elements: attached },
    );
  }
  const source = circuit.elementOfBranch(unknown);
  return new CircuitError(
    `Die Spannungsquelle „${source.name}“ ist direkt parallel zu einer anderen Spannungsquelle ` +
      'oder bildet mit Spannungsquellen eine Masche ohne Widerstand. Das ist ein Kurzschluss.',
    { elements: [source.name] },
  );
}
