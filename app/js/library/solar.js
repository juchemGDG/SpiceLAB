// Bauteilbibliothek: Solarzellen und kleine Solarmodule aus Schul-Experimentiersätzen.
// Leerlaufspannung und Kurzschlussstrom bei 1000 W/m² (Datenblatt, Standard-Testbedingungen).

export const SOLAR_CELLS = {
  cell: {
    label: 'Solarzelle 0,5 V / 400 mA',
    openCircuitVoltage: 0.6, shortCircuitCurrent: 0.45, cells: 1, seriesResistance: 0.05, shuntResistance: 50,
  },
  module6V: {
    label: 'Solarmodul 6 V / 1 W',
    openCircuitVoltage: 7.2, shortCircuitCurrent: 0.2, cells: 12, seriesResistance: 1.5, shuntResistance: 500,
  },
};

/** Anhaltspunkte für die Bestrahlungsstärke in W/m². */
export const IRRADIANCE_PRESETS = [
  { label: 'Sonne, klarer Himmel', value: 1000 },
  { label: 'leicht bewölkt', value: 600 },
  { label: 'bedeckt', value: 150 },
  { label: 'Schreibtischlampe (nah)', value: 50 },
  { label: 'Zimmerlicht', value: 5 },
];
