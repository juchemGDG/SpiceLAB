// Schaltung = Liste von Bauteilen, die über benannte Knoten verbunden sind.
//
// Eingabe (Netzliste als einfaches Objekt, so liefert sie später der Editor):
//   {
//     elements: [
//       { type: 'V', name: 'V1', nodes: ['oben', '0'], value: 10 },
//       { type: 'R', name: 'R1', nodes: ['oben', 'mitte'], value: 1000 },
//       { type: 'R', name: 'R2', nodes: ['mitte', '0'], value: 1000 },
//     ]
//   }
//
// Der Knoten '0' (oder 'GND') ist die Masse mit 0 V.
// Circuit vergibt die Nummern der Unbekannten: erst alle Knoten, dann alle Zweigströme.

import { CircuitError } from './errors.js';
import { GROUND } from './mna.js';
import { createElement } from './elements/index.js';

export const GROUND_NAMES = new Set(['0', 'GND', 'gnd']);

export class Circuit {
  constructor(netlist) {
    const specs = netlist?.elements;
    if (!Array.isArray(specs) || specs.length === 0) {
      throw new CircuitError('Die Schaltung enthält keine Bauteile.');
    }
    this.elements = specs.map(createElement);
    this.#checkUniqueNames();

    // 1. Knoten nummerieren (Masse bekommt GROUND)
    this.nodeNames = [];
    const index = new Map();
    let hasGround = false;
    for (const el of this.elements) {
      el.nodeIndices = el.nodes.map((node) => {
        if (GROUND_NAMES.has(node)) {
          hasGround = true;
          return GROUND;
        }
        if (!index.has(node)) {
          index.set(node, this.nodeNames.length);
          this.nodeNames.push(node);
        }
        return index.get(node);
      });
    }
    if (!hasGround) {
      throw new CircuitError('Die Schaltung hat keinen Massepunkt (0 V). Lege einen Anschluss auf Masse.');
    }
    this.nodeIndex = index;

    // 2. Zweigströme hinter den Knoten nummerieren
    let next = this.nodeNames.length;
    for (const el of this.elements) {
      el.branchIndices = Array.from({ length: el.branchCount }, () => next++);
    }
    this.branchCount = next - this.nodeNames.length;
  }

  get nodeCount() {
    return this.nodeNames.length;
  }

  /** true, sobald ein Bauteil nichtlinear ist – dann wird iteriert (Newton-Raphson). */
  get isNonlinear() {
    return this.elements.some((el) => el.isNonlinear);
  }

  /** Bauteil, dem der Zweigstrom mit dieser Nummer gehört. */
  elementOfBranch(unknown) {
    return this.elements.find((el) => el.branchIndices.includes(unknown));
  }

  #checkUniqueNames() {
    const seen = new Set();
    for (const el of this.elements) {
      if (seen.has(el.name)) {
        throw new CircuitError(`Der Name „${el.name}“ kommt mehrfach vor.`, { elements: [el.name] });
      }
      seen.add(el.name);
    }
  }
}
