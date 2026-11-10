// Widerstandssensoren: Fotowiderstand (LDR) und Heißleiter (NTC).
// Beide verhalten sich in der Schaltung wie ein ohmscher Widerstand; sein Wert folgt aus der
// eingestellten Beleuchtungsstärke bzw. Temperatur.

import { Resistor } from './resistor.js';
import { CircuitError } from '../errors.js';

function requirePositive(spec, key, label, unit) {
  const v = spec[key];
  if (!(typeof v === 'number' && v > 0)) {
    throw new CircuitError(`${spec.name}: ${label} muss größer als 0 ${unit} sein.`, { elements: [spec.name] });
  }
  return v;
}

/**
 * Fotowiderstand (LDR), Kennlinie nach Datenblatt:
 *   R(E) = R10 · (E / 10 lx)^(−γ)       R10 = Widerstand bei 10 lx, γ = Steigung (z. B. 0,7)
 *   Dunkelwiderstand R_dunkel parallel: Ganz ohne Licht bleibt der Widerstand endlich.
 *
 * spec: { name, nodes, illuminance: E in lx, r10: R10 in Ω, gamma: γ, darkResistance: in Ω }
 * Die Trägheit echter LDR (Zehntelsekunden bis Sekunden) ist nicht modelliert.
 */
export class Ldr extends Resistor {
  static type = 'LDR';
  static label = 'Fotowiderstand';

  static resistanceFor(spec) {
    const E = requirePositive(spec, 'illuminance', 'Die Beleuchtungsstärke', 'lx');
    const R10 = requirePositive(spec, 'r10', 'Der Widerstand bei 10 lx', 'Ω');
    const gamma = requirePositive(spec, 'gamma', 'Der Exponent γ', '');
    const Rdark = requirePositive(spec, 'darkResistance', 'Der Dunkelwiderstand', 'Ω');
    const Rlight = R10 * (E / 10) ** -gamma;
    return 1 / (1 / Rlight + 1 / Rdark);
  }

  constructor(spec) {
    super({ ...spec, value: Ldr.resistanceFor(spec) });
  }
}

/**
 * Heißleiter (NTC), B-Parameter-Gleichung nach Datenblatt:
 *   R(T) = R25 · exp(B · (1/T − 1/298,15 K))      T in Kelvin
 *
 * spec: { name, nodes, temperature: ϑ in °C, r25: R25 in Ω, beta: B in K }
 * Die Eigenerwärmung durch den Messstrom ist nicht modelliert (bei kleinen Strömen vernachlässigbar).
 */
export class Ntc extends Resistor {
  static type = 'NTC';
  static label = 'Heißleiter (NTC)';

  static resistanceFor(spec) {
    const theta = spec.temperature;
    if (!(typeof theta === 'number' && theta > -273.15)) {
      throw new CircuitError(`${spec.name}: Die Temperatur muss über −273,15 °C liegen.`, { elements: [spec.name] });
    }
    const R25 = requirePositive(spec, 'r25', 'Der Widerstand bei 25 °C', 'Ω');
    const B = requirePositive(spec, 'beta', 'Der B-Wert', 'K');
    return R25 * Math.exp(B * (1 / (theta + 273.15) - 1 / 298.15));
  }

  constructor(spec) {
    super({ ...spec, value: Ntc.resistanceFor(spec) });
  }
}
