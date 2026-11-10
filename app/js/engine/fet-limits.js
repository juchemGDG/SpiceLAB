// Spannungsbegrenzung für Feldeffekttransistoren (wie ngspice devsup.c: DEVfetlim, DEVlimvds).
//
// Ein MOSFET hat keinen exponentiellen Strom wie ein pn-Übergang, aber eine Kennlinie mit Knick
// an der Schwellenspannung. Springt Newton weit darüber hinweg (z. B. von „aus“ nach „voll an“),
// pendelt die Iteration. Deshalb dürfen sich U_GS und U_DS je Iteration nur begrenzt ändern.

/**
 * Begrenzt die Gate-Source-Spannung (ngspice: DEVfetlim).
 * @param {number} vNew vorgeschlagene Spannung
 * @param {number} vOld Spannung der letzten Iteration
 * @param {number} vto Schwellenspannung
 */
export function fetLimit(vNew, vOld, vto) {
  const vtsthi = Math.abs(2 * (vOld - vto)) + 2;
  const vtstlo = Math.abs(vOld - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vNew - vOld;

  if (vOld >= vto) {
    if (vOld >= vtox) {
      if (delv <= 0) {
        // wird ausgeschaltet
        if (vNew >= vtox) {
          if (-delv > vtstlo) return vOld - vtstlo;
          return vNew;
        }
        return Math.max(vNew, vto + 2);
      }
      // bleibt eingeschaltet
      return delv >= vtsthi ? vOld + vtsthi : vNew;
    }
    // mittlerer Bereich
    return delv <= 0 ? Math.max(vNew, vto - 0.5) : Math.min(vNew, vto + 4);
  }
  // ausgeschaltet
  if (delv <= 0) return -delv > vtsthi ? vOld - vtsthi : vNew;
  const vtemp = vto + 0.5;
  if (vNew <= vtemp) return delv > vtstlo ? vOld + vtstlo : vNew;
  return vtemp;
}

/** Begrenzt die Drain-Source-Spannung (ngspice: DEVlimvds). */
export function limitVds(vNew, vOld) {
  if (vOld >= 3.5) {
    if (vNew > vOld) return Math.min(vNew, 3 * vOld + 2);
    if (vNew < 3.5) return Math.max(vNew, 2);
    return vNew;
  }
  return vNew > vOld ? Math.min(vNew, 4) : Math.max(vNew, -0.5);
}
