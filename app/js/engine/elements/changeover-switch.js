// Umschalter (Wechsler) mit drei Anschlüssen: Mittelkontakt verbindet entweder mit a oder mit b.
//
//   a ──o
//         \___ m        position 'a': m–a geschlossen, m–b offen (und umgekehrt)
//   b ──o
//
// Wie beim Schalter: geschlossen R_ein (10 mΩ), offen R_aus (1 GΩ); Umschaltzeitpunkte sind Haltepunkte.
// Typischer Einsatz: Kondensator über Widerstand laden (a) und entladen (b).
//
// spec: { name, nodes: [m, a, b], position: 'a' | 'b' (Anfang, Vorgabe 'a'),
//         toggleTimes: [t1, …], onResistance, offResistance }

import { Switch } from './switch.js';
import { CircuitError } from '../errors.js';

export class ChangeoverSwitch extends Switch {
  static type = 'SPDT';
  static label = 'Umschalter';
  static terminalCount = 3;

  constructor(spec) {
    if (spec.position !== undefined && !['a', 'b'].includes(spec.position)) {
      throw new CircuitError(`${spec.name}: Die Stellung muss „a“ oder „b“ sein.`, { elements: [spec.name] });
    }
    // „geschlossen“ bedeutet hier: Mittelkontakt liegt an a
    super({ ...spec, closed: (spec.position ?? 'a') === 'a' });
  }

  stamp(system, _x, ctx) {
    const [m, a, b] = this.nodeIndices;
    const toA = this.isClosed(ctx.time);
    this.resistanceA = toA ? this.onResistance : this.offResistance;
    this.resistanceB = toA ? this.offResistance : this.onResistance;
    system.stampConductance(m, a, 1 / this.resistanceA);
    system.stampConductance(m, b, 1 / this.resistanceB);
  }

  /** Messwerte: U zwischen Mittelkontakt und a, I = Strom, der am Mittelkontakt hineinfließt. */
  current(x) {
    const ra = this.resistanceA ?? (this.isClosed(0) ? this.onResistance : this.offResistance);
    const rb = this.resistanceB ?? (this.isClosed(0) ? this.offResistance : this.onResistance);
    const vm = this.potential(x, 0);
    return (vm - this.potential(x, 1)) / ra + (vm - this.potential(x, 2)) / rb;
  }
}
