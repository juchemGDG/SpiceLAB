// Bauteilbibliothek: Operationsverstärker (Kennwerte typischer Datenblattangaben).
//
// A0 Leerlaufverstärkung · GBW Verstärkungs-Bandbreite-Produkt in Hz · SR Anstiegsrate in V/s
// Rin Eingangswiderstand · Rout Ausgangswiderstand · Ilim Kurzschlussstrom
// swingHigh/swingLow: wie nah der Ausgang an V+ bzw. V− herankommt (ohne Last; unter Last kommt
//   der Spannungsabfall an Rout dazu)
// Iq Ruhestrom je Verstärker · Vos Eingangs-Offsetspannung (hier 0; real einige mV, streut je Exemplar)
// minSupply/maxSupply: zulässige Gesamtversorgung V+ − V− (für spätere Warnungen)

export const OPAMPS = {
  LM358: {
    label: 'LM358 (Standard, Eingang und Ausgang bis V−)',
    model: { A0: 1e5, GBW: 1e6, SR: 0.3e6, Rin: 2e6, Rout: 50, Ilim: 0.03, swingHigh: 1.5, swingLow: 0.01, Iq: 0.35e-3, Vos: 0 },
    minSupply: 3,
    maxSupply: 32,
  },
  TL072: {
    label: 'TL072 (FET-Eingang, schnell, ±15 V)',
    model: { A0: 2e5, GBW: 3e6, SR: 13e6, Rin: 1e12, Rout: 100, Ilim: 0.04, swingHigh: 1.5, swingLow: 1.5, Iq: 1.4e-3, Vos: 0 },
    minSupply: 7,
    maxSupply: 36,
  },
  MCP6002: {
    label: 'MCP6002 (Rail-to-Rail, für 3,3 V und 5 V)',
    // Datenblatt: V_DD − 25 mV bei 10 kΩ Last; ohne Last wenige mV (die Lastabhängigkeit liefert Rout)
    model: { A0: 4e5, GBW: 1e6, SR: 0.6e6, Rin: 1e13, Rout: 100, Ilim: 0.023, swingHigh: 0.005, swingLow: 0.005, Iq: 0.1e-3, Vos: 0 },
    minSupply: 1.8,
    maxSupply: 6,
  },
};
