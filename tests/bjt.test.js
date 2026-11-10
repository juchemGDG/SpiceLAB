// Bipolartransistor: Ableitungen, Grundgleichungen und typische Schulschaltungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bjt } from '../app/js/engine/elements/bjt.js';
import { operatingPoint } from '../app/js/engine/dc.js';

const full = { IS: 2e-14, BF: 300, VAF: 60, IKF: 0.1, ISE: 4e-15, NE: 1.5, BR: 8, VAR: 25, IKR: 0.1, ISC: 6e-14, NC: 1.25 };

test('Ableitungen stimmen mit Differenzenquotienten überein', () => {
  const q = new Bjt({ name: 'Q1', nodes: ['c', 'b', 'e'], model: full });
  for (const [vbe, vbc] of [[0.65, -4], [0.75, 0.6], [0.4, -0.2], [0.8, -10]]) {
    const op = q.evaluate(vbe, vbc, 0);
    const h = 1e-7;
    const num = (key, dbe, dbc) => (q.evaluate(vbe + dbe, vbc + dbc, 0)[key] - q.evaluate(vbe - dbe, vbc - dbc, 0)[key]) / (2 * h);
    for (const [deriv, key, dbe, dbc] of [
      ['dicbe', 'ic', h, 0], ['dicbc', 'ic', 0, h], ['dibbe', 'ib', h, 0], ['dibbc', 'ib', 0, h],
    ]) {
      const n = num(key, dbe, dbc);
      assert.ok(Math.abs(op[deriv] - n) <= 1e-5 * Math.abs(n) + 1e-15, `${deriv} bei (${vbe}, ${vbc}): ${op[deriv]} ≠ ${n}`);
    }
  }
});

/** Emitterschaltung mit fest eingeprägtem Basisstrom und fester U_CE. */
function fixedBase(model, IB, UCE, polarity = 'npn') {
  const npn = polarity === 'npn';
  return operatingPoint({
    elements: [
      // NPN: Basisstrom in die Basis hinein, U_CE > 0; PNP: alles umgepolt
      { type: 'I', name: 'IB', nodes: npn ? ['0', 'b'] : ['b', '0'], value: IB },
      { type: 'V', name: 'VC', nodes: npn ? ['c', '0'] : ['0', 'c'], value: UCE },
      { type: 'Q', name: 'Q1', nodes: ['c', 'b', '0'], polarity, model },
    ],
  });
}

test('ideales Modell: I_C = BF · I_B', () => {
  const r = fixedBase({ IS: 1e-14, BF: 100 }, 10e-6, 5);
  assert.ok(Math.abs(r.elements.Q1.I - 1e-3) < 1e-3 * 1e-3, `I_C = ${r.elements.Q1.I}`);
  assert.ok(r.potentials.b > 0.55 && r.potentials.b < 0.75, `U_BE = ${r.potentials.b}`);
});

test('Early-Effekt: I_C wächst mit U_CE um den Faktor (1 − U_BC/VAF)', () => {
  const m = { IS: 1e-14, BF: 100, VAF: 50 };
  const a = fixedBase(m, 10e-6, 1);
  const b = fixedBase(m, 10e-6, 10);
  const vbcA = a.potentials.b - 1;
  const vbcB = b.potentials.b - 10;
  const expected = (1 - vbcB / 50) / (1 - vbcA / 50);
  assert.ok(Math.abs(b.elements.Q1.I / a.elements.Q1.I - expected) < 1e-3, `${b.elements.Q1.I / a.elements.Q1.I} ≠ ${expected}`);
});

test('PNP ist das Spiegelbild des NPN', () => {
  const m = { IS: 1e-14, BF: 150, VAF: 80 };
  const npn = fixedBase(m, 20e-6, 5, 'npn');
  const pnp = fixedBase(m, 20e-6, 5, 'pnp');
  assert.ok(Math.abs(npn.elements.Q1.I + pnp.elements.Q1.I) < 1e-9 * Math.abs(npn.elements.Q1.I) + 1e-15);
  assert.ok(Math.abs(npn.potentials.b + pnp.potentials.b) < 1e-9);
});

test('Stromverstärkung β sinkt bei sehr kleinen (ISE) und sehr großen Strömen (IKF)', () => {
  const beta = (IB) => fixedBase(full, IB, 5).elements.Q1.I / IB;
  const low = beta(1e-9);
  const mid = beta(10e-6);
  const high = beta(2e-3);
  assert.ok(mid > low && mid > high, `β: ${low.toFixed(0)} / ${mid.toFixed(0)} / ${high.toFixed(0)}`);
});

test('Transistor als Schalter: übersteuert ist U_CE klein', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'VB', nodes: ['p', '0'], value: 5 },
      { type: 'R', name: 'RB', nodes: ['p', 'b'], value: 10e3 },
      { type: 'R', name: 'RC', nodes: ['p', 'c'], value: 1e3 },
      { type: 'Q', name: 'Q1', nodes: ['c', 'b', '0'], model: full },
    ],
  });
  const uce = r.elements.Q1.U;
  assert.ok(uce > 0.02 && uce < 0.2, `U_CE,sat = ${uce}`);
  assert.ok(Math.abs(r.elements.RC.I - (5 - uce) / 1e3) < 1e-9);
});

test('Knotenregel am Transistor: I_C + I_B + I_E = 0, auch mit Bahnwiderständen', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 12 },
      { type: 'R', name: 'R1', nodes: ['p', 'b'], value: 47e3 },
      { type: 'R', name: 'R2', nodes: ['b', '0'], value: 10e3 },
      { type: 'R', name: 'RC', nodes: ['p', 'c'], value: 2.2e3 },
      { type: 'R', name: 'RE', nodes: ['e', '0'], value: 470 },
      { type: 'Q', name: 'Q1', nodes: ['c', 'b', 'e'], model: { ...full, RB: 10, RC: 1, RE: 0.5 } },
    ],
  });
  // Spannungsteiler-Arbeitspunkt: U_B ≈ 12·10/57 − Belastung, U_E ≈ U_B − 0,65 V
  assert.ok(r.potentials.e > 1 && r.potentials.e < 1.5, `U_E = ${r.potentials.e}`);
  assert.ok(Math.abs(r.elements.RC.I - r.elements.Q1.I) < 1e-9, 'Kollektorstrom = Strom durch RC');
  assert.ok(Math.abs(r.elements.RE.I - (r.elements.RC.I + (r.elements.R1.I - r.elements.R2.I))) < 1e-9, 'I_E = I_C + I_B');
});
