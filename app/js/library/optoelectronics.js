// Bauteilbibliothek: Fototransistor und Summer.
//
// Fototransistor: NPN-Transistor ohne Basisanschluss; das Licht erzeugt in der Basis-Kollektor-Sperrschicht
//   einen Fotostrom, den der Transistor um BF+1 verstärkt:  I_C ≈ (BF + 1) · I_ph,  I_ph ∝ Beleuchtungsstärke.
//   ic1000: Kollektorstrom bei 1000 lx. ACHTUNG: Richtwert, nicht aus dem Datenblatt abgeleitet und nicht
//   geprüft – Exemplare streuen stark (SFH 300-3 und -4 unterscheiden sich um etwa den Faktor 2).
//
// Summer: aktiver Piezosummer (hat einen eigenen Oszillator). Elektrisch fast ein Widerstand U_N/I_N;
//   er tönt bei richtiger Polung ab etwa 60 % der Nennspannung.

export const PHOTOTRANSISTORS = {
  SFH300: {
    label: 'SFH 300 (Fototransistor, 5 mm)',
    ic1000: 0.8e-3, // Richtwert
    model: { IS: 1e-14, BF: 300, NF: 1, VAF: 100, CJC: 3e-12, VJC: 0.5, MJC: 0.33, CJE: 5e-12, TF: 1e-9, TR: 1e-7 },
  },
};

/** Fotostrom je lx, damit I_C bei 1000 lx dem Richtwert entspricht. */
export const photoCurrentPerLux = (type) => PHOTOTRANSISTORS[type].ic1000 / (PHOTOTRANSISTORS[type].model.BF + 1) / 1000;

export const BUZZERS = {
  active5V: { label: 'Summer aktiv 5 V', ratedVoltage: 5, ratedCurrent: 0.03 },
  active12V: { label: 'Summer aktiv 12 V', ratedVoltage: 12, ratedCurrent: 0.02 },
};

/** Ab welchem Anteil der Nennspannung der Summer tönt. */
export const BUZZER_START_FRACTION = 0.6;
