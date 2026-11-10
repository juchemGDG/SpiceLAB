// Bibliothek: Die Modelle müssen die Datenblattpunkte treffen, aus denen sie entstanden sind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatingPoint } from '../app/js/engine/dc.js';
import { DIODES, LEDS, ZENERS } from '../app/js/library/diodes.js';

/** Spannung an der Diode, wenn der Strom I in Durchlassrichtung (I > 0) bzw. Sperrrichtung (I < 0) fließt. */
function voltageAtCurrent(model, I) {
  const r = operatingPoint({
    elements: [
      { type: 'I', name: 'I1', nodes: ['0', 'a'], value: I }, // speist I in die Anode ein
      { type: 'D', name: 'D1', nodes: ['a', '0'], model },
    ],
  });
  return r.elements.D1.U;
}

test('LEDs: Flussspannung bei 20 mA wie im Datenblatt', () => {
  for (const [key, led] of Object.entries(LEDS)) {
    const U = voltageAtCurrent(led.model, led.datasheet.If);
    assert.ok(Math.abs(U - led.datasheet.Vf) < 1e-3, `${key}: ${U} V statt ${led.datasheet.Vf} V`);
  }
});

test('LED rot mit 150 Ω an 5 V: etwa 20 mA (Vorwiderstand nach Lehrbuch)', () => {
  const r = operatingPoint({
    elements: [
      { type: 'V', name: 'V1', nodes: ['p', '0'], value: 5 },
      { type: 'R', name: 'RV', nodes: ['p', 'a'], value: 150 },
      { type: 'D', name: 'LED1', nodes: ['a', '0'], model: LEDS.rot.model },
    ],
  });
  const I = r.elements.LED1.I;
  assert.ok(I > 0.019 && I < 0.021, `I = ${I}`);
});

test('LED blau: an 2,6 V fließt kaum Strom, an 5 V mit 100 Ω deutlich', () => {
  const blue = (U0, R) =>
    operatingPoint({
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], value: U0 },
        { type: 'R', name: 'RV', nodes: ['p', 'a'], value: R },
        { type: 'D', name: 'LED1', nodes: ['a', '0'], model: LEDS.blau.model },
      ],
    }).elements.LED1.I;
  const low = blue(2.6, 1);
  assert.ok(low < 1e-3, `I = ${low}`);
  const high = blue(5, 100);
  assert.ok(high > 0.012 && high < 0.02, `I = ${high}`);
});

test('Z-Dioden: Z-Spannung bei 5 mA wie im Datenblatt', () => {
  for (const [key, z] of Object.entries(ZENERS)) {
    const U = voltageAtCurrent(z.model, -z.datasheet.Izt);
    assert.ok(Math.abs(-U - z.datasheet.Vz) < 1e-3, `${key}: ${-U} V statt ${z.datasheet.Vz} V`);
  }
});

test('Z-Diode 5,1 V: differentieller Widerstand ≈ Zzt', () => {
  const z = ZENERS['5V1'];
  const dI = 1e-4;
  const u1 = voltageAtCurrent(z.model, -(z.datasheet.Izt - dI / 2));
  const u2 = voltageAtCurrent(z.model, -(z.datasheet.Izt + dI / 2));
  const rz = (u1 - u2) / dI;
  assert.ok(Math.abs(rz - z.datasheet.Zzt) < 0.05 * z.datasheet.Zzt, `r_Z = ${rz} Ω`);
});

test('Dioden halten die Datenblatt-Höchstwerte der Flussspannung ein', () => {
  const u4148 = voltageAtCurrent(DIODES['1N4148'].model, 0.01);
  assert.ok(u4148 > 0.6 && u4148 <= 1.0, `1N4148 bei 10 mA: ${u4148} V`); // VF ≤ 1 V bei 10 mA
  const u4001 = voltageAtCurrent(DIODES['1N4001'].model, 1);
  assert.ok(u4001 > 0.8 && u4001 <= 1.1, `1N4001 bei 1 A: ${u4001} V`); // VF ≤ 1,1 V bei 1 A
});
