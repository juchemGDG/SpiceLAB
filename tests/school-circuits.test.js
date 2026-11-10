// Schulschaltungen aus NwT und Physik mit Bauteilen aus der Bibliothek – Zusammenspiel aller Modelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { LEDS, DIODES } from '../app/js/library/diodes.js';
import { TRANSISTORS } from '../app/js/library/transistors.js';
import { MOSFETS } from '../app/js/library/mosfets.js';
import { OPAMPS } from '../app/js/library/opamps.js';
import { LDRS, NTCS } from '../app/js/library/sensors.js';
import { SOLAR_CELLS } from '../app/js/library/solar.js';
import { BATTERIES } from '../app/js/library/batteries.js';

const Q = (name, nodes, key) => ({ type: 'Q', name, nodes, polarity: TRANSISTORS[key].polarity, model: TRANSISTORS[key].model });
const LED = (name, nodes, color) => ({ type: 'D', name, nodes, model: LEDS[color].model });

test('Dämmerungsschalter (LDR, BC547B, LED an 9-V-Block): dunkel an, hell aus', () => {
  const circuit = (lux) => ({
    elements: [
      { type: 'BAT', name: 'B1', nodes: ['p', '0'], ...BATTERIES.block9V },
      { type: 'R', name: 'R1', nodes: ['p', 'b0'], value: 47e3 },
      { type: 'LDR', name: 'LDR1', nodes: ['b0', '0'], illuminance: lux, ...LDRS.GL5528 },
      { type: 'R', name: 'RB', nodes: ['b0', 'b'], value: 10e3 },
      { type: 'R', name: 'RV', nodes: ['p', 'a'], value: 330 },
      LED('LED1', ['a', 'c'], 'rot'),
      Q('Q1', ['c', 'b', '0'], 'BC547B'),
    ],
  });
  const dark = operatingPoint(circuit(1)).elements.LED1.I;
  const bright = operatingPoint(circuit(500)).elements.LED1.I;
  assert.ok(dark > 15e-3 && dark < 25e-3, `dunkel: ${dark * 1e3} mA`);
  assert.ok(bright < 0.1e-3, `hell: ${bright * 1e3} mA`);
});

test('Mikrocontroller-Pin (3,3 V) schaltet über BC547B eine LED an 5 V', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 5 },
      { type: 'V', name: 'PIN', nodes: ['pin', '0'], value: 3.3 },
      { type: 'R', name: 'RB', nodes: ['pin', 'b'], value: 1e3 },
      { type: 'R', name: 'RV', nodes: ['p', 'a'], value: 150 },
      LED('LED1', ['a', 'c'], 'gruen'),
      Q('Q1', ['c', 'b', '0'], 'BC547B'),
    ],
  });
  assert.ok(r.elements.Q1.U < 0.15, `U_CE = ${r.elements.Q1.U}`);
  const iPin = r.elements.RB.I;
  assert.ok(iPin < 3e-3, `Pinstrom ${iPin * 1e3} mA (Mikrocontroller verträgt einige mA)`);
});

test('Mikrocontroller schaltet mit IRLZ44N eine 12-V-Glühlampe', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V12', nodes: ['p', '0'], value: 12 },
      { type: 'V', name: 'PIN', nodes: ['pin', '0'], value: 5 },
      { type: 'R', name: 'RG', nodes: ['pin', 'g'], value: 220 },
      { type: 'R', name: 'RPD', nodes: ['g', '0'], value: 100e3 },
      { type: 'LAMP', name: 'H1', nodes: ['p', 'd'], ratedVoltage: 12, ratedCurrent: 0.1 },
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], polarity: 'n', model: MOSFETS.IRLZ44N.model, bodyDiode: MOSFETS.IRLZ44N.bodyDiode },
    ],
  });
  assert.ok(Math.abs(r.elements.H1.I - 0.1) < 1e-3, `Lampenstrom ${r.elements.H1.I}`);
  assert.ok(r.elements.M1.U < 0.01, `U_DS = ${r.elements.M1.U}`);
});

test('Temperaturwächter: NTC-Spannungsteiler am LM358-Komparator, LED ab etwa 40 °C', () => {
  const led = (celsius) =>
    operatingPoint({
      elements: [
        { type: 'V', name: 'VCC', nodes: ['p', '0'], value: 5 },
        { type: 'R', name: 'R1', nodes: ['p', 's'], value: 5.3e3 }, // oben fest, unten NTC → Spannung sinkt mit T
        { type: 'NTC', name: 'NTC1', nodes: ['s', '0'], temperature: celsius, ...NTCS.ntc10k },
        { type: 'R', name: 'R2', nodes: ['p', 'ref'], value: 10e3 },
        { type: 'R', name: 'R3', nodes: ['ref', '0'], value: 10e3 }, // Referenz 2,5 V
        { type: 'OPV', name: 'U1', nodes: ['ref', 's', 'out', 'p', '0'], model: OPAMPS.LM358.model },
        { type: 'R', name: 'RV', nodes: ['out', 'a'], value: 100 },
        LED('LED1', ['a', '0'], 'rot'),
      ],
    }).elements.LED1.I;
  assert.ok(led(25) < 0.1e-3, `25 °C: ${led(25) * 1e3} mA`);
  assert.ok(led(50) > 5e-3, `50 °C: ${led(50) * 1e3} mA`);
});

test('Solarmodul lädt einen Akku über eine Diode – nur bei genug Licht', () => {
  const charge = (irradiance) =>
    operatingPoint({
      elements: [
        { type: 'PV', name: 'PV1', nodes: ['s', '0'], ...SOLAR_CELLS.module6V, irradiance },
        { type: 'D', name: 'D1', nodes: ['s', 'b'], model: DIODES['1N4001'].model },
        { type: 'BAT', name: 'B1', nodes: ['b', '0'], voltage: 4.8, internalResistance: 0.2 }, // 4 NiMH-Zellen
      ],
    }).elements.B1.I; // positiv = Strom fließt in den Akku (Laden)
  assert.ok(charge(1000) > 0.1, `volle Sonne: ${charge(1000)} A`);
  assert.ok(Math.abs(charge(5)) < 1e-4, `Zimmerlicht: ${charge(5)} A (Diode verhindert Entladen)`);
});
