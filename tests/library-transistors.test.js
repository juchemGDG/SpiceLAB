// Bibliothek: Transistoren müssen die Datenblattgrenzen einhalten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { TRANSISTORS } from '../app/js/library/transistors.js';

/**
 * Arbeitspunkt mit eingestelltem Kollektorstrom: U_CE fest, der Basisstrom wird per
 * Intervallhalbierung (logarithmisch) gesucht, bis I_C passt. Liefert hFE und U_BE.
 */
function measure(t, IC, UCE) {
  const npn = t.polarity === 'npn';
  const run = (IB) =>
    operatingPoint({
      elements: [
        { type: 'I', name: 'IB', nodes: npn ? ['0', 'b'] : ['b', '0'], value: IB },
        { type: 'V', name: 'VC', nodes: npn ? ['c', '0'] : ['0', 'c'], value: UCE },
        { type: 'Q', name: 'Q1', nodes: ['c', 'b', '0'], polarity: t.polarity, model: t.model },
      ],
    });
  let lo = Math.log(1e-9);
  let hi = Math.log(0.1);
  let r;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    r = run(Math.exp(mid));
    if (Math.abs(r.elements.Q1.I) < IC) lo = mid;
    else hi = mid;
  }
  const IB = Math.exp((lo + hi) / 2);
  return { hFE: Math.abs(r.elements.Q1.I) / IB, UBE: Math.abs(r.potentials.b) };
}

for (const [key, t] of Object.entries(TRANSISTORS)) {
  test(`${key}: Stromverstärkung im Datenblattbereich, U_BE plausibel`, () => {
    const { hFE, UBE } = measure(t, t.datasheet.at.IC, t.datasheet.at.UCE);
    const [min, max] = t.datasheet.hFE;
    assert.ok(hFE >= min && hFE <= max, `hFE = ${hFE.toFixed(0)}, Datenblatt ${min}–${max}`);
    assert.ok(UBE > 0.55 && UBE < 0.9, `U_BE = ${UBE.toFixed(3)} V`);
  });
}

test('BC547B als Schalter (I_C = 10 mA, I_B = 0,5 mA): U_CE,sat unter 250 mV', () => {
  const r = operatingPoint({
    elements: [
      { type: 'I', name: 'IB', nodes: ['0', 'b'], value: 0.5e-3 },
      { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 10 },
      { type: 'R', name: 'RC', nodes: ['p', 'c'], value: 1e3 }, // ≈ 10 mA
      { type: 'Q', name: 'Q1', nodes: ['c', 'b', '0'], model: TRANSISTORS.BC547B.model },
    ],
  });
  assert.ok(r.elements.Q1.U < 0.25, `U_CE,sat = ${r.elements.Q1.U}`);
});
