// Operationsverstärker: Ableitungen, Grundschaltungen, reale Grenzen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpAmp } from '../app/js/engine/elements/opamp.js';
import { operatingPoint } from '../app/js/engine/dc.js';
import { transient, valueAt } from '../app/js/engine/transient.js';

// Modelle wie in der Bibliothek (dort mit Herkunft); hier fest, damit die Tests unabhängig sind
const LM358 = { A0: 1e5, GBW: 1e6, SR: 0.3e6, Rin: 2e6, Rout: 50, Ilim: 0.03, swingHigh: 1.5, swingLow: 0.01, Iq: 0.35e-3 };
const TL072 = { A0: 2e5, GBW: 3e6, SR: 13e6, Rin: 1e12, Rout: 100, Ilim: 0.04, swingHigh: 1.5, swingLow: 1.5, Iq: 1.4e-3 };

test('Ableitungen stimmen mit Differenzenquotienten überein', () => {
  const op = new OpAmp({ name: 'U1', nodes: ['p', 'n', 'o', 'vp', 'vn'], model: LM358 });
  const points = [
    [1, 1.0001, 2, 5, 0, 0.3], // linear
    [1, 0.5, 4, 5, 0, 3.5], // übersteuert, Klemme aktiv
    [0, 0, -0.5, 15, -15, -20], // Klemme unten
    [2, 2, 1, 5, 0, -2.4], // Ausgang nahe unterer Grenze
  ];
  const h = 1e-6;
  for (const v of points) {
    const { J } = op.evaluate(v);
    for (let j = 0; j < 6; j++) {
      const up = [...v];
      const dn = [...v];
      up[j] += h;
      dn[j] -= h;
      const Iu = op.evaluate(up).I;
      const Id = op.evaluate(dn).I;
      for (let k = 0; k < 6; k++) {
        const num = (Iu[k] - Id[k]) / (2 * h);
        assert.ok(Math.abs(J[k][j] - num) <= 1e-4 * Math.abs(num) + 1e-9, `J[${k}][${j}] bei ${v}: ${J[k][j]} ≠ ${num}`);
      }
    }
  }
});

const supply = (vp, vn) => [
  { type: 'V', name: 'VP', nodes: ['vp', '0'], value: vp },
  { type: 'V', name: 'VN', nodes: ['vn', '0'], value: vn },
];

test('nichtinvertierender Verstärker (V = 11) mit TL072 an ±15 V', () => {
  const r = operatingPoint({
    elements: [
      ...supply(15, -15),
      { type: 'V', name: 'VIN', nodes: ['in', '0'], value: 0.5 },
      { type: 'R', name: 'R1', nodes: ['n', '0'], value: 10e3 },
      { type: 'R', name: 'R2', nodes: ['out', 'n'], value: 100e3 },
      { type: 'OPV', name: 'U1', nodes: ['in', 'n', 'out', 'vp', 'vn'], model: TL072 },
    ],
  });
  assert.ok(Math.abs(r.potentials.out - 5.5) < 1e-3, `U_aus = ${r.potentials.out}`);
});

test('Aussteuergrenzen als Komparator: TL072 an ±15 V ≈ ±13,5 V, LM358 an 5 V nur bis ≈ 3,5 V, aber fast bis 0 V', () => {
  const comparator = (model, vp, vn, uin) => {
    const r = operatingPoint({
      elements: [
        ...supply(vp, vn),
        { type: 'V', name: 'VIN', nodes: ['in', '0'], value: uin },
        { type: 'V', name: 'VREF', nodes: ['ref', '0'], value: (vp + vn) / 2 + 0.1 },
        { type: 'R', name: 'RL', nodes: ['out', '0'], value: 10e3 },
        { type: 'OPV', name: 'U1', nodes: ['in', 'ref', 'out', 'vp', 'vn'], model },
      ],
    });
    assert.equal(r.method, 'direkt', 'Komparator konvergiert ohne Konvergenzhilfe');
    return r.potentials.out;
  };
  // Grenze 13,5 V, davon fällt am Ausgangswiderstand (100 Ω) der Anteil für 10 kΩ Last ab
  const loaded = (13.5 * 10e3) / (10e3 + 100);
  assert.ok(Math.abs(comparator(TL072, 15, -15, 1) - loaded) < 0.01);
  assert.ok(Math.abs(comparator(TL072, 15, -15, -1) + loaded) < 0.01);
  assert.ok(Math.abs(comparator(LM358, 5, 0, 3) - 3.5) < 0.05);
  assert.ok(comparator(LM358, 5, 0, 2) < 0.03);
});

test('Strombegrenzung: Kurzschluss am Ausgang liefert nur etwa I_lim', () => {
  const r = operatingPoint({
    elements: [
      ...supply(15, -15),
      { type: 'V', name: 'VIN', nodes: ['in', '0'], value: 1 },
      { type: 'R', name: 'RK', nodes: ['out', '0'], value: 0.1 },
      { type: 'OPV', name: 'U1', nodes: ['in', '0', 'out', 'vp', 'vn'], model: TL072 },
    ],
  });
  assert.ok(Math.abs(r.elements.RK.I - 0.04) < 0.002, `I_K = ${r.elements.RK.I}`);
});

test('Versorgung liefert Ruhestrom + Ausgangsstrom', () => {
  const r = operatingPoint({
    elements: [
      ...supply(15, -15),
      { type: 'V', name: 'VIN', nodes: ['in', '0'], value: 5 },
      { type: 'R', name: 'RL', nodes: ['out', '0'], value: 500 }, // 10 mA
      { type: 'OPV', name: 'U1', nodes: ['in', 'out', 'out', 'vp', 'vn'], model: TL072 },
    ],
  });
  const fromVP = -r.elements.VP.I;
  assert.ok(Math.abs(fromVP - (0.01 + 1.4e-3)) < 1e-4, `I(V+) = ${fromVP}`);
});

test('Anstiegsrate: Spannungsfolger LM358, Sprung 0 → 2 V steigt mit etwa 0,3 V/µs', () => {
  const r = transient(
    {
      elements: [
        ...supply(5, 0),
        { type: 'V', name: 'VIN', nodes: ['in', '0'], waveform: { shape: 'pulse', low: 0.5, high: 2.5, delay: 1e-6, rise: 1e-9, width: 1 } },
        { type: 'OPV', name: 'U1', nodes: ['in', 'out', 'out', 'vp', 'vn'], model: LM358 },
      ],
    },
    { stopTime: 12e-6, maxStep: 20e-9 },
  );
  const u = (t) => valueAt(r.time, r.potentials.out, t);
  const slope = (u(5e-6) - u(3e-6)) / 2e-6;
  assert.ok(Math.abs(slope - 0.3e6) < 0.03e6, `Anstieg ${slope / 1e6} V/µs`);
  assert.ok(Math.abs(u(12e-6) - 2.5) < 0.01, `Endwert ${u(12e-6)} V`);
});

test('Verstärkungs-Bandbreite-Produkt: Verstärker V = 101 hat bei 100 kHz nur noch etwa GBW/f = 10', () => {
  const amplitudeAt = (f) => {
    const r = transient(
      {
        elements: [
          ...supply(15, -15),
          { type: 'V', name: 'VIN', nodes: ['in', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 5e-3, frequency: f } },
          { type: 'R', name: 'R1', nodes: ['n', '0'], value: 1e3 },
          { type: 'R', name: 'R2', nodes: ['out', 'n'], value: 100e3 },
          { type: 'OPV', name: 'U1', nodes: ['in', 'n', 'out', 'vp', 'vn'], model: { ...TL072, GBW: 1e6 } },
        ],
      },
      { stopTime: 8 / f, maxStep: 1 / (100 * f) },
    );
    const tail = r.potentials.out.filter((_, k) => r.time[k] > 4 / f);
    return (Math.max(...tail) - Math.min(...tail)) / 2 / 5e-3;
  };
  const low = amplitudeAt(100);
  const high = amplitudeAt(100e3);
  assert.ok(Math.abs(low - 101) < 1, `V(100 Hz) = ${low}`);
  assert.ok(high > 7 && high < 13, `V(100 kHz) = ${high}`);
});
