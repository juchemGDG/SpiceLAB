// Kennlinien (DC-Sweep).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dcSweep } from '../app/js/engine/sweep.js';
import { operatingPoint } from '../app/js/engine/dc.js';
import { LDRS } from '../app/js/library/sensors.js';

const range = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

test('Widerstandskennlinie ist eine Gerade durch den Ursprung', () => {
  const r = dcSweep(
    { elements: [{ type: 'V', name: 'V1', nodes: ['a', '0'], value: 0 }, { type: 'R', name: 'R1', nodes: ['a', '0'], value: 100 }] },
    { element: 'V1', values: range(-5, 5, 1) },
  );
  r.values.forEach((u, k) => assert.ok(Math.abs(r.elements.R1.I[k] - u / 100) < 1e-12));
});

test('Diodenkennlinie: jeder Punkt wie ein einzelner Arbeitspunkt', () => {
  const netlist = {
    elements: [
      { type: 'V', name: 'V1', nodes: ['q', '0'], value: 0 },
      { type: 'R', name: 'R1', nodes: ['q', 'a'], value: 100 },
      { type: 'D', name: 'D1', nodes: ['a', '0'], model: { IS: 1e-14, RS: 0.5 } },
    ],
  };
  const values = range(-2, 5, 0.25);
  const r = dcSweep(netlist, { element: 'V1', values });
  values.forEach((v, k) => {
    const single = operatingPoint({ elements: netlist.elements.map((e) => (e.name === 'V1' ? { ...e, value: v } : e)) });
    assert.ok(Math.abs(r.elements.D1.I[k] - single.elements.D1.I) <= 2e-3 * Math.abs(single.elements.D1.I) + 1e-12, `U = ${v}`);
  });
});

test('auch andere Kennwerte: Spannung am LDR-Teiler über der Beleuchtungsstärke', () => {
  const r = dcSweep(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: 5 },
        { type: 'R', name: 'R1', nodes: ['p', 's'], value: 10e3 },
        { type: 'LDR', name: 'LDR1', nodes: ['s', '0'], illuminance: 10, ...LDRS.GL5528 },
      ],
    },
    { element: 'LDR1', parameter: 'illuminance', values: [1, 10, 100, 1000] },
  );
  const u = r.potentials.s;
  assert.ok(u[0] > u[1] && u[1] > u[2] && u[2] > u[3]);
});

test('unbekanntes Bauteil wird gemeldet', () => {
  assert.throws(() => dcSweep({ elements: [] }, { element: 'V9', values: [1] }), /„V9“ gibt es nicht/);
});
