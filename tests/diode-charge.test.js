// Diode im Zeitbereich: Sperrschicht- und Diffusionsladung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diode } from '../app/js/engine/elements/diode.js';
import { transient } from '../app/js/engine/transient.js';

const model = { IS: 2.52e-9, N: 1.752, RS: 0.568, CJO: 4e-12, M: 0.4, VJ: 0.7, TT: 20e-9 };
const diode = new Diode({ name: 'D1', nodes: ['a', '0'], model });

test('Ladung stetig bei FC·VJ, Kapazität = dq/dU', () => {
  const v0 = model.VJ * 0.5;
  const below = diode.charge(v0 - 1e-9);
  const above = diode.charge(v0 + 1e-9);
  assert.ok(Math.abs(below.q - above.q) < 1e-18, 'Ladung springt');
  assert.ok(Math.abs(below.c - above.c) < 1e-3 * below.c, 'Kapazität springt');
  for (const v of [-5, -1, 0, 0.3, 0.6, 0.7]) {
    const dv = 1e-6;
    const numeric = (diode.charge(v + dv).q - diode.charge(v - dv).q) / (2 * dv);
    const { c } = diode.charge(v);
    assert.ok(Math.abs(numeric - c) < 1e-4 * c + 1e-18, `U = ${v}: ${numeric} ≠ ${c}`);
  }
});

test('Sperrschichtkapazität: bei 0 V gleich CJO, in Sperrrichtung kleiner', () => {
  const d = new Diode({ name: 'D2', nodes: ['a', '0'], model: { CJO: 10e-12 } });
  assert.ok(Math.abs(d.charge(0).c - 10e-12) < 1e-20);
  assert.ok(d.charge(-5).c < 0.5 * 10e-12);
});

// Ladungssteuerungstheorie: Während der Speicherzeit t_s = TT·ln(1 + I_F/I_R) fließt der Rückstrom I_R;
// ein Teil der gespeicherten Ladung TT·I_F rekombiniert. Dazu kommt die Umladung der Sperrschicht.
test('Sperrverzug: Rückladung ≈ I_R·TT·ln(1 + I_F/I_R) + Sperrschichtladung', () => {
  // +5 V bis 1 µs, danach −5 V; Vorwiderstand 500 Ω → I_F ≈ 8,6 mA, Rückstrom bis ≈ 10 mA
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'pulse', low: 5, high: -5, delay: 1e-6, rise: 1e-9, fall: 1e-9, width: 1 } },
        { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 500 },
        { type: 'D', name: 'D1', nodes: ['a', '0'], model },
      ],
    },
    { stopTime: 1.5e-6, maxStep: 1e-9 },
  );
  const I = r.elements.D1.I;
  const iF = I[r.time.findIndex((t) => t > 0.9e-6)];
  // Rückstrom-Ladung nach dem Umschalten
  let charge = 0;
  for (let k = 1; k < r.time.length; k++) {
    if (r.time[k - 1] < 1e-6) continue;
    const i0 = Math.min(I[k - 1], 0);
    const i1 = Math.min(I[k], 0);
    charge -= ((i0 + i1) / 2) * (r.time[k] - r.time[k - 1]);
  }
  const uF = r.elements.D1.U[r.time.findIndex((t) => t > 0.9e-6)];
  const iR = (5 + uF - iF * model.RS) / 500; // während der Speicherzeit bleibt die Diode leitend gepolt
  const diffusion = iR * model.TT * Math.log(1 + iF / iR);
  const junctionOnly = new Diode({ name: 'DJ', nodes: ['a', '0'], model: { ...model, TT: 0 } });
  const junction = junctionOnly.charge(uF - iF * model.RS).q - junctionOnly.charge(-5).q;
  const expected = diffusion + junction;
  assert.ok(Math.min(...I) < -5e-3, `größter Rückstrom ${Math.min(...I)} A`);
  assert.ok(Math.abs(charge - expected) < 0.15 * expected, `Rückladung ${charge} C, erwartet ${expected} C`);
});

test('ohne CJO und TT ändert sich im Zeitbereich nichts am Diodenstrom', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: 5 },
        { type: 'R', name: 'R1', nodes: ['p', 'a'], value: 1000 },
        { type: 'D', name: 'D1', nodes: ['a', '0'], model: { IS: 1e-14 } },
      ],
    },
    { stopTime: 1e-3 },
  );
  const I = r.elements.D1.I;
  // konstant bis auf die Newton-Toleranz (RELTOL = 1e-3)
  assert.ok(Math.max(...I) - Math.min(...I) < 1e-3 * Math.max(...I));
});
