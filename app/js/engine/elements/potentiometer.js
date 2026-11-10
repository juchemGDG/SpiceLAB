// Potentiometer (einstellbarer Spannungsteiler) mit drei Anschlüssen.
//
//   a ──[ R·p ]── Schleifer ──[ R·(1 − p) ]── b        p = Schleiferstellung 0 … 1
//
// An den Anschlägen bleibt ein kleiner Restwiderstand (Schleiferwiderstand, Vorgabe 0,5 Ω) –
// wie beim echten Poti, und das Gleichungssystem bekommt keinen Leitwert „unendlich“.
//
// Messwerte: U zwischen a und b, I = Strom, der bei a hineinfließt.
//
// spec: { name, nodes: [a, b, schleifer], value: R in Ω, position: p (Vorgabe 0,5),
//         wiperResistance: Restwiderstand in Ω (Vorgabe 0,5) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';

export class Potentiometer extends Element {
  static type = 'POT';
  static label = 'Potentiometer';
  static terminalCount = 3;

  constructor(spec) {
    super(spec);
    const p = { position: 0.5, wiperResistance: 0.5, ...spec };
    this.resistance = this.requireNumber(p, 'value', { positive: true, label: 'Der Widerstand', unit: 'Ω' });
    this.position = this.requireNumber(p, 'position', { label: 'Die Schleiferstellung' });
    if (this.position < 0 || this.position > 1) {
      throw new CircuitError(`${this.name}: Die Schleiferstellung muss zwischen 0 und 1 liegen.`, { elements: [this.name] });
    }
    this.wiperResistance = this.requireNumber(p, 'wiperResistance', { positive: true, label: 'Der Schleiferwiderstand', unit: 'Ω' });
    this.upper = this.resistance * this.position + this.wiperResistance; // a – Schleifer
    this.lower = this.resistance * (1 - this.position) + this.wiperResistance; // Schleifer – b
  }

  stamp(system) {
    const [a, b, w] = this.nodeIndices;
    system.stampConductance(a, w, 1 / this.upper);
    system.stampConductance(w, b, 1 / this.lower);
  }

  current(x) {
    return (this.potential(x, 0) - this.potential(x, 2)) / this.upper;
  }

  /** Spannung zwischen Schleifer und b (die „abgegriffene“ Spannung). */
  wiperVoltage(x) {
    return this.potential(x, 2) - this.potential(x, 1);
  }
}
