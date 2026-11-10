// Bauteilbibliothek: MOSFETs, Parameter aus Datenblattpunkten berechnet.
//
// Level 1 im linearen Bereich bei kleinem U_DS:  R_Kanal = 1 / (KP · (U_GS − U_th))
//   → KP = 1 / ((R_DS(on) − RD − RS) · (U_GS,on − U_th))
// Gate-Kapazitäten aus den Datenblattwerten Ciss = CGS + CGD und Crss = CGD.
// Werte: typische Datenblattangaben; die Schwellenspannung streut real stark (z. B. 1–2 V).

/** Rechnet Datenblattpunkte in Level-1-Parameter um. */
export function fromDatasheet({ Vth, RdsOn, VgsOn, lambda = 0.01, RD = 0, RS = 0, Ciss = 0, Crss = 0 }) {
  return {
    VTO: Vth,
    KP: 1 / ((RdsOn - RD - RS) * Math.abs(VgsOn - Vth)),
    LAMBDA: lambda,
    RD,
    RS,
    CGS: Ciss - Crss,
    CGD: Crss,
  };
}

const MOSFET_DATA = {
  BS170: {
    label: 'BS170 (N-Kanal, 60 V / 0,5 A)',
    polarity: 'n',
    datasheet: { Vth: 2.1, RdsOn: 1.2, VgsOn: 10, lambda: 0.02, RD: 0.1, RS: 0.1, Ciss: 24e-12, Crss: 5e-12 },
    bodyDiode: { IS: 1e-14, N: 1, CJO: 20e-12 },
    Imax: 0.5,
    Pmax: 0.83,
  },
  IRLZ44N: {
    label: 'IRLZ44N (N-Kanal, Logic-Level, 55 V / 47 A)',
    polarity: 'n',
    datasheet: { Vth: 1.5, RdsOn: 0.022, VgsOn: 5, RD: 0.003, RS: 0.003, Ciss: 1700e-12, Crss: 140e-12 },
    bodyDiode: { IS: 1e-11, N: 1.2, CJO: 500e-12, TT: 50e-9 },
    Imax: 47,
    Pmax: 110,
  },
  IRF540N: {
    label: 'IRF540N (N-Kanal, braucht 10 V am Gate, 100 V / 33 A)',
    polarity: 'n',
    datasheet: { Vth: 3, RdsOn: 0.044, VgsOn: 10, RD: 0.005, RS: 0.005, Ciss: 1960e-12, Crss: 40e-12 },
    bodyDiode: { IS: 1e-11, N: 1.2, CJO: 600e-12, TT: 100e-9 },
    Imax: 33,
    Pmax: 130,
  },
  IRF9540N: {
    label: 'IRF9540N (P-Kanal, −100 V / −23 A)',
    polarity: 'p',
    datasheet: { Vth: -3, RdsOn: 0.117, VgsOn: -10, RD: 0.01, RS: 0.01, Ciss: 1300e-12, Crss: 160e-12 },
    bodyDiode: { IS: 1e-11, N: 1.2, CJO: 500e-12, TT: 100e-9 },
    Imax: 23,
    Pmax: 140,
  },
};

export const MOSFETS = Object.fromEntries(
  Object.entries(MOSFET_DATA).map(([key, d]) => [key, { ...d, model: fromDatasheet(d.datasheet) }]),
);
