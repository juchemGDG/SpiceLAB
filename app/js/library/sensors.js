// Bauteilbibliothek: Widerstandssensoren und typische Umgebungswerte für die Schieberegler.

/** Fotowiderstände (Datenblattwerte: R bei 10 lx, γ zwischen 10 und 100 lx, Dunkelwiderstand). */
export const LDRS = {
  GL5528: { label: 'Fotowiderstand GL5528', r10: 10e3, gamma: 0.7, darkResistance: 1e6 },
  GL5539: { label: 'Fotowiderstand GL5539', r10: 75e3, gamma: 0.8, darkResistance: 5e6 },
};

/** Heißleiter (R25 und B-Wert aus dem Datenblatt). */
export const NTCS = {
  ntc10k: { label: 'NTC 10 kΩ (B = 3950 K)', r25: 10e3, beta: 3950 },
  ntc4k7: { label: 'NTC 4,7 kΩ (B = 3977 K)', r25: 4.7e3, beta: 3977 },
};

/** Anhaltspunkte für die Beleuchtungsstärke in lx. */
export const ILLUMINANCE_PRESETS = [
  { label: 'Nacht, Mondlicht', value: 0.3 },
  { label: 'Dämmerung', value: 10 },
  { label: 'Wohnzimmer', value: 150 },
  { label: 'Klassenzimmer', value: 500 },
  { label: 'bewölkter Tag, draußen', value: 10000 },
  { label: 'Sonne', value: 80000 },
];

/** Anhaltspunkte für die Temperatur in °C. */
export const TEMPERATURE_PRESETS = [
  { label: 'Eiswasser', value: 0 },
  { label: 'Raumtemperatur', value: 20 },
  { label: 'Körpertemperatur', value: 37 },
  { label: 'heißes Wasser', value: 80 },
];
