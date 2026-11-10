import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from '../app/js/engine/circuit.js';
import { CircuitError } from '../app/js/engine/errors.js';
import { GROUND } from '../app/js/engine/mna.js';

const divider = {
  elements: [
    { type: 'V', name: 'V1', nodes: ['oben', '0'], value: 10 },
    { type: 'R', name: 'R1', nodes: ['oben', 'mitte'], value: 1000 },
    { type: 'R', name: 'R2', nodes: ['mitte', 'GND'], value: 1000 },
  ],
};

test('Knoten und Zweigströme werden nummeriert', () => {
  const c = new Circuit(divider);
  assert.deepEqual(c.nodeNames, ['oben', 'mitte']);
  assert.deepEqual(c.elements[0].nodeIndices, [0, GROUND]);
  assert.deepEqual(c.elements[2].nodeIndices, [1, GROUND]); // 'GND' ist auch Masse
  assert.deepEqual(c.elements[0].branchIndices, [2]); // hinter den 2 Knoten
  assert.equal(c.branchCount, 1);
  assert.equal(c.elementOfBranch(2).name, 'V1');
});

test('innere Knoten liegen hinter den äußeren, vor den Zweigströmen', async () => {
  const { ELEMENT_TYPES } = await import('../app/js/engine/elements/index.js');
  const { Resistor } = await import('../app/js/engine/elements/resistor.js');
  class WithInternal extends Resistor {
    static type = 'TEST_INTERN';
    get internalNodes() { return ['intern']; }
  }
  ELEMENT_TYPES.set(WithInternal.type, WithInternal);
  try {
    const c = new Circuit({ elements: [...divider.elements, { type: 'TEST_INTERN', name: 'T1', nodes: ['mitte', '0'], value: 1 }] });
    assert.equal(c.externalNodeCount, 2);
    assert.deepEqual(c.nodeNames, ['oben', 'mitte', 'T1:intern']);
    assert.deepEqual(c.elements[3].internalIndices, [2]);
    assert.deepEqual(c.elements[0].branchIndices, [3]);
  } finally {
    ELEMENT_TYPES.delete(WithInternal.type);
  }
});

function assertCircuitError(netlist, pattern) {
  assert.throws(() => new Circuit(netlist), (e) => e instanceof CircuitError && pattern.test(e.message));
}

test('Fehler: leere Schaltung', () => {
  assertCircuitError({ elements: [] }, /keine Bauteile/);
});

test('Fehler: keine Masse', () => {
  assertCircuitError({ elements: [{ type: 'R', name: 'R1', nodes: ['a', 'b'], value: 1 }] }, /Massepunkt/);
});

test('Fehler: Name doppelt', () => {
  assertCircuitError({
    elements: [
      { type: 'R', name: 'R1', nodes: ['a', '0'], value: 1 },
      { type: 'R', name: 'R1', nodes: ['a', '0'], value: 2 },
    ],
  }, /mehrfach/);
});

test('Fehler: unbekannter Typ, falsche Anschlusszahl, ungültige Werte', () => {
  assertCircuitError({ elements: [{ type: 'X', name: 'X1', nodes: ['a', '0'] }] }, /Unbekannter Bauteiltyp/);
  assertCircuitError({ elements: [{ type: 'R', name: 'R1', nodes: ['a'], value: 1 }] }, /2 Anschlüsse/);
  assertCircuitError({ elements: [{ type: 'R', name: 'R1', nodes: ['a', '0'], value: 0 }] }, /größer als 0 Ω/);
  assertCircuitError({ elements: [{ type: 'V', name: 'V1', nodes: ['a', '0'] }] }, /keine Zahl/);
});
