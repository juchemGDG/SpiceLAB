// Nichtlineare Bauteile im Zeitbereich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transient } from '../app/js/engine/transient.js';
import { DIODES } from '../app/js/library/diodes.js';

test('Einweggleichrichter mit Glättungskondensator: Spitzenwert und Restwelligkeit', () => {
  const [f, C, RL] = [50, 470e-6, 1000];
  const r = transient(
    {
      elements: [
        { type: 'V', name: 'V1', nodes: ['ac', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 12, frequency: f } },
        { type: 'D', name: 'D1', nodes: ['ac', 'out'], model: DIODES['1N4001'].model },
        { type: 'C', name: 'C1', nodes: ['out', '0'], value: C },
        { type: 'R', name: 'RL', nodes: ['out', '0'], value: RL },
      ],
    },
    { stopTime: 0.2, maxStep: 1e-4 },
  );
  // eingeschwungen: letzte 3 Perioden
  const out = [];
  r.time.forEach((t, k) => t > 0.14 && out.push(r.potentials.out[k]));
  const max = Math.max(...out);
  const min = Math.min(...out);
  assert.ok(max > 12 - 1.0 && max < 12 - 0.6, `Spitzenwert ${max} V`);
  const ripple = max - min;
  const estimate = max / RL / (f * C); // Lehrbuchnäherung ΔU ≈ I/(f·C)
  assert.ok(Math.abs(ripple - estimate) < 0.15 * estimate, `Welligkeit ${ripple} V, Näherung ${estimate} V`);
  // in der negativen Halbwelle sperrt die Diode; beim Abschalten fließt wegen der gespeicherten
  // Ladung (TT = 5,7 µs) kurz ein kleiner Rückstrom – wie bei einer echten 1N4001
  const maxDiodeCurrent = Math.max(...r.elements.D1.I);
  const minDiodeCurrent = Math.min(...r.elements.D1.I);
  assert.ok(minDiodeCurrent > -0.01 * maxDiodeCurrent, `Rückstrom ${minDiodeCurrent} A`);
});
