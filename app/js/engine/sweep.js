// Kennlinie (DC-Sweep): Ein Kennwert eines Bauteils wird schrittweise verändert, für jeden Wert
// wird der Arbeitspunkt berechnet – wie „.dc“ in SPICE oder ein Kennlinienschreiber im Labor.
//
// Jeder Punkt startet von der Lösung des vorigen (Fortsetzung). Das ist schneller und findet bei
// Schaltungen mit mehreren möglichen Zuständen (z. B. Schmitt-Trigger) den Zweig, auf dem man sich
// gerade befindet – wie beim langsamen Drehen am Netzgerät.

import { Circuit } from './circuit.js';
import { CircuitError } from './errors.js';
import { MnaSystem } from './mna.js';
import { ConvergenceError, createContext, newtonSolve } from './newton.js';
import { solveDc, translateError } from './dc.js';

/**
 * @param {object} netlist
 * @param {object} sweep
 * @param {string} sweep.element  Name des Bauteils, dessen Kennwert verändert wird (z. B. 'V1')
 * @param {string} [sweep.parameter]  Kennwert (Vorgabe 'value'; z. B. 'illuminance' beim LDR)
 * @param {number[]} sweep.values  die einzustellenden Werte
 * @param {object} [options]  Toleranzen (siehe SIM_DEFAULTS)
 * @returns {{ values: number[], potentials: Record<string, Float64Array>,
 *             elements: Record<string, {U: Float64Array, I: Float64Array}> }}
 */
export function dcSweep(netlist, { element, parameter = 'value', values }, options = {}) {
  const spec = netlist.elements.find((e) => e.name === element);
  if (!spec) throw new CircuitError(`Das Bauteil „${element}“ gibt es nicht.`);
  if (!Array.isArray(values) || values.length === 0) throw new CircuitError('Die Kennlinie braucht mindestens einen Wert.');

  const potentials = {};
  const elements = {};
  let x = null;
  let previous = null;

  values.forEach((value, k) => {
    // Schaltung mit dem neuen Wert aufbauen und von der vorigen Lösung aus weiterrechnen
    const changed = netlist.elements.map((e) => (e.name === element ? { ...e, [parameter]: value } : e));
    const circuit = new Circuit({ elements: changed });
    const system = new MnaSystem(circuit.nodeCount, circuit.branchCount);
    const ctx = createContext(options);
    const sameStructure = previous && previous.nodeNames.join('|') === circuit.nodeNames.join('|') && previous.branchCount === circuit.branchCount;
    x = sameStructure ? continueFrom(circuit, system, ctx, x) : solveDc(circuit, system, ctx).x;
    previous = circuit;

    for (let i = 0; i < circuit.externalNodeCount; i++) {
      const name = circuit.nodeNames[i];
      (potentials[name] ??= new Float64Array(values.length))[k] = x[i];
    }
    for (const el of circuit.elements) {
      if (el.nodes.length === 0) continue;
      const entry = (elements[el.name] ??= { U: new Float64Array(values.length), I: new Float64Array(values.length) });
      entry.U[k] = el.voltage(x);
      entry.I[k] = el.current(x);
    }
  });
  return { values: [...values], potentials, elements };
}

/**
 * Newton ab der vorigen Lösung. Die frisch erzeugten Bauteile übernehmen ihre Spannungen dabei
 * aus der Startlösung (siehe stamp: „Weiterrechnen von einer Lösung“). Klappt das nicht, wird ein
 * vollständiger Arbeitspunkt mit Konvergenzhilfen berechnet.
 */
function continueFrom(circuit, system, ctx, x) {
  try {
    return newtonSolve(circuit, system, ctx, x, ctx.options.stepIterations).x;
  } catch (err) {
    if (!(err instanceof ConvergenceError)) throw translateError(circuit, err);
    for (const el of circuit.elements) el.reset();
    return solveDc(circuit, system, ctx).x;
  }
}
