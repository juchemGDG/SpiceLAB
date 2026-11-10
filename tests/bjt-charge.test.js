// Transistor im Zeitbereich: Ladungen, Schaltverzögerung, Verstärkung bei hohen Frequenzen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bjt } from '../app/js/engine/elements/bjt.js';
import { transient, valueAt } from '../app/js/engine/transient.js';

const model = {
  IS: 2e-14, BF: 300, VAF: 60, IKF: 0.1, ISE: 4e-15, NE: 1.5, BR: 8, ISC: 6e-14, NC: 1.25,
  RB: 10, RC: 1, RE: 0.5, CJE: 13e-12, VJE: 0.65, MJE: 0.33, CJC: 4e-12, VJC: 0.4, MJC: 0.3, FC: 0.9,
  TF: 0.44e-9, TR: 10e-9,
};

test('Kapazitäten = Ableitungen der Ladungen (auch die Querkapazität)', () => {
  const q = new Bjt({ name: 'Q1', nodes: ['c', 'b', 'e'], model });
  const h = 1e-7;
  for (const [vbe, vbc] of [[0.6, -3], [0.7, 0.5], [-1, -5], [0.75, -0.2]]) {
    const ch = q.charges(vbe, vbc);
    const dBEdbe = (q.charges(vbe + h, vbc).qbe - q.charges(vbe - h, vbc).qbe) / (2 * h);
    const dBEdbc = (q.charges(vbe, vbc + h).qbe - q.charges(vbe, vbc - h).qbe) / (2 * h);
    const dBCdbc = (q.charges(vbe, vbc + h).qbc - q.charges(vbe, vbc - h).qbc) / (2 * h);
    for (const [a, n, label] of [[ch.cbebe, dBEdbe, 'cbebe'], [ch.cbebc, dBEdbc, 'cbebc'], [ch.cbcbc, dBCdbc, 'cbcbc']]) {
      assert.ok(Math.abs(a - n) <= 1e-4 * Math.abs(n) + 1e-17, `${label} bei (${vbe}, ${vbc}): ${a} ≠ ${n}`);
    }
  }
});

test('Transistorschalter: Ausschalten aus der Sättigung dauert (Speicherzeit), danach 5 V', () => {
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 5 },
        { type: 'V', name: 'VIN', nodes: ['in', '0'], waveform: { shape: 'pulse', low: 5, high: 0, delay: 1e-6, rise: 1e-9, fall: 1e-9, width: 1 } },
        { type: 'R', name: 'RB', nodes: ['in', 'b'], value: 10e3 },
        { type: 'R', name: 'RC', nodes: ['p', 'c'], value: 1e3 },
        { type: 'Q', name: 'Q1', nodes: ['c', 'b', '0'], model },
      ],
    },
    { stopTime: 4e-6, maxStep: 5e-9 },
  );
  const uc = (t) => valueAt(r.time, r.potentials.c, t);
  assert.ok(uc(0.9e-6) < 0.2, 'vorher gesättigt');
  assert.ok(uc(1.02e-6) < 1, `20 ns nach dem Umschalten noch leitend: ${uc(1.02e-6)} V`);
  assert.ok(uc(3.5e-6) > 4.9, `nach einigen µs gesperrt: ${uc(3.5e-6)} V`);
});

test('Emitterschaltung: Verstärkung bei 1 MHz kleiner als bei 1 kHz (Millereffekt)', () => {
  const gain = (f) => {
    const r = transient(
      {
        elements: [
          { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 12 },
          { type: 'R', name: 'R1', nodes: ['p', 'b'], value: 100e3 },
          { type: 'R', name: 'R2', nodes: ['b', '0'], value: 22e3 },
          { type: 'R', name: 'RC', nodes: ['p', 'c'], value: 4.7e3 },
          { type: 'R', name: 'RE', nodes: ['e', '0'], value: 1e3 },
          { type: 'C', name: 'CE', nodes: ['e', '0'], value: 100e-6 },
          { type: 'C', name: 'CK', nodes: ['g', 'b'], value: 10e-6 },
          { type: 'R', name: 'RG', nodes: ['in', 'g'], value: 10e3 },
          { type: 'V', name: 'VIN', nodes: ['in', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 1e-3, frequency: f } },
          { type: 'Q', name: 'Q1', nodes: ['c', 'b', 'e'], model },
        ],
      },
      { stopTime: 6 / f, maxStep: 1 / (50 * f) },
    );
    const tail = r.potentials.c.filter((_, k) => r.time[k] > 3 / f);
    return (Math.max(...tail) - Math.min(...tail)) / 2 / 1e-3;
  };
  const low = gain(1e3);
  const high = gain(1e6);
  assert.ok(low > 5, `Verstärkung 1 kHz: ${low}`);
  assert.ok(high < 0.7 * low, `Verstärkung 1 MHz: ${high} (1 kHz: ${low})`);
});
