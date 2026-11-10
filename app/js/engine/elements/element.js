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
    this.nodeIndices = []; // werden von Circuit gesetzt
    this.internalIndices = [];
    this.branchIndices = [];
  }

  /** Wie viele Zweigströme das Bauteil als zusätzliche Unbekannte braucht. */
  get branchCount() {
    return 0;
  }

  /**
   * Bezeichnungen der inneren Knoten, die das Modell braucht (z. B. ['intern'] bei einer Diode
   * mit Bahnwiderstand). Circuit vergibt dafür Nummern in `internalIndices`.
   */
  get internalNodes() {
    return [];
  }

  /** Wert einer Unbekannten aus der Lösung x (Masse = 0). */
  static at(x, index) {
    return index === GROUND ? 0 : x[index];
  }

  /** true, wenn der Strom nicht proportional zur Spannung ist (Diode, Transistor …). */
  get isNonlinear() {
    return false;
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

  /** Nächster Zeitpunkt nach t, an dem sich das Bauteil sprunghaft ändert (Haltepunkt der Zeitanalyse). */
  nextBreakpoint(_t) {
    return Infinity;
  }

  /** Größte sinnvolle Schrittweite der Zeitanalyse für dieses Bauteil. */
  maxStep() {
    return Infinity;
  }

  // ── Zeitbereich (nur Speicherbauteile wie Kondensator und Spule brauchen diese Methoden) ──

  /**
   * Anfangszustand für die Zeitanalyse aus dem Arbeitspunkt x – oder aus den Anfangsbedingungen
   * des Bauteils (z. B. Kondensator entladen), wenn useInitialConditions gesetzt ist.
   */
  initTransient(_x, _ctx, _useInitialConditions) {}

  /** Berechnet nach einem konvergierten Zeitschritt den neuen Zustand (q_n, dq_n). */
  computeState(_x, _ctx) {}

  /** Größte Schrittweite nach der Fehlerschätzung (Infinity: keine Einschränkung). */
  truncationStep(_ctx) {
    return Infinity;
  }

  /** Der Zeitschritt wurde angenommen: Zustand wird Vergangenheit. */
  acceptStep() {}

  /** Setzt den inneren Zustand vor einer neuen Analyse zurück (z. B. Startwerte der Newton-Iteration). */
  reset() {}

  /**
   * Trägt das Bauteil in das MNA-Gleichungssystem ein.
   * Nichtlineare Bauteile werden um die aktuelle Näherung x linearisiert (Newton-Raphson).
   * @param {import('../mna.js').MnaSystem} _system
   * @param {Float64Array} _x aktuelle Näherungslösung
   * @param {object} _ctx Rechenkontext (Toleranzen, Quellenfaktor …, siehe newton.js)
   */
  stamp(_system, _x, _ctx) {
    throw new Error(`${this.constructor.name}.stamp fehlt`);
  }

  /**
   * Strom-Konvergenzprüfung je Bauteil (wie ngspice): stimmt der Strom, den die Linearisierung
   * für die neue Lösung vorhersagt, mit dem Strom am Linearisierungspunkt überein?
   * Lineare Bauteile sind immer konvergiert.
   */
  converged(_x, _ctx) {
    return true;
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
