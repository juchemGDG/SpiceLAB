// Zeitbereichsanalyse (Transient) – Ablauf wie DCtran in ngspice.
//
// 1. Startzustand
//    - normal: Arbeitspunkt bei t = 0 (Kondensatoren aufgeladen, Spulen stromdurchflossen),
//    - „mit Anfangsbedingungen“: Kondensatoren mit ihrer Anfangsspannung (Vorgabe 0 V = entladen),
//      Spulen mit ihrem Anfangsstrom (Vorgabe 0 A). Die übrigen Werte bei t = 0 liefert ein
//      Euler-Schritt mit verschwindend kleiner Schrittweite: Darin wirkt ein Kondensator wie eine
//      Spannungsquelle mit seiner Anfangsspannung und eine Spule wie eine Stromquelle.
// 2. Zeitschritte
//    - Newton-Iteration für den neuen Zeitpunkt (höchstens ITL4 Schritte); misslingt sie,
//      wird der Schritt mit h/8 und Euler wiederholt.
//    - Fehlerschätzung aller Speicherbauteile → erlaubte Schrittweite h_neu.
//      h_neu < 0,9·h: Schritt verwerfen und mit h_neu wiederholen.
//      Sonst annehmen; nächster Schritt höchstens 2·h und höchstens die größte Schrittweite.
//    - Haltepunkte (Ecken von Pulsquellen, Ende) werden genau getroffen. Danach geht es mit Euler
//      und kleinem Schritt weiter, weil sich die Kurve dort knickt.
//    - Nach dem ersten Schritt und nach jedem Haltepunkt Euler (Ordnung 1), sonst Trapez (Ordnung 2).
//      (ngspice prüft vor dem Wechsel auf Ordnung 2 zusätzlich den Fehler; hier wird immer gewechselt.)

import { Circuit } from './circuit.js';
import { CircuitError } from './errors.js';
import { MnaSystem } from './mna.js';
import { ConvergenceError, createContext, newtonSolve } from './newton.js';
import { integrationCoefficient } from './integration.js';
import { solveDc, translateError } from './dc.js';

/**
 * @param {object|Circuit} netlist
 * @param {object} settings
 * @param {number} settings.stopTime  Ende der Simulation in s
 * @param {number} [settings.step]    gewünschter Ausgabeabstand in s (Vorgabe stopTime/500)
 * @param {number} [settings.maxStep] größte Schrittweite in s (Vorgabe wie ngspice: min(step, stopTime/50))
 * @param {boolean} [settings.useInitialConditions] Start mit Anfangsbedingungen statt Arbeitspunkt
 * @returns {{
 *   time: Float64Array,
 *   potentials: Record<string, Float64Array>,
 *   elements: Record<string, {U: Float64Array, I: Float64Array}>,
 *   steps: number, rejected: number
 * }}
 */
export function transient(netlist, settings) {
  const { stopTime, step, maxStep, useInitialConditions = false, ...options } = settings ?? {};
  if (!(stopTime > 0)) throw new CircuitError('Die Simulationsdauer muss größer als 0 s sein.');
  const outStep = step > 0 ? step : stopTime / 500;

  const circuit = netlist instanceof Circuit ? netlist : new Circuit(netlist);
  const system = new MnaSystem(circuit.nodeCount, circuit.branchCount);
  const ctx = createContext(options);
  const { tranIterations } = ctx.options;

  let hMax = maxStep > 0 ? maxStep : Math.min(outStep, stopTime / 50);
  for (const el of circuit.elements) hMax = Math.min(hMax, el.maxStep());
  const hMin = 1e-11 * hMax; // ngspice: DELMIN

  // ── 1. Startzustand ──
  for (const el of circuit.elements) el.reset();
  let x;
  if (useInitialConditions) {
    for (const el of circuit.elements) el.initTransient(null, ctx, true);
    x = initialConditionSolution(circuit, system, ctx, hMin);
  } else {
    x = solveDc(circuit, system, ctx).x;
    for (const el of circuit.elements) el.initTransient(x, ctx, false);
  }

  const recorder = createRecorder(circuit);
  recorder.record(0, x);

  // ── 2. Zeitschritte ──
  ctx.mode = 'tran';
  let t = 0;
  let h = Math.min(Math.min(stopTime / 100, outStep) / 10, hMax);
  let order = 1;
  ctx.deltaOld = [h, h, h];
  let breakpoint = nextBreakpoint(circuit, 0, stopTime);
  let steps = 0;
  let rejected = 0;

  while (t < stopTime) {
    // Haltepunkt genau treffen, aber keinen winzigen Reststeg davor übriglassen
    let hitBreakpoint = false;
    const hBeforeBreakpoint = h;
    if (t + h >= breakpoint) {
      h = breakpoint - t;
      hitBreakpoint = true;
    } else if (t + 2 * h > breakpoint) {
      h = (breakpoint - t) / 2;
    }

    ctx.time = hitBreakpoint ? breakpoint : t + h;
    ctx.order = order;
    ctx.ag0 = integrationCoefficient(order, h);
    ctx.deltaOld[0] = h;

    let xNew;
    try {
      xNew = newtonSolve(circuit, system, ctx, x, tranIterations).x;
    } catch (err) {
      if (!(err instanceof ConvergenceError)) throw translateError(circuit, err);
      rejected++;
      h /= 8;
      order = 1;
      if (h < hMin) throw tooSmall(t);
      continue;
    }

    for (const el of circuit.elements) el.computeState(xNew, ctx);
    let hNew = Infinity;
    for (const el of circuit.elements) hNew = Math.min(hNew, el.truncationStep(ctx));

    if (hNew < 0.9 * h) {
      // Fehler zu groß: Schritt verwerfen
      rejected++;
      h = hNew;
      if (h < hMin) throw tooSmall(t);
      continue;
    }

    // Schritt annehmen
    t = ctx.time;
    x = xNew;
    for (const el of circuit.elements) el.acceptStep();
    recorder.record(t, x);
    steps++;
    ctx.deltaOld = [h, ctx.deltaOld[0], ctx.deltaOld[1]];

    h = Math.min(hNew, 2 * h, hMax);
    order = 2;
    if (hitBreakpoint) {
      const following = nextBreakpoint(circuit, t, stopTime);
      order = 1;
      h = Math.min(h, 0.1 * Math.min(hBeforeBreakpoint, following - t));
      breakpoint = following;
    }
  }

  return { ...recorder.result(), steps, rejected };
}

/** Werte bei t = 0 aus den Anfangsbedingungen (Euler-Schritt mit winziger Schrittweite). */
function initialConditionSolution(circuit, system, ctx, h) {
  ctx.mode = 'tran';
  ctx.time = 0;
  ctx.order = 1;
  ctx.ag0 = integrationCoefficient(1, h);
  let x;
  try {
    x = newtonSolve(circuit, system, ctx).x;
  } catch (err) {
    throw translateError(circuit, err);
  }
  // Ströme bei t = 0⁺ (z. B. Ladestrom U/R eines entladenen Kondensators) für die Ausgabe.
  // Der Zustand wird nicht angenommen: Vergangenheit bleibt die Anfangsbedingung.
  for (const el of circuit.elements) el.computeState(x, ctx);
  return x;
}

function nextBreakpoint(circuit, t, stopTime) {
  let bp = stopTime;
  for (const el of circuit.elements) bp = Math.min(bp, el.nextBreakpoint(t));
  return bp;
}

function tooSmall(t) {
  return new CircuitError(
    `Bei t = ${t.toPrecision(4)} s ändert sich die Schaltung zu abrupt – die Schrittweite wurde zu klein. ` +
      'Prüfe z. B., ob ein Schalter eine Spule ohne Freilaufdiode abschaltet.',
  );
}

/** Sammelt Zeitpunkte, Potenziale und U, I je Bauteil. */
function createRecorder(circuit) {
  const time = [];
  const nodes = circuit.nodeNames.slice(0, circuit.externalNodeCount);
  const potentials = nodes.map(() => []);
  const parts = circuit.elements.filter((el) => el.nodes.length > 0);
  const U = parts.map(() => []);
  const I = parts.map(() => []);

  return {
    record(t, x) {
      time.push(t);
      nodes.forEach((_, i) => potentials[i].push(x[i]));
      parts.forEach((el, k) => {
        U[k].push(el.voltage(x));
        I[k].push(el.current(x));
      });
    },
    result() {
      return {
        time: Float64Array.from(time),
        potentials: Object.fromEntries([['0', new Float64Array(time.length)], ...nodes.map((n, i) => [n, Float64Array.from(potentials[i])])]),
        elements: Object.fromEntries(parts.map((el, k) => [el.name, { U: Float64Array.from(U[k]), I: Float64Array.from(I[k]) }])),
      };
    },
  };
}

/** Wert einer Kurve zur Zeit t (lineare Interpolation zwischen den berechneten Punkten). */
export function valueAt(time, values, t) {
  if (t <= time[0]) return values[0];
  const last = time.length - 1;
  if (t >= time[last]) return values[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - time[lo]) / (time[hi] - time[lo]);
  return values[lo] + f * (values[hi] - values[lo]);
}
