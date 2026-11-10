// Bauteilbibliothek: Gleichstrommotoren aus Schulbaukästen.
// Richtwerte typischer Datenblätter (Exemplare streuen deutlich, besonders der Leerlaufstrom).
// Beim Getriebemotor beziehen sich Drehzahl und Motorkonstante auf die Getriebewelle.

export const MOTORS = {
  solar: {
    label: 'Solarmotor (läuft ab etwa 0,3 V)',
    ratedVoltage: 2, noLoadSpeed: 3000, noLoadCurrent: 0.025, stallCurrent: 0.2,
    inductance: 1e-3, mechanicalTimeConstant: 0.03,
  },
  small3V: {
    label: 'Kleinmotor 3 V (Typ 130)',
    ratedVoltage: 3, noLoadSpeed: 9000, noLoadCurrent: 0.2, stallCurrent: 2.2,
    inductance: 0.5e-3, mechanicalTimeConstant: 0.02,
  },
  gear6V: {
    label: 'Getriebemotor 6 V (1:48, „TT-Motor“)',
    ratedVoltage: 6, noLoadSpeed: 200, noLoadCurrent: 0.15, stallCurrent: 1.5,
    inductance: 2e-3, mechanicalTimeConstant: 0.05,
  },
};
