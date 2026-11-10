// Fehler in der Schaltung, die Schülerinnen und Schülern angezeigt werden.
// Die Meldung ist deshalb deutsch und ohne Fachbegriffe der Numerik formuliert.

export class CircuitError extends Error {
  /**
   * @param {string} message verständliche Meldung
   * @param {string[]} [elements] Namen der betroffenen Bauteile (zum Hervorheben im Editor)
   * @param {string[]} [nodes] Namen der betroffenen Knoten
   */
  constructor(message, { elements = [], nodes = [] } = {}) {
    super(message);
    this.name = 'CircuitError';
    this.elements = elements;
    this.nodes = nodes;
  }
}
