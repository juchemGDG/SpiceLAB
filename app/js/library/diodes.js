// Bauteilbibliothek: Dioden, LEDs, Z-Dioden – nur Typen, die in Schulsammlungen üblich sind.
//
// Zwei Arten von Einträgen:
//   - fertige SPICE-Modelle (Gleichrichter- und Kleinsignaldioden, Werte aus verbreiteten Modellen),
//   - Datenblattpunkte (LEDs, Z-Dioden): Die SPICE-Parameter werden daraus berechnet. So sieht man,
//     woher die Zahlen kommen, und kann neue Typen direkt aus einem Datenblatt ergänzen.
// Imax/Pmax sind Grenzwerte aus dem Datenblatt – die Oberfläche warnt später bei Überlastung.

import { thermalVoltage } from '../engine/junction.js';

/**
 * Sättigungsstrom IS so wählen, dass die Diode beim Strom If die Spannung Vf hat.
 * Aus  Vf = If·RS + N·U_T·ln(If/IS + 1)  folgt  IS = If / (exp((Vf − If·RS)/(N·U_T)) − 1).
 */
export function fromForwardPoint({ Vf, If, N, RS }) {
  const IS = If / (Math.exp((Vf - If * RS) / (N * thermalVoltage())) - 1);
  return { IS, N, RS };
}

/**
 * Z-Diode aus Datenblattwerten: Z-Spannung Vz beim Prüfstrom Izt, differentieller Widerstand Zzt.
 * Im Durchbruch gilt näherungsweise r_Z = NBV·U_T/I + RS  →  NBV = (Zzt − RS)·Izt/U_T.
 */
export function fromZenerPoint({ Vz, Izt, Zzt, RS, forward }) {
  return {
    ...fromForwardPoint({ ...forward, RS }),
    BV: Vz - Izt * RS, // der Bahnwiderstand trägt Izt·RS zur Klemmenspannung bei
    IBV: Izt,
    NBV: ((Zzt - RS) * Izt) / thermalVoltage(),
  };
}

/** Gleichrichter- und Kleinsignaldioden (SPICE-Modelle). */
export const DIODES = {
  '1N4148': {
    label: '1N4148 (Kleinsignaldiode)',
    model: { IS: 2.52e-9, N: 1.752, RS: 0.568, BV: 100, IBV: 100e-6, CJO: 4e-12, TT: 20e-9 },
    Imax: 0.3,
    Pmax: 0.5,
  },
  '1N4001': {
    label: '1N4001 (Gleichrichterdiode 1 A)',
    model: { IS: 14.11e-9, N: 1.984, RS: 33.89e-3, BV: 75, IBV: 10e-6, CJO: 25.89e-12, TT: 5.7e-6 },
    Imax: 1,
    Pmax: 3,
  },
};

/**
 * LEDs (5 mm, Standardhelligkeit): typische Flussspannung bei 20 mA.
 * N und RS legen die Steilheit der Kennlinie fest (blaue/weiße LEDs sind flacher).
 */
const LED_DATA = {
  rot: { label: 'LED rot', color: '#dc2626', Vf: 2.0, N: 2, RS: 7 },
  gelb: { label: 'LED gelb', color: '#eab308', Vf: 2.1, N: 2, RS: 7 },
  gruen: { label: 'LED grün', color: '#16a34a', Vf: 2.2, N: 2, RS: 8 },
  blau: { label: 'LED blau', color: '#2563eb', Vf: 3.2, N: 3, RS: 10 },
  weiss: { label: 'LED weiß', color: '#e5e7eb', Vf: 3.2, N: 3, RS: 10 },
};

export const LEDS = Object.fromEntries(
  Object.entries(LED_DATA).map(([key, d]) => [
    key,
    {
      label: d.label,
      color: d.color,
      datasheet: { Vf: d.Vf, If: 0.02 },
      model: fromForwardPoint({ Vf: d.Vf, If: 0.02, N: d.N, RS: d.RS }),
      Imax: 0.03,
    },
  ]),
);

/**
 * Z-Dioden der Reihe BZX55 / ZPD (500 mW): Vz bei Izt = 5 mA, Zzt = Höchstwert aus dem Datenblatt.
 * Reale Exemplare haben oft einen kleineren differentiellen Widerstand.
 */
const ZENER_DATA = [
  // Schlüssel, Beschriftung, Vz in V, Zzt in Ω
  ['3V3', '3,3 V', 3.3, 85],
  ['4V7', '4,7 V', 4.7, 60],
  ['5V1', '5,1 V', 5.1, 35],
  ['6V2', '6,2 V', 6.2, 10],
  ['9V1', '9,1 V', 9.1, 10],
  ['12V', '12 V', 12, 20],
];
const ZENER_FORWARD = { Vf: 0.9, If: 0.1, N: 1.5 }; // Flussspannung ≤ 1 V bei 100 mA

export const ZENERS = Object.fromEntries(
  ZENER_DATA.map(([key, text, Vz, Zzt]) => [
    key,
    {
      label: `Z-Diode ${text}`,
      datasheet: { Vz, Izt: 5e-3, Zzt },
      model: fromZenerPoint({ Vz, Izt: 5e-3, Zzt, RS: 1, forward: ZENER_FORWARD }),
      Pmax: 0.5,
    },
  ]),
);
