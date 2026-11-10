// Kondensator: q = C · u,  i = dq/dt
//
// Arbeitspunkt: kein Strom (Kondensator ist für Gleichstrom offen). Parallel liegt nur der
//   Leckleitwert GMIN (1 pS ≙ 1 TΩ), damit ein Knoten zwischen zwei Kondensatoren bestimmt ist.
// Zeitbereich: i_n = ag0 · C · u_n + Vergangenheit  (integration.js)
//   → Leitwert ag0 · C und eine Stromquelle mit dem Vergangenheitsanteil.
//
// spec: { name, nodes: [a, b], value: C in F, ic: Anfangsspannung in V (optional, Vorgabe 0) }
// Die Anfangsspannung gilt nur, wenn die Zeitanalyse „mit Anfangsbedingungen“ startet.

import { Element } from './element.js';
import { ChargeHistory } from '../integration.js';

export class Capacitor extends Element {
  static type = 'C';
  static label = 'Kondensator';

  constructor(spec) {
    super(spec);
    this.capacitance = this.requireNumber(spec, 'value', { positive: true, label: 'Die Kapazität', unit: 'F' });
    this.initialVoltage = spec.ic === undefined ? 0 : this.requireNumber(spec, 'ic', { label: 'Die Anfangsspannung' });
    this.history = new ChargeHistory();
    this.reset();
  }

  reset() {
    this.inTransient = false;
    this.leakage = 0;
  }

  initTransient(x, _ctx, useInitialConditions) {
    const u = useInitialConditions ? this.initialVoltage : this.voltage(x);
    this.history.init(this.capacitance * u, 0); // im Arbeitspunkt fließt kein Strom
    this.inTransient = true;
  }

  stamp(system, _x, ctx) {
    const [a, b] = this.nodeIndices;
    this.leakage = ctx.options.gmin;
    system.stampConductance(a, b, this.leakage);
    if (ctx.mode !== 'tran') return;
    system.stampConductance(a, b, ctx.ag0 * this.capacitance);
    system.stampCurrentSource(a, b, this.history.history(ctx));
  }

  computeState(x, ctx) {
    this.history.update(this.capacitance * this.voltage(x), ctx);
  }

  truncationStep(ctx) {
    return this.history.truncationStep(ctx);
  }

  acceptStep() {
    this.history.accept();
  }

  current(x) {
    const leak = this.leakage * this.voltage(x);
    return this.inTransient ? this.history.dqNow + leak : leak;
  }
}
