// MOSFET (N- und P-Kanal, Anreicherungstyp) nach Level 1 (Shichman-Hodges) wie ngspice mos1.
//
// Anschlüsse: nodes = [Drain, Gate, Source]. Mit RD/RS liegen innere Knoten D', S' dahinter.
// Für P-Kanal werden alle Spannungen und Ströme umgepolt (VTO wie in SPICE negativ angeben).
//
// Drainstrom (U_ov = U_GS − U_th, K = KP mit eingerechnetem W/L):
//   gesperrt      U_ov ≤ 0:            I_D = 0
//   linear        U_DS < U_ov:         I_D = K · (U_ov − U_DS/2) · U_DS · (1 + λ·U_DS)
//   Sättigung     U_DS ≥ U_ov:         I_D = K/2 · U_ov² · (1 + λ·U_DS)
// Bei U_DS < 0 tauschen Drain und Source ihre Rollen (das Bauteil ist symmetrisch).
//
// Zusätzlich (wie bei Leistungs-MOSFETs):
//   CGS, CGD   konstante Gate-Kapazitäten (aus Ciss und Crss des Datenblatts)
//   Bodydiode  von Source nach Drain (N-Kanal), eigenes Diodenmodell
// Nicht modelliert: Substratsteuerung (Source und Substrat sind bei Einzel-MOSFETs verbunden),
// Unterschwellstrom (Level 1 sperrt unterhalb U_th schlagartig).
//
// spec: { name, nodes: [d, g, s], polarity: 'n' | 'p',
//         model: { VTO, KP, LAMBDA, RD, RS, CGS, CGD }, bodyDiode: { IS, N, … } (optional) }

import { Element } from './element.js';
import { CircuitError } from '../errors.js';
import { fetLimit, limitVds } from '../fet-limits.js';
import { ChargeHistory } from '../integration.js';
import { Diode } from './diode.js';

const at = Element.at;
const DEFAULTS = { VTO: 0, KP: 2e-5, LAMBDA: 0, RD: 0, RS: 0, CGS: 0, CGD: 0 };

export class Mosfet extends Element {
  static type = 'M';
  static label = 'MOSFET';
  static terminalCount = 3;

  constructor(spec) {
    super(spec);
    if (!['n', 'p'].includes(spec.polarity ?? 'n')) {
      throw new CircuitError(`${this.name}: Die Polarität muss „n“ oder „p“ sein.`, { elements: [this.name] });
    }
    this.polarity = spec.polarity === 'p' ? -1 : 1;
    const m = { ...DEFAULTS, ...spec.model };
    if (!(m.KP > 0)) this.#fail('KP muss größer als 0 sein');
    for (const key of ['LAMBDA', 'RD', 'RS', 'CGS', 'CGD']) if (!(m[key] >= 0)) this.#fail(`${key} darf nicht negativ sein`);
    if (typeof m.VTO !== 'number' || Number.isNaN(m.VTO)) this.#fail('VTO fehlt');
    this.model = m;
    this.vth = this.polarity * m.VTO; // Schwelle in „N-Kanal-Richtung“
    this.historyGS = new ChargeHistory();
    this.historyGD = new ChargeHistory();
    this.hasGateCharge = m.CGS > 0 || m.CGD > 0;
    // Bodydiode: N-Kanal Anode = Source, Kathode = Drain; P-Kanal umgekehrt
    this.bodyDiode = spec.bodyDiode
      ? new Diode({ name: `${this.name}:Bodydiode`, nodes: ['a', 'k'], model: { ...spec.bodyDiode, RS: 0 } })
      : null;
    this.reset();
  }

  get isNonlinear() {
    return true;
  }

  get internalNodes() {
    return [this.model.RD > 0 && 'D', this.model.RS > 0 && 'S'].filter(Boolean);
  }

  reset() {
    this.vgs = null;
    this.vds = null;
    this.op = null;
    this.inTransient = false;
    this.bodyDiode?.reset();
  }

  /** Innere Knoten [D', G, S']. */
  innerNodes() {
    const inner = this.internalNodes;
    const pick = (label, i) => (inner.includes(label) ? this.internalIndices[inner.indexOf(label)] : this.nodeIndices[i]);
    return [pick('D', 0), this.nodeIndices[1], pick('S', 2)];
  }

  /** Die Bodydiode liegt zwischen den inneren Knoten (Nummern erst nach dem Aufbau der Schaltung bekannt). */
  #syncBodyDiode() {
    const [d, , s] = this.innerNodes();
    this.bodyDiode.nodeIndices = this.polarity > 0 ? [s, d] : [d, s];
  }

  /** U_GS, U_DS (für P-Kanal umgepolt). */
  voltages(x) {
    const [d, g, s] = this.innerNodes();
    const vs = at(x, s);
    return { vgs: this.polarity * (at(x, g) - vs), vds: this.polarity * (at(x, d) - vs) };
  }

  /** Level-1-Gleichungen für U_DS ≥ 0: Strom, gm = ∂I/∂U_GS, gds = ∂I/∂U_DS. */
  channel(vgs, vds) {
    const { KP, LAMBDA } = this.model;
    const vov = vgs - this.vth;
    if (vov <= 0) return { ids: 0, gm: 0, gds: 0 };
    const clm = 1 + LAMBDA * vds; // Kanallängenmodulation
    if (vds < vov) {
      const core = (vov - vds / 2) * vds;
      return { ids: KP * core * clm, gm: KP * vds * clm, gds: KP * (vov - vds) * clm + KP * core * LAMBDA };
    }
    return { ids: (KP / 2) * vov * vov * clm, gm: KP * vov * clm, gds: (KP / 2) * vov * vov * LAMBDA };
  }

  /**
   * Drainstrom für beliebige Polung von U_DS und seine Ableitungen nach V_D, V_G, V_S
   * (in „N-Kanal-Richtung“; Strom fließt in den Drain hinein).
   */
  evaluate(vgs, vds) {
    if (vds >= 0) {
      const { ids, gm, gds } = this.channel(vgs, vds);
      return { id: ids, dD: gds, dG: gm, dS: -(gm + gds), gm, gds };
    }
    // vertauschter Betrieb: Source wirkt als Drain
    const { ids, gm, gds } = this.channel(vgs - vds, -vds);
    return { id: -ids, dD: gm + gds, dG: -gm, dS: -gds, gm, gds };
  }

  /** Neue Spannungen: Kaltstart wie ngspice (U_GS = U_th, U_DS = 0) oder begrenzt (mos1load). */
  #nextVoltages(x, ctx) {
    if (ctx.initJunctions) return { vgs: this.vth, vds: 0 };
    let { vgs, vds } = this.voltages(x);
    if (this.vgs === null) return { vgs, vds };
    let vgd = vgs - vds;
    const vgdOld = this.vgs - this.vds;
    if (this.vds >= 0) {
      vgs = fetLimit(vgs, this.vgs, this.vth);
      vds = limitVds(vgs - vgd, this.vds);
    } else {
      vgd = fetLimit(vgd, vgdOld, this.vth);
      vds = -limitVds(-(vgs - vgd), -this.vds);
      vgs = vgd + vds;
    }
    return { vgs, vds };
  }

  stamp(system, x, ctx) {
    const { RD, RS, CGS, CGD } = this.model;
    const [d, g, s] = this.innerNodes();
    const [D, , S] = this.nodeIndices;
    if (RD > 0) system.stampConductance(D, d, 1 / RD);
    if (RS > 0) system.stampConductance(S, s, 1 / RS);

    // Wie in ngspice meldet die FET-Begrenzung keine Nicht-Konvergenz; das prüfen die
    // Knotenspannungen und converged() (Stromänderung laut Tangente).
    const v = this.#nextVoltages(x, ctx);
    const op = this.evaluate(v.vgs, v.vds);
    this.vgs = v.vgs;
    this.vds = v.vds;
    this.op = op;

    // GMIN zwischen D' und S' – in ngspice über die Substrat-Übergänge (Substrat = Source).
    // Ohne ihn wäre der Drain bei gesperrtem Kanal (z. B. Kaltstart U_GS = U_th) ohne Verbindung.
    system.stampConductance(d, s, ctx.options.gmin);

    // Kanalstrom: in D' hinein, aus S' heraus; Gate führt keinen Gleichstrom
    const p = this.polarity;
    const rowD = [op.dD, op.dG, op.dS];
    const rowS = rowD.map((value) => -value);
    system.stampLinearized([d, g, s], [p * op.id, 0, -p * op.id], [rowD, [0, 0, 0], rowS], [p * v.vds, p * v.vgs, 0]);

    // Gate-Kapazitäten (linear) im Zeitbereich
    if (ctx.mode === 'tran' && this.hasGateCharge) {
      for (const [C, hist, other] of [[CGS, this.historyGS, s], [CGD, this.historyGD, d]]) {
        if (C === 0) continue;
        system.stampConductance(g, other, ctx.ag0 * C);
        system.stampCurrentSource(g, other, hist.history(ctx));
      }
    }

    if (this.bodyDiode) {
      this.#syncBodyDiode();
      this.bodyDiode.stamp(system, x, ctx);
    }
  }

  /** Konvergenzprüfung wie ngspice (MOS1convTest) plus Bodydiode. */
  converged(x, ctx) {
    const { reltol, abstol } = ctx.options;
    const { vgs, vds } = this.voltages(x);
    const { id, dG, dD } = this.op;
    // Änderung des Drainstroms laut Tangente (∂/∂U_GS = dG, ∂/∂U_DS = dD bei festem Source)
    const idHat = id + dG * (vgs - this.vgs) + dD * (vds - this.vds);
    const ok = Math.abs(idHat - id) <= reltol * Math.max(Math.abs(idHat), Math.abs(id)) + abstol;
    return ok && (!this.bodyDiode || this.bodyDiode.converged(x, ctx));
  }

  // ── Zeitbereich ──

  #gateVoltages(x) {
    const [d, g, s] = this.innerNodes();
    return { ugs: at(x, g) - at(x, s), ugd: at(x, g) - at(x, d) };
  }

  initTransient(x, ctx, useInitialConditions) {
    const { ugs, ugd } = useInitialConditions ? { ugs: 0, ugd: 0 } : this.#gateVoltages(x);
    this.historyGS.init(this.model.CGS * ugs, 0);
    this.historyGD.init(this.model.CGD * ugd, 0);
    this.inTransient = true;
    if (this.bodyDiode) {
      this.#syncBodyDiode();
      this.bodyDiode.initTransient(x, ctx, useInitialConditions);
    }
  }

  computeState(x, ctx) {
    const { ugs, ugd } = this.#gateVoltages(x);
    this.historyGS.update(this.model.CGS * ugs, ctx);
    this.historyGD.update(this.model.CGD * ugd, ctx);
    this.bodyDiode?.computeState(x, ctx);
  }

  truncationStep(ctx) {
    let h = Infinity;
    if (this.model.CGS > 0) h = Math.min(h, this.historyGS.truncationStep(ctx));
    if (this.model.CGD > 0) h = Math.min(h, this.historyGD.truncationStep(ctx));
    return Math.min(h, this.bodyDiode?.truncationStep(ctx) ?? Infinity);
  }

  acceptStep() {
    this.historyGS.accept();
    this.historyGD.accept();
    this.bodyDiode?.acceptStep();
  }

  /** Ströme in die Anschlüsse D, G, S (positiv = in den MOSFET hinein). */
  terminalCurrents(x) {
    const { vgs, vds } = this.voltages(x);
    const p = this.polarity;
    let iD = p * this.evaluate(vgs, vds).id;
    let iG = 0;
    if (this.inTransient && this.hasGateCharge) {
      iG = this.historyGS.dqNow + this.historyGD.dqNow;
      iD -= this.historyGD.dqNow;
    }
    if (this.bodyDiode) {
      const iBody = this.bodyDiode.current(x); // von Anode nach Kathode
      iD += this.polarity > 0 ? -iBody : iBody;
    }
    return { D: iD, G: iG, S: -(iD + iG) };
  }

  /** Messwerte: U = U_DS, I = Drainstrom. */
  voltage(x) {
    return this.potential(x, 0) - this.potential(x, 2);
  }

  current(x) {
    return this.terminalCurrents(x).D;
  }

  #fail(text) {
    throw new CircuitError(`${this.name}: Modellparameter ungültig – ${text}.`, { elements: [this.name] });
  }
}
