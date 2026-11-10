// Verzeichnis aller Bauteilmodelle: Typkürzel → Klasse.
// Ein neues Bauteil braucht nur eine eigene Datei und einen Eintrag hier.
import { CircuitError } from '../errors.js';
import { Resistor } from './resistor.js';
import { VoltageSource } from './voltage-source.js';
import { CurrentSource } from './current-source.js';
import { Diode } from './diode.js';
import { Lamp } from './lamp.js';
import { Capacitor } from './capacitor.js';
import { Inductor } from './inductor.js';
import { Coupling } from './coupling.js';
import { Switch } from './switch.js';

export const ELEMENT_TYPES = new Map(
  [Resistor, VoltageSource, CurrentSource, Diode, Lamp, Capacitor, Inductor, Coupling, Switch].map((cls) => [cls.type, cls]),
);

/** Erzeugt ein Bauteil aus seiner Beschreibung { type, name, nodes, … }. */
export function createElement(spec) {
  const cls = ELEMENT_TYPES.get(spec?.type);
  if (!cls) {
    throw new CircuitError(`Unbekannter Bauteiltyp „${spec?.type}“.`,
      { elements: spec?.name ? [spec.name] : [] });
  }
  return new cls(spec);
}
