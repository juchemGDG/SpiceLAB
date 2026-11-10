// Bibliothek: Operationsverstärker an ihrer typischen Versorgung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { OPAMPS } from '../app/js/library/opamps.js';

/** Spannungsfolger an Einfachversorgung: Ausgang für den gegebenen Eingang. */
function follower(key, supplyVoltage, uin) {
  return operatingPoint({
    elements: [
      { type: 'V', name: 'VP', nodes: ['vp', '0'], value: supplyVoltage },
      { type: 'V', name: 'VIN', nodes: ['in', '0'], value: uin },
      { type: 'R', name: 'RL', nodes: ['out', '0'], value: 10e3 },
      { type: 'OPV', name: 'U1', nodes: ['in', 'out', 'out', 'vp', '0'], model: OPAMPS[key].model },
    ],
  }).potentials.out;
}

test('alle OPV folgen im mittleren Bereich genau', () => {
  assert.ok(Math.abs(follower('LM358', 5, 2) - 2) < 1e-3);
  assert.ok(Math.abs(follower('MCP6002', 3.3, 1.5) - 1.5) < 1e-3);
  assert.ok(Math.abs(follower('TL072', 30, 15) - 15) < 1e-3);
});

test('an 3,3 V: MCP6002 kommt fast bis 3,3 V, LM358 nur bis etwa 1,8 V', () => {
  const mcp = follower('MCP6002', 3.3, 3.3);
  const lm = follower('LM358', 3.3, 3.3);
  assert.ok(mcp > 3.25, `MCP6002: ${mcp} V`);
  assert.ok(lm < 1.85 && lm > 1.7, `LM358: ${lm} V`);
});

test('TL072 an 5 V Einfachversorgung: Ausgang nur zwischen etwa 1,5 V und 3,5 V', () => {
  assert.ok(follower('TL072', 5, 0.5) > 1.45);
  assert.ok(follower('TL072', 5, 4.5) < 3.55);
});
