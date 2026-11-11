// Skalierung des Oszilloskops: Stufen 1-2-5 wie an einem echten Gerät, automatische Wahl.

export const DIVISIONS_X = 10;
export const DIVISIONS_Y = 8;

/** Stufen 1, 2, 5, 10, 20, 50 … zwischen min und max. */
export function steps125(min, max) {
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** e).toPrecision(3));
      if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
    }
  }
  return out;
}

export const TIME_STEPS = steps125(1e-6, 1); // 1 µs/Div … 1 s/Div
export const VOLT_STEPS = steps125(1e-3, 100); // 1 mV/Div … 100 V/Div (Netzspannung ±325 V passt noch)

/** Kleinste Stufe ≥ value (oder die größte). */
export function stepAtLeast(steps, value) {
  return steps.find((s) => s >= value * 0.999) ?? steps.at(-1);
}

/**
 * Volt/Div und Lage der Nulllinie so wählen, dass alle Kurven auf den Bildschirm passen.
 * Sind alle Werte ≥ 0, liegt die Nulllinie unten (mehr Auflösung), sonst in der Mitte.
 * @param {number} min kleinster Wert aller Kurven
 * @param {number} max größter Wert
 * @returns {{ voltsPerDiv: number, zeroDiv: number }} zeroDiv: Nulllinie in Kästchen von unten
 */
export function autoVertical(min, max) {
  if (!(Number.isFinite(min) && Number.isFinite(max))) return { voltsPerDiv: 1, zeroDiv: DIVISIONS_Y / 2 };
  if (min >= -1e-9) {
    return { voltsPerDiv: stepAtLeast(VOLT_STEPS, Math.max(max, 1e-3) / (DIVISIONS_Y - 0.5)), zeroDiv: 0 };
  }
  const half = Math.max(Math.abs(min), Math.abs(max), 1e-3);
  return { voltsPerDiv: stepAtLeast(VOLT_STEPS, half / (DIVISIONS_Y / 2 - 0.25)), zeroDiv: DIVISIONS_Y / 2 };
}

/**
 * Zeit/Div vorschlagen: bei periodischen Quellen etwa drei Perioden auf dem Bildschirm,
 * sonst 100 ms/Div (1 s – passt zu Lade- und Entladevorgängen mit Schul-Kondensatoren).
 * @param {number[]} frequencies Frequenzen der Quellen in Hz
 */
export function autoTimePerDiv(frequencies) {
  const f = Math.max(0, ...frequencies.filter((x) => x > 0));
  if (f === 0) return 0.1;
  return stepAtLeast(TIME_STEPS, 3 / f / DIVISIONS_X);
}
