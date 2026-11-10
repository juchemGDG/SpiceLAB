// Solarzelle: Kennwerte, Abhängigkeit von der Bestrahlung, Punkt maximaler Leistung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { SOLAR_CELLS } from '../app/js/library/solar.js';

function withLoad(cell, R, irradiance = 1000) {
  return operatingPoint({
    elements: [
      { type: 'PV', name: 'PV1', nodes: ['p', '0'], ...cell, irradiance },
      { type: 'R', name: 'RL', nodes: ['p', '0'], value: R },
    ],
  });
}

for (const [key, cell] of Object.entries(SOLAR_CELLS)) {
  test(`${cell.label}: Leerlaufspannung und Kurzschlussstrom wie im Datenblatt`, () => {
    const uoc = withLoad(cell, 1e9).potentials.p;
    assert.ok(Math.abs(uoc - cell.openCircuitVoltage) < 1e-3 * cell.openCircuitVoltage, `${key}: U_L = ${uoc}`);
    const isc = withLoad(cell, 1e-3).elements.RL.I;
    assert.ok(Math.abs(isc - cell.shortCircuitCurrent) < 0.01 * cell.shortCircuitCurrent, `${key}: I_K = ${isc}`);
  });
}

test('halbe Bestrahlung: halber Kurzschlussstrom, Leerlaufspannung sinkt nur wenig', () => {
  const cell = SOLAR_CELLS.cell;
  const isc = withLoad(cell, 1e-3, 500).elements.RL.I;
  assert.ok(Math.abs(isc - cell.shortCircuitCurrent / 2) < 0.01 * cell.shortCircuitCurrent);
  const uoc = withLoad(cell, 1e9, 500).potentials.p;
  assert.ok(uoc < cell.openCircuitVoltage && uoc > cell.openCircuitVoltage - 0.04, `U_L = ${uoc}`);
});

test('Leistung über dem Lastwiderstand hat ein Maximum (MPP) bei 70–85 % der Leerlaufspannung', () => {
  const cell = SOLAR_CELLS.module6V;
  let best = { P: 0 };
  for (let R = 5; R <= 200; R *= 1.05) {
    const r = withLoad(cell, R);
    if (r.elements.RL.P > best.P) best = { P: r.elements.RL.P, U: r.potentials.p };
  }
  const ratio = best.U / cell.openCircuitVoltage;
  assert.ok(ratio > 0.7 && ratio < 0.85, `U_MPP/U_L = ${ratio}`);
  const fillFactor = best.P / (cell.openCircuitVoltage * cell.shortCircuitCurrent);
  assert.ok(fillFactor > 0.6 && fillFactor < 0.85, `Füllfaktor ${fillFactor}`);
  // Die Zelle gibt Energie ab: P < 0 am Bauteil
  assert.ok(withLoad(cell, 30).elements.PV1.P < 0);
});

test('ohne Licht verhält sich die Zelle wie eine Diode (kein Strom aus der Zelle)', () => {
  const r = withLoad(SOLAR_CELLS.cell, 10, 0);
  assert.ok(Math.abs(r.potentials.p) < 1e-9);
});
