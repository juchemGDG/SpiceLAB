// Numerische Integration für Kondensatoren und Spulen (wie NIintegrate und CKTterr in ngspice).
//
// Jedes Speicherbauteil hat eine „Ladung“ q und ihre zeitliche Ableitung dq/dt:
//   Kondensator:  q = C · u     dq/dt = i
//   Spule:        q = Φ = L · i  dq/dt = u
// Zum Zeitpunkt t_n mit Schrittweite h wird dq/dt aus den q-Werten angenähert:
//   Ordnung 1, Euler rückwärts:  dq_n = (q_n − q_{n−1}) / h
//   Ordnung 2, Trapezverfahren:  dq_n = 2/h · (q_n − q_{n−1}) − dq_{n−1}
// Beides hat die Form  dq_n = ag0 · q_n + Vergangenheit  mit ag0 = 1/h bzw. 2/h.
// Der Anteil ag0 · q_n landet als Leitwert in der Matrix, die Vergangenheit als Quelle.

/** Koeffizient ag0 vor q_n. */
export function integrationCoefficient(order, h) {
  return order === 1 ? 1 / h : 2 / h;
}

const TRAP_COEFF = [0.5, 1 / 12]; // Fehlerkonstanten Euler / Trapez (ngspice: trapCoeff)

/** Verlauf von q und dq/dt eines Speicherbauteils. */
export class ChargeHistory {
  constructor() {
    this.q = new Float64Array(3); // angenommene Werte q_{n−1}, q_{n−2}, q_{n−3}
    this.dq = 0; // dq/dt zum letzten angenommenen Zeitpunkt
    this.qNow = 0; // Werte des laufenden (noch nicht angenommenen) Schritts
    this.dqNow = 0;
  }

  /** Startzustand (Arbeitspunkt oder Anfangsbedingung): q konstant, dq/dt gegeben. */
  init(q, dq = 0) {
    this.q.fill(q);
    this.dq = dq;
    this.qNow = q;
    this.dqNow = dq;
  }

  /** Vergangenheitsanteil:  dq_n = ag0 · q_n + history(). */
  history(ctx) {
    const base = -ctx.ag0 * this.q[0];
    return ctx.order === 1 ? base : base - this.dq;
  }

  /** Setzt q_n des laufenden Schritts und liefert dq_n. */
  update(qNow, ctx) {
    this.qNow = qNow;
    this.dqNow = ctx.ag0 * qNow + this.history(ctx);
    return this.dqNow;
  }

  /** Schritt angenommen: laufende Werte werden Vergangenheit. */
  accept() {
    this.q[2] = this.q[1];
    this.q[1] = this.q[0];
    this.q[0] = this.qNow;
    this.dq = this.dqNow;
  }

  /**
   * Größte Schrittweite, bei der der lokale Abschneidefehler klein genug bleibt (ngspice: CKTterr).
   * Die (Ordnung+1)-te Ableitung von q wird über dividierte Differenzen der letzten Werte geschätzt.
   * @param {object} ctx  order, deltaOld = [h_n, h_{n−1}, h_{n−2}], options (reltol, abstol, chgtol, trtol)
   */
  truncationStep(ctx) {
    const { reltol, abstol, chgtol, trtol } = ctx.options;
    const { order, deltaOld } = ctx;
    const h = deltaOld[0];

    const currentTol = abstol + reltol * Math.max(Math.abs(this.dqNow), Math.abs(this.dq));
    const chargeTol = (reltol * Math.max(Math.abs(this.qNow), Math.abs(this.q[0]), chgtol)) / h;
    const tol = Math.max(currentTol, chargeTol);

    // dividierte Differenzen über q_n, q_{n−1}, …
    const diff = [this.qNow, this.q[0], this.q[1], this.q[2]];
    const deltmp = deltaOld.slice(0, order + 1);
    for (let j = order; ; ) {
      for (let i = 0; i <= j; i++) diff[i] = (diff[i] - diff[i + 1]) / deltmp[i];
      if (--j < 0) break;
      for (let i = 0; i <= j; i++) deltmp[i] = deltmp[i + 1] + deltaOld[i];
    }

    const factor = TRAP_COEFF[order - 1];
    const del = (trtol * tol) / Math.max(abstol, factor * Math.abs(diff[0]));
    return order === 2 ? Math.sqrt(del) : del;
  }
}
