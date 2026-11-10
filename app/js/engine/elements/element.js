// Gemeinsame Grundlage aller Bauteilmodelle.
//
// Ein Bauteil wird aus einer Beschreibung (spec) erzeugt, z. B.
//   { type: 'R', name: 'R1', nodes: ['oben', 'mitte'], value: 1000 }
//
// Vorzeichen (für alle Bauteile gleich):
//   U = φ(nodes[0]) − φ(nodes[1])
//   I fließt im Bauteil von nodes[0] nach nodes[1]
//   P = U · I > 0: das Bauteil nimmt Energie auf, P < 0: es gibt Energie ab.

import { CircuitError } from '../errors.js';
import { GROUND } from '../mna.js';

export class Element {
  /** Anzahl der Anschlüsse; von jeder Unterklasse festgelegt. */
  static terminalCount = 2;

  constructor(spec) {
    const { name, nodes } = spec;
    if (typeof name !== 'string' || name === '') {
      throw new CircuitError('Ein Bauteil hat keinen Namen.');
    }
    const count = this.constructor.terminalCount;
    if (!Array.isArray(nodes) || nodes.length !== count) {
      throw new CircuitError(`${name}: braucht genau ${count} Anschlüsse.`, { elements: [name] });
    }
    this.name = name;
    this.nodes = nodes.map(String);
    this.nodeIndices = []; // wird von Circuit gesetzt
    this.branchIndices = []; // wird von Circuit gesetzt
  }

  /** Wie viele Zweigströme das Bauteil als zusätzliche Unbekannte braucht. */
  get branchCount() {
    return 0;
  }

  /** Potenzial am Anschluss i aus der Lösung x. */
  potential(x, i) {
    const k = this.nodeIndices[i];
    return k === GROUND ? 0 : x[k];
  }

  /** Spannung U = φ(nodes[0]) − φ(nodes[1]). */
  voltage(x) {
    return this.potential(x, 0) - this.potential(x, 1);
  }

  /** Strom I im Bauteil von nodes[0] nach nodes[1]. */
  current(_x) {
    throw new Error(`${this.constructor.name}.current fehlt`);
  }

  /** Trägt das Bauteil in das MNA-Gleichungssystem ein. */
  stamp(_system) {
    throw new Error(`${this.constructor.name}.stamp fehlt`);
  }

  /** Prüft, ob ein Kennwert eine endliche Zahl ist (und optional größer als 0). */
  requireNumber(spec, key, { positive = false, label = key, unit = '' } = {}) {
    const v = spec[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new CircuitError(`${this.name}: ${label} fehlt oder ist keine Zahl.`, { elements: [this.name] });
    }
    if (positive && !(v > 0)) {
      const zero = unit ? `0 ${unit}` : '0';
      throw new CircuitError(`${this.name}: ${label} muss größer als ${zero} sein.`, { elements: [this.name] });
    }
    return v;
  }
}
