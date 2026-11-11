// Zahlen mit SI-Vorsätzen lesen und schreiben – so, wie man sie in der Schule schreibt.
//
// Lesen:     "4,7k"  "4.7 kΩ"  "4k7"  "100n"  "100 nF"  "2µ"  "2u"  "1M"  "−5 V"  "1e-3"  "0,5"
// Schreiben: 4700 → "4,7 kΩ"   0.0123 → "12,3 mA"   -5 → "−5 V"
//
// Groß-/Kleinschreibung zählt wie in der Physik: M = Mega (10⁶), m = Milli (10⁻³).
// (Anders als in SPICE, wo m und M beide Milli bedeuten und Mega „Meg“ heißt.)

const PREFIXES = { p: 1e-12, n: 1e-9, µ: 1e-6, μ: 1e-6, u: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
// Einheiten, die am Ende stehen dürfen („K“ fehlt absichtlich: 4,7K bedeutet 4,7 kΩ)
const UNIT_SUFFIX = /(Ω|Ohm|ohm|V|A|F|H|W\/m²|W|Hz|s|lx|°C|%|1\/min|N·m|Nm)$/;

/**
 * Liest eine Zahl mit optionalem SI-Vorsatz und optionaler Einheit.
 * @param {string|number} text
 * @returns {number} NaN, wenn der Text keine Zahl ist
 */
export function parseValue(text) {
  if (typeof text === 'number') return text;
  const s = String(text).replace(/[−–]/g, '-').replace(/\s/g, '').replace(UNIT_SUFFIX, '');

  // Schreibweise „4k7“ = 4,7k (Vorsatz als Komma)
  let m = /^([-+]?\d+)([pnµμumkKMG])(\d+)$/.exec(s);
  if (m) return Number(`${m[1]}.${m[3]}`) * PREFIXES[m[2]];

  m = /^([-+]?(?:\d+[.,]?\d*|[.,]\d+)(?:e[-+]?\d+)?)([pnµμumkKMG]?)$/i.exec(s);
  if (!m) return NaN;
  const prefix = m[2];
  // „e“ ist Exponent, kein Vorsatz; ein einzelnes „E“ als Vorsatz gibt es nicht
  if (prefix && !(prefix in PREFIXES)) return NaN;
  return Number(m[1].replace(',', '.')) * PREFIXES[prefix];
}

const FORMAT_STEPS = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

/**
 * Schreibt eine Zahl mit passendem SI-Vorsatz und deutschem Komma.
 * @param {number} value
 * @param {string} [unit] z. B. 'Ω', 'V', 'A'
 * @param {number} [digits] gültige Stellen (Vorgabe 3)
 */
export function formatValue(value, unit = '', digits = 3) {
  if (!Number.isFinite(value)) return '–';
  const space = unit ? ' ' : '';
  if (value === 0) return `0${space}${unit}`;
  const abs = Math.abs(value);
  let [factor, prefix] = FORMAT_STEPS.find(([f]) => abs >= f * 0.9995) ?? FORMAT_STEPS.at(-1);
  let mantissa = abs / factor;
  let text = Number(mantissa.toPrecision(digits));
  if (text >= 1000 && factor < 1e9) {
    // Rundung hat auf 1000 erhöht → nächster Vorsatz
    [factor, prefix] = FORMAT_STEPS[FORMAT_STEPS.findIndex(([f]) => f === factor) - 1];
    mantissa = abs / factor;
    text = Number(mantissa.toPrecision(digits));
  }
  const sign = value < 0 ? '−' : '';
  return `${sign}${String(text).replace('.', ',')}${space}${prefix}${unit}`;
}
