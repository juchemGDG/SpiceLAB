// MOSFET Level 1: Ableitungen, Kennlinienbereiche, Bodydiode, P-Kanal, Schalten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mosfet } from '../app/js/engine/elements/mosfet.js';
import { operatingPoint } from '../app/js/engine/dc.js';
import { transient, valueAt } from '../app/js/engine/transient.js';

const model = { VTO: 2, KP: 0.5, LAMBDA: 0.02 };

test('Ableitungen stimmen mit Differenzenquotienten überein (alle Bereiche, beide Richtungen)', () => {
  const m = new Mosfet({ name: 'M1', nodes: ['d', 'g', 's'], model });
  const h = 1e-7;
  for (const [vgs, vds] of [[5, 1], [5, 6], [3, 0.5], [4, -0.7], [6, -3]]) {
    const op = m.evaluate(vgs, vds);
    // ∂I/∂V_G bei festem V_D, V_S entspricht ∂/∂U_GS bei festem U_DS
    const dG = (m.evaluate(vgs + h, vds).id - m.evaluate(vgs - h, vds).id) / (2 * h);
    const dD = (m.evaluate(vgs, vds + h).id - m.evaluate(vgs, vds - h).id) / (2 * h);
    assert.ok(Math.abs(op.dG - dG) < 1e-5 * Math.abs(dG) + 1e-9, `dG bei (${vgs}, ${vds}): ${op.dG} ≠ ${dG}`);
    assert.ok(Math.abs(op.dD - dD) < 1e-5 * Math.abs(dD) + 1e-9, `dD bei (${vgs}, ${vds}): ${op.dD} ≠ ${dD}`);
    assert.ok(Math.abs(op.dD + op.dG + op.dS) < 1e-12, 'Summe der Ableitungen = 0');
  }
});

function drain(UGS, UDS, extra = {}) {
  return operatingPoint({
    elements: [
      { type: 'V', name: 'VG', nodes: ['g', '0'], value: UGS },
      { type: 'V', name: 'VD', nodes: ['d', '0'], value: UDS },
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], model, ...extra },
    ],
  }).elements.M1.I;
}

test('gesperrt unterhalb der Schwelle, Sättigung K/2·U_ov²·(1+λU_DS), linearer Bereich wie ein Widerstand', () => {
  assert.ok(Math.abs(drain(1.5, 5)) < 1e-9);
  assert.ok(Math.abs(drain(4, 10) - (0.5 / 2) * 4 * 1.2) < 1e-9);
  const r = 0.01 / drain(6, 0.01); // R_DS(on) ≈ 1/(K·U_ov)
  assert.ok(Math.abs(r - 1 / (0.5 * 4)) < 0.01, `R_DS = ${r}`);
});

test('Bodydiode leitet, wenn der Drain unter die Source gezogen wird', () => {
  const i = drain(0, -1, { bodyDiode: { IS: 1e-12, N: 1.3 } });
  assert.ok(i < -0.01, `I_D = ${i}`);
  assert.ok(Math.abs(drain(0, -1)) < 1e-9, 'ohne Bodydiode sperrt der Kanal');
});

test('P-Kanal ist das Spiegelbild des N-Kanals', () => {
  const p = operatingPoint({
    elements: [
      { type: 'V', name: 'VG', nodes: ['0', 'g'], value: 4 },
      { type: 'V', name: 'VD', nodes: ['0', 'd'], value: 10 },
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], polarity: 'p', model: { ...model, VTO: -2 } },
    ],
  }).elements.M1.I;
  assert.ok(Math.abs(p + drain(4, 10)) < 1e-12);
});

test('Lampe schalten: 12 V, MOSFET mit 10 V am Gate (über 10 kΩ), Lampe bekommt fast die volle Spannung', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 12 },
      { type: 'V', name: 'VG', nodes: ['in', '0'], value: 10 },
      { type: 'R', name: 'RG', nodes: ['in', 'g'], value: 10e3 },
      { type: 'R', name: 'RPD', nodes: ['g', '0'], value: 100e3 },
      { type: 'LAMP', name: 'H1', nodes: ['p', 'd'], ratedVoltage: 12, ratedCurrent: 0.1 },
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], model: { ...model, RD: 0.1, RS: 0.05 }, bodyDiode: { IS: 1e-12 } },
    ],
  });
  assert.ok(r.elements.M1.U < 0.2, `U_DS = ${r.elements.M1.U}`);
  assert.ok(r.elements.H1.U > 11.8);
});

test('Gate-Kapazität: Einschalten über Gatewiderstand ist verzögert (τ ≈ R_G · C_iss)', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 12 },
        { type: 'V', name: 'VG', nodes: ['in', '0'], waveform: { shape: 'pulse', low: 0, high: 10, delay: 1e-6, rise: 1e-9, width: 1 } },
        { type: 'R', name: 'RG', nodes: ['in', 'g'], value: 1e3 },
        { type: 'R', name: 'RL', nodes: ['p', 'd'], value: 100 },
        { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], model: { ...model, CGS: 1e-9, CGD: 0.1e-9 } },
      ],
    },
    { stopTime: 10e-6, maxStep: 20e-9 },
  );
  const ud = (t) => valueAt(r.time, r.potentials.d, t);
  assert.ok(ud(1.1e-6) > 11, `kurz nach der Flanke noch aus: ${ud(1.1e-6)} V`);
  assert.ok(ud(8e-6) < 0.5, `nach einigen τ eingeschaltet: ${ud(8e-6)} V`);
});
