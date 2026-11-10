// Schalter (Grundlage für Schalter und Taster).
//
// Geschlossen: kleiner Kontaktwiderstand R_ein (Vorgabe 10 mΩ).
// Offen:       sehr großer Widerstand R_aus (Vorgabe 1 GΩ) – wie Luft/Isolation.
//              Schaltet man damit eine Spule ab, entsteht wie in echt eine sehr hohe Spannung.
//              Ihr genauer Wert ist nicht aussagekräftig: In Wirklichkeit begrenzen ihn die
//              Wicklungskapazität der Spule und der Funke am Kontakt, die hier nicht modelliert sind.
//
// Zeitbereich: Der Schalter wechselt zu den Zeitpunkten in toggleTimes seinen Zustand
// (Taster: drücken und loslassen = zwei Zeitpunkte). Diese Zeitpunkte sind Haltepunkte.
// Genau zum Schaltzeitpunkt gilt noch der alte Zustand, unmittelbar danach der neue.
//
// spec: { name, nodes: [a, b], closed: Anfangszustand (Vorgabe false),
//         toggleTimes: [t1, t2, …] in s (optional), onResistance, offResistance }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';

export class Switch extends Element {
  static type = 'S';
  static label = 'Schalter';

  constructor(spec) {
    super(spec);
    const p = { closed: false, toggleTimes: [], onResistance: 0.01, offResistance: 1e9, ...spec };
    this.initiallyClosed = Boolean(p.closed);
    this.onResistance = this.requireNumber(p, 'onResistance', { positive: true, label: 'Der Widerstand im geschlossenen Zustand', unit: 'Ω' });
    this.offResistance = this.requireNumber(p, 'offResistance', { positive: true, label: 'Der Widerstand im offenen Zustand', unit: 'Ω' });
    const times = p.toggleTimes;
    if (!Array.isArray(times) || times.some((t) => !(t >= 0)) || times.some((t, i) => i > 0 && !(t > times[i - 1]))) {
      throw new CircuitError(`${this.name}: Die Schaltzeitpunkte müssen aufsteigend und nicht negativ sein.`, { elements: [this.name] });
    }
    this.toggleTimes = times;
  }

  /** Ist der Schalter zur Zeit t geschlossen? */
  isClosed(t) {
    const toggles = this.toggleTimes.filter((ts) => ts < t).length;
    return this.initiallyClosed !== (toggles % 2 === 1);
  }

  resistanceAt(t) {
    return this.isClosed(t) ? this.onResistance : this.offResistance;
  }

  nextBreakpoint(t) {
    return this.toggleTimes.find((ts) => ts > t * (1 + 1e-12) + 1e-18) ?? Infinity;
  }

  stamp(system, _x, ctx) {
    const [a, b] = this.nodeIndices;
    this.resistance = this.resistanceAt(ctx.time);
    system.stampConductance(a, b, 1 / this.resistance);
  }

  current(x) {
    return this.voltage(x) / (this.resistance ?? this.resistanceAt(0));
  }
}
