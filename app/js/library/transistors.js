// Bauteilbibliothek: Bipolartransistoren aus dem Schulsortiment.
//
// Herkunft der Parameter (Feld source):
//   'hersteller'  – SPICE-Modell des Herstellers (Philips/NXP), aus dem Gedächtnis übernommen
//   'angepasst'   – Gummel-Poon-Parameter, an Datenblattwerte angepasst
// Beides ist bis zum Abgleich mit den Originaldateien bzw. ngspice (Phase 5) als ungeprüft zu
// betrachten. Die Tests sichern die Datenblattgrenzen ab (hFE, U_BE, U_CE,sat).
// Imax/Pmax: Grenzwerte aus dem Datenblatt (für spätere Überlastwarnungen).

export const TRANSISTORS = {
  BC547B: {
    label: 'BC547B (NPN, Kleinsignal)',
    polarity: 'npn',
    source: 'hersteller',
    datasheet: { hFE: [200, 450], at: { IC: 2e-3, UCE: 5 } },
    model: {
      IS: 2.39e-14, NF: 1.008, ISE: 3.545e-15, NE: 1.541, BF: 294.3, IKF: 0.1357, VAF: 63.2,
      NR: 1.004, ISC: 6.272e-14, NC: 1.243, BR: 7.946, IKR: 0.1144, VAR: 25.9,
      RB: 1, RE: 0.4683, RC: 0.85,
      CJE: 1.358e-11, VJE: 0.65, MJE: 0.3279, TF: 4.391e-10,
      CJC: 3.728e-12, VJC: 0.3997, MJC: 0.2955, FC: 0.9579, TR: 1e-9,
    },
    Imax: 0.1,
    Pmax: 0.5,
  },
  BC557B: {
    label: 'BC557B (PNP, Kleinsignal)',
    polarity: 'pnp',
    source: 'hersteller',
    datasheet: { hFE: [220, 475], at: { IC: 2e-3, UCE: 5 } },
    model: {
      IS: 3.834e-14, NF: 1.008, ISE: 1.219e-14, NE: 1.528, BF: 344.4, IKF: 0.08039, VAF: 21.11,
      NR: 1.005, ISC: 2.852e-13, NC: 1.28, BR: 14.84, IKR: 0.047, VAR: 32.02,
      RB: 1, RE: 0.6202, RC: 0.5713,
      CJE: 1.23e-11, VJE: 0.6106, MJE: 0.378, TF: 5.68e-10,
      CJC: 1.082e-11, VJC: 0.1022, MJC: 0.3563, FC: 0.8027, TR: 1e-9,
    },
    Imax: 0.1,
    Pmax: 0.5,
  },
  BC337: {
    label: 'BC337-40 (NPN, bis 800 mA)',
    polarity: 'npn',
    source: 'angepasst',
    datasheet: { hFE: [250, 630], at: { IC: 0.1, UCE: 1 } },
    model: {
      IS: 4.13e-14, NF: 0.9822, ISE: 3.534e-15, NE: 1.35, BF: 450, IKF: 0.9, VAF: 145.7,
      NR: 0.9932, ISC: 1.957e-13, NC: 1.1, BR: 17.28, IKR: 0.1, VAR: 8,
      RB: 5, RE: 0.1, RC: 0.3,
      CJE: 5e-11, VJE: 0.7, MJE: 0.35, TF: 6e-10,
      CJC: 1.5e-11, VJC: 0.5, MJC: 0.35, FC: 0.5, TR: 5e-8,
    },
    Imax: 0.8,
    Pmax: 0.625,
  },
  BD139: {
    label: 'BD139-16 (NPN, Leistung 1,5 A)',
    polarity: 'npn',
    source: 'angepasst',
    datasheet: { hFE: [100, 250], at: { IC: 0.15, UCE: 2 } },
    model: {
      IS: 1e-13, NF: 1, ISE: 1e-13, NE: 1.5, BF: 200, IKF: 1, VAF: 100,
      NR: 1, ISC: 1e-12, NC: 2, BR: 5, IKR: 0.5, VAR: 20,
      RB: 5, RE: 0.1, RC: 0.15,
      CJE: 1.2e-10, VJE: 0.7, MJE: 0.35, TF: 1e-9,
      CJC: 5e-11, VJC: 0.5, MJC: 0.35, FC: 0.5, TR: 1e-7,
    },
    Imax: 1.5,
    Pmax: 12.5, // mit Kühlkörper; ohne etwa 1,25 W
  },
};
