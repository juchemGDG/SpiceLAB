// Konvergenzhilfen: alle Strategien müssen denselben Arbeitspunkt finden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from '../app/js/engine/circuit.js';
import { MnaSystem } from '../app/js/engine/mna.js';
import { createContext } from '../app/js/engine/newton.js';
import { solveDirect, gminStepping, sourceStepping } from '../app/js/engine/op-strategies.js';
import { operatingPoint } from '../app/js/engine/dc.js';

const D = { IS: 1e-14, N: 1, RS: 0.5 };
// Brückengleichrichter an 24 V mit 100 Ω Last, dazu eine Diodenkette an 50 V über 5 Ω
const netlist = {
  elements: [
    { type: 'V', name: 'V1', nodes: ['ac1', 'ac2'], value: 24 },
    { type: 'R', name: 'RG', nodes: ['ac2', '0'], value: 1e6 }, // Bezug zur Masse
    { type: 'D', name: 'D1', nodes: ['ac1', 'p'], model: D },
    { type: 'D', name: 'D2', nodes: ['ac2', 'p'], model: D },
    { type: 'D', name: 'D3', nodes: ['m', 'ac1'], model: D },
    { type: 'D', name: 'D4', nodes: ['m', 'ac2'], model: D },
    { type: 'R', name: 'RL', nodes: ['p', 'm'], value: 100 },
    { type: 'V', name: 'V2', nodes: ['k0', '0'], value: 50 },
    { type: 'R', name: 'R5', nodes: ['k0', 'k1'], value: 5 },
    { type: 'D', name: 'D5', nodes: ['k1', 'k2'], model: D },
    { type: 'D', name: 'D6', nodes: ['k2', 'k3'], model: D },
    { type: 'D', name: 'D7', nodes: ['k3', '0'], model: D },
  ],
};

function run(strategy) {
  const circuit = new Circuit(netlist);
  const system = new MnaSystem(circuit.nodeCount, circuit.branchCount);
  for (const el of circuit.elements) el.reset();
  return strategy(circuit, system, createContext());
}

test('direkt, Gmin- und Quellen-Stepping finden dieselbe Lösung', () => {
  const ref = run(solveDirect).x;
  for (const strategy of [gminStepping, sourceStepping]) {
    const { x } = run(strategy);
    for (let i = 0; i < ref.length; i++) {
      assert.ok(Math.abs(x[i] - ref[i]) <= 1e-3 * Math.abs(ref[i]) + 1e-6,
        `${strategy.name}: x[${i}] = ${x[i]}, direkt ${ref[i]}`);
    }
  }
});

test('Brückengleichrichter: Last bekommt 24 V minus zwei Diodenspannungen', () => {
  const r = operatingPoint(netlist);
  assert.equal(r.method, 'direkt');
  const e = r.elements;
  // Maschenregel: 24 V = U_D1 + U_L + U_D4, beide Dioden leiten
  assert.ok(Math.abs(e.D1.U + e.RL.U + e.D4.U - 24) < 1e-3);
  for (const d of ['D1', 'D4']) assert.ok(e[d].U > 0.7 && e[d].U < 1.0, `U_${d} = ${e[d].U}`);
  // D2 und D3 sperren
  for (const d of ['D2', 'D3']) assert.ok(e[d].U < -20, `U_${d} = ${e[d].U}`);
});

test('scheitert der direkte Weg, springt eine Konvergenzhilfe ein', () => {
  const ref = operatingPoint(netlist);
  const r = operatingPoint(netlist, { maxIterations: 4 });
  assert.notEqual(r.method, 'direkt');
  assert.ok(Math.abs(r.potentials.p - ref.potentials.p) < 1e-3, `${r.potentials.p} ≠ ${ref.potentials.p}`);
});
