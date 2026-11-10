// Bibliothek: MOSFETs treffen ihren Datenblattpunkt R_DS(on); Logic-Level gegen Standard-MOSFET.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { MOSFETS } from '../app/js/library/mosfets.js';

/** Widerstand Drain–Source bei U_GS und kleinem Prüfstrom (Vorzeichen für P-Kanal umgedreht). */
function rdsOn(fet, UGS) {
  const s = fet.polarity === 'n' ? 1 : -1;
  const I = 0.01;
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'VG', nodes: ['g', '0'], value: UGS },
      { type: 'I', name: 'ID', nodes: s > 0 ? ['0', 'd'] : ['d', '0'], value: I },
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], polarity: fet.polarity, model: fet.model, bodyDiode: fet.bodyDiode },
    ],
  });
  return Math.abs(r.potentials.d) / I;
}

for (const [key, fet] of Object.entries(MOSFETS)) {
  test(`${key}: R_DS(on) bei U_GS = ${fet.datasheet.VgsOn} V wie im Datenblatt`, () => {
    const r = rdsOn(fet, fet.datasheet.VgsOn);
    assert.ok(Math.abs(r - fet.datasheet.RdsOn) < 0.01 * fet.datasheet.RdsOn, `${r} Ω statt ${fet.datasheet.RdsOn} Ω`);
  });
}

test('an 5 V (Mikrocontroller) schaltet der IRLZ44N, der IRF540N bleibt hochohmiger', () => {
  const logic = rdsOn(MOSFETS.IRLZ44N, 5);
  const standard = rdsOn(MOSFETS.IRF540N, 5);
  assert.ok(logic < 0.03, `IRLZ44N: ${logic} Ω`);
  assert.ok(standard > 2 * logic, `IRF540N: ${standard} Ω`);
});

test('Bodydiode des IRLZ44N: Flussspannung bei 1 A zwischen 0,6 und 1 V', () => {
  const r = operatingPoint({
    elements: [
      { type: 'I', name: 'IS', nodes: ['d', '0'], value: 1 }, // zieht 1 A aus dem Drain → Strom über die Bodydiode
      { type: 'M', name: 'M1', nodes: ['d', 'g', '0'], model: MOSFETS.IRLZ44N.model, bodyDiode: MOSFETS.IRLZ44N.bodyDiode },
      { type: 'R', name: 'RG', nodes: ['g', '0'], value: 10e3 },
    ],
  });
  assert.ok(-r.potentials.d > 0.6 && -r.potentials.d < 1, `U_SD = ${-r.potentials.d} V`);
});
