// Diode: Simulator gegen eine unabhängig gerechnete Referenz.
// Referenz: Reihenschaltung Quelle U0 – Widerstand R – Diode. Gesucht ist die Spannung U_D am
// pn-Übergang mit  U0 = U_D + I(U_D) · (R + RS). Die Gleichung wird hier per Intervallhalbierung
// gelöst – ein ganz anderes Verfahren als Newton im Simulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { thermalVoltage } from '../app/js/engine/junction.js';

const VT = thermalVoltage();

function referenceCurrent(model, vd) {
  const { IS, N = 1, BV = Infinity, IBV = 1e-3 } = model;
  const NBV = model.NBV ?? N;
  let i = IS * (Math.exp(vd / (N * VT)) - 1);
  if (Number.isFinite(BV)) i -= IBV * (Math.exp(-(vd + BV) / (NBV * VT)) - Math.exp(-BV / (NBV * VT)));
  return i;
}

/** Strom im Kreis U0 – R – Diode (Intervallhalbierung über U_D). */
function referenceSeries(model, U0, R) {
  const total = R + (model.RS ?? 0);
  let lo = -Math.abs(U0) - 1;
  let hi = Math.abs(U0) + 1;
  for (let k = 0; k < 200; k++) {
    const vd = (lo + hi) / 2;
    if (vd + referenceCurrent(model, vd) * total > U0) hi = vd;
    else lo = vd;
  }
  const vd = (lo + hi) / 2;
  return referenceCurrent(model, vd);
}

function simulate(model, U0, R) {
  return operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['q', '0'], value: U0 },
      { type: 'R', name: 'R1', nodes: ['q', 'a'], value: R },
      { type: 'D', name: 'D1', nodes: ['a', '0'], model },
    ],
  });
}

const relClose = (a, b, rel = 2e-3) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + 1e-12, `${a} ≠ ${b}`);

const SI = { IS: 2.52e-9, N: 1.752, RS: 0.568 }; // Kleinsignaldiode

test('Durchlassrichtung: 5 V, 1 kΩ', () => {
  const r = simulate(SI, 5, 1000);
  relClose(r.elements.D1.I, referenceSeries(SI, 5, 1000));
  assert.ok(r.elements.D1.U > 0.6 && r.elements.D1.U < 0.75, `U_D = ${r.elements.D1.U}`);
  assert.ok(r.iterations < 30, `${r.iterations} Iterationen`);
});

test('ohne Bahnwiderstand und bei großer Spannung (Begrenzung nötig)', () => {
  const m = { IS: 1e-14, N: 1 };
  const r = simulate(m, 100, 10);
  relClose(r.elements.D1.I, referenceSeries(m, 100, 10));
});

test('Sperrrichtung: Strom ≈ −IS', () => {
  const r = simulate(SI, -5, 1000);
  relClose(r.elements.D1.I, -SI.IS, 1e-2);
  assert.ok(Math.abs(r.elements.D1.U + 5) < 1e-3);
});

test('Z-Diode im Durchbruch: 12 V, 1 kΩ, BV = 5,1 V', () => {
  const Z = { IS: 1e-12, N: 1.5, RS: 1, BV: 5.1, IBV: 5e-3, NBV: 11 };
  const r = simulate(Z, -12, 1000); // Quelle umgepolt → Diode sperrt → Durchbruch
  relClose(r.elements.D1.I, referenceSeries(Z, -12, 1000));
  assert.ok(r.elements.D1.U < -5 && r.elements.D1.U > -5.3, `U_Z = ${r.elements.D1.U}`);
});

test('Knotenregel stimmt trotz innerem Knoten', () => {
  const r = simulate(SI, 5, 1000);
  relClose(r.elements.R1.I, r.elements.D1.I, 1e-9);
});

test('ungültige Modellparameter werden gemeldet', () => {
  assert.throws(() => simulate({ IS: 0 }, 5, 1000), /IS muss/);
  assert.throws(() => simulate({ IS: 1e-14, RS: -1 }, 5, 1000), /RS darf nicht negativ/);
});
