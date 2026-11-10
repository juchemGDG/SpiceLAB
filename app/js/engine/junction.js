// Hilfsfunktionen für pn-Übergänge (Diode, LED, Transistor, Solarzelle).
// Formeln wie in ngspice (devsup.c), damit das Konvergenzverhalten vergleichbar ist.

const BOLTZMANN = 1.380649e-23; // J/K
const ELEMENTARY_CHARGE = 1.602176634e-19; // C

/** Nenntemperatur der Modellparameter: 27 °C wie in SPICE (TNOM). */
export const NOMINAL_TEMPERATURE = 300.15; // K

/** Temperaturspannung U_T = k·T/q (bei 27 °C etwa 25,9 mV). */
export function thermalVoltage(temperature = NOMINAL_TEMPERATURE) {
  return (BOLTZMANN * temperature) / ELEMENTARY_CHARGE;
}

/**
 * Kritische Spannung: Oberhalb davon wächst der Diodenstrom so steil, dass die Newton-Iteration
 * die Spannung begrenzen muss. Zugleich Startwert für leitende Übergänge.
 * @param {number} nVt Emissionskoeffizient × Temperaturspannung
 * @param {number} saturationCurrent Sättigungsstrom IS
 */
export function criticalVoltage(nVt, saturationCurrent) {
  return nVt * Math.log(nVt / (Math.SQRT2 * saturationCurrent));
}

/**
 * Sperrschichtladung und -kapazität eines pn-Übergangs bei der Spannung v (Formeln wie SPICE):
 *   C = CJ / (1 − v/VJ)^M                    für v < FC·VJ
 *   darüber linear fortgesetzt (sonst ginge C bei v → VJ gegen unendlich)
 * @returns {{q: number, c: number}} Ladung in C und Kapazität dq/dv in F
 */
export function depletionCharge(v, CJ, VJ, M, FC) {
  if (!(CJ > 0)) return { q: 0, c: 0 };
  if (v < FC * VJ) {
    const arg = 1 - v / VJ;
    return { q: ((CJ * VJ) / (1 - M)) * (1 - arg ** (1 - M)), c: CJ * arg ** -M };
  }
  const F1 = (VJ / (1 - M)) * (1 - (1 - FC) ** (1 - M));
  const F2 = (1 - FC) ** (1 + M);
  const F3 = 1 - FC * (1 + M);
  const v0 = FC * VJ;
  return {
    q: CJ * (F1 + (F3 * (v - v0) + (M / (2 * VJ)) * (v * v - v0 * v0)) / F2),
    c: (CJ / F2) * (F3 + (M * v) / VJ),
  };
}

/**
 * Spannungsbegrenzung am pn-Übergang (ngspice: DEVpnjlim).
 *
 * Problem: Der Diodenstrom wächst exponentiell. Schlägt Newton eine Spannung von z. B. 5 V an einer
 * Diode vor, wäre exp(5 V / 26 mV) ≈ 10^83 – die Iteration springt hin und her oder läuft über.
 * Lösung: Oberhalb von Vcrit darf die Spannung nur „logarithmisch“ wachsen, d. h. höchstens so, dass
 * sich der Strom ungefähr verdoppelt bis vervielfacht – nicht verbilliardenfacht.
 *
 * @param {number} vNew von Newton vorgeschlagene Spannung
 * @param {number} vOld Spannung der letzten Iteration
 * @param {number} nVt Emissionskoeffizient × Temperaturspannung
 * @param {number} vCrit kritische Spannung
 * @returns {{v: number, limited: boolean}} begrenzte Spannung, und ob begrenzt wurde
 */
export function limitJunctionVoltage(vNew, vOld, nVt, vCrit) {
  if (vNew > vCrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nVt;
      return { v: arg > 0 ? vOld + nVt * Math.log(arg) : vCrit, limited: true };
    }
    return { v: nVt * Math.log(vNew / nVt), limited: true };
  }
  // In Sperrrichtung nur grobe Begrenzung (große Sprünge sind dort harmlos, aber unnötig)
  if (vNew < 0) {
    const floor = vOld > 0 ? -vOld - 1 : 2 * vOld - 1;
    if (vNew < floor) return { v: floor, limited: true };
  }
  return { v: vNew, limited: false };
}
