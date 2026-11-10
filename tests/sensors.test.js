// LDR und NTC: Kennlinien und der Spannungsteiler aus dem NwT-Unterricht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { Ldr, Ntc } from '../app/js/engine/elements/sensors.js';
import { LDRS, NTCS } from '../app/js/library/sensors.js';

const ldr = (E) => Ldr.resistanceFor({ name: 'LDR1', illuminance: E, ...LDRS.GL5528 });
const ntc = (T) => Ntc.resistanceFor({ name: 'NTC1', temperature: T, ...NTCS.ntc10k });

test('LDR: bei 10 lx der Datenblattwert, heller → kleiner, dunkel → Dunkelwiderstand', () => {
  assert.ok(Math.abs(ldr(10) - 1 / (1 / 10e3 + 1 / 1e6)) < 1e-6);
  assert.ok(Math.abs(ldr(100) / ldr(10) - 10 ** -0.7) < 0.01); // γ = 0,7 pro Dekade
  // je dunkler, desto näher am Dunkelwiderstand (nie darüber)
  assert.ok(ldr(1e-2) < ldr(1e-4) && ldr(1e-4) < ldr(1e-8) && ldr(1e-8) < 1e6 && ldr(1e-8) > 0.999e6);
});

test('NTC: R25 bei 25 °C, wird mit steigender Temperatur kleiner', () => {
  assert.ok(Math.abs(ntc(25) - 10e3) < 1e-9);
  assert.ok(ntc(0) > 30e3 && ntc(0) < 35e3, `R(0 °C) = ${ntc(0)}`); // Datenblatt ≈ 32,6 kΩ
  assert.ok(ntc(100) > 600 && ntc(100) < 750, `R(100 °C) = ${ntc(100)}`); // Datenblatt ≈ 680 Ω
});

test('Spannungsteiler mit LDR (unten) und 10 kΩ (oben): dunkel hohe, hell niedrige Spannung', () => {
  const u = (E) =>
    operatingPoint({
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: 5 },
        { type: 'R', name: 'R1', nodes: ['p', 's'], value: 10e3 },
        { type: 'LDR', name: 'LDR1', nodes: ['s', '0'], illuminance: E, ...LDRS.GL5528 },
      ],
    }).potentials.s;
  assert.ok(u(1) > 4, `dunkel: ${u(1)} V`);
  assert.ok(u(500) < 0.6, `hell: ${u(500)} V`);
});

test('Fehler bei ungültigen Umgebungswerten', () => {
  assert.throws(() => ldr(0), /Beleuchtungsstärke muss größer als 0 lx/);
  assert.throws(() => ntc(-300), /−273,15 °C/);
});
