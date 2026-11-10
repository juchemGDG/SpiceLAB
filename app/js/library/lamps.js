// Bauteilbibliothek: Glühlampen aus Schulsammlungen (Sockel E10), angegeben mit dem Aufdruck U_N / I_N.
// Das Modell (engine/elements/lamp.js) braucht nur diese beiden Werte.

export const LAMPS = {
  '3V5_0A2': { label: 'Glühlampe 3,5 V / 0,2 A', ratedVoltage: 3.5, ratedCurrent: 0.2 },
  '6V_0A1': { label: 'Glühlampe 6 V / 0,1 A', ratedVoltage: 6, ratedCurrent: 0.1 },
  '6V_0A5': { label: 'Glühlampe 6 V / 0,5 A (3 W)', ratedVoltage: 6, ratedCurrent: 0.5 },
  '12V_0A1': { label: 'Glühlampe 12 V / 0,1 A', ratedVoltage: 12, ratedCurrent: 0.1 },
};
