import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, formatValue } from '../app/js/ui/units.js';

const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.abs(b) + 1e-30, `${a} ≠ ${b}`);

test('Zahlen lesen: Komma, Punkt, Vorsätze, Einheiten', () => {
  const cases = {
    '4,7k': 4700, '4.7 kΩ': 4700, '4k7': 4700, '4K7': 4700, '100n': 100e-9, '100 nF': 100e-9,
    '2µ': 2e-6, '2u': 2e-6, '2 µF': 2e-6, '1M': 1e6, '1 MΩ': 1e6, '10m': 0.01, '10 mA': 0.01,
    '−5 V': -5, '-5': -5, '1e-3': 1e-3, '0,5': 0.5, ',5': 0.5, '230 V': 230, '50 Hz': 50,
    '1000 W/m²': 1000, '20 °C': 20, '3000 1/min': 3000, '1,5V': 1.5, '470µ': 470e-6, '2,2 mH': 2.2e-3,
  };
  for (const [text, value] of Object.entries(cases)) close(parseValue(text), value);
});

test('ungültige Eingaben ergeben NaN', () => {
  for (const text of ['', 'abc', '4,7x', '1,2,3', 'kΩ', '5 Ω Ω']) assert.ok(Number.isNaN(parseValue(text)), text);
});

test('Zahlen schreiben mit passendem Vorsatz und deutschem Komma', () => {
  assert.equal(formatValue(4700, 'Ω'), '4,7 kΩ');
  assert.equal(formatValue(0.0123, 'A'), '12,3 mA');
  assert.equal(formatValue(-5, 'V'), '−5 V');
  assert.equal(formatValue(0, 'V'), '0 V');
  assert.equal(formatValue(100e-9, 'F'), '100 nF');
  assert.equal(formatValue(1e6, 'Ω'), '1 MΩ');
  assert.equal(formatValue(0.6532, 'V'), '653 mV');
  assert.equal(formatValue(0.9999, 'V'), '1 V'); // Rundung auf 1000 m → nächster Vorsatz
  assert.equal(formatValue(2.5e-15, 'A'), '0,0025 pA');
  assert.equal(formatValue(1.23456, 'V', 4), '1,235 V');
});

test('Lesen und Schreiben passen zusammen', () => {
  for (const v of [4700, 0.0123, 1e-9, 2.2e6, -0.5]) close(parseValue(formatValue(v, 'Ω', 6)), Number(v.toPrecision(6)));
});
