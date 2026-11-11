// Schaltzeichen (DIN EN 60617) als einfache Grundformen in Pixeln, Anschlüsse auf dem 20er-Raster.
// Die Zeichen aus SchaltLab sind unverändert übernommen, damit Schaltpläne gleich aussehen;
// neu sind Quellen, Lampe, Z-Diode, Solarzelle, LDR, NTC, Motor, Umschalter und Transformator.
//
// Grundformen:  line {x1,y1,x2,y2}  rect {x,y,w,h}  circle {cx,cy,r}  poly {pts, closed}  text {x,y,text}
// Optionen:     lw (Linienstärke), fill (ausgefüllt), dash, size/anchor (Text),
//                upright (Zeichen bleibt beim Drehen aufrecht, z. B. Sinuswelle; Texte immer)
// Anschluss:    { x, y, name, d }   d = Richtung, in die die Leitung abgeht (W, E, N, S)

const rnd = (v) => Math.round(v * 100) / 100;
const L = (x1, y1, x2, y2, o) => ({ t: 'line', x1, y1, x2, y2, ...o });
const R = (x, y, w, h, o) => ({ t: 'rect', x, y, w, h, ...o });
const C = (cx, cy, r, o) => ({ t: 'circle', cx, cy, r, ...o });
const PL = (pts, o) => ({ t: 'poly', pts, closed: false, ...o });
const PG = (pts, o) => ({ t: 'poly', pts, closed: true, ...o });
const T = (x, y, text, o) => ({ t: 'text', x, y, text, size: 14, anchor: 'middle', ...o });
const pin = (x, y, name, d) => ({ x, y, name, d });

function arrowHead(x1, y1, x2, y2, s = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const b = 0.45;
  return PG([[x2, y2], [rnd(x2 - s * Math.cos(a - b)), rnd(y2 - s * Math.sin(a - b))], [rnd(x2 - s * Math.cos(a + b)), rnd(y2 - s * Math.sin(a + b))]], { fill: 1, lw: 1 });
}
const arrow = (x1, y1, x2, y2, s) => [L(x1, y1, x2, y2, { lw: 1.5 }), arrowHead(x1, y1, x2, y2, s)];
/** Zwei Pfeile von oben links auf das Bauteil zu (Licht fällt ein). */
const lightIn = (x, y) => [...arrow(x - 22, y - 22, x - 8, y - 8, 6), ...arrow(x - 8, y - 26, x + 6, y - 12, 6)];
/** Zwei Pfeile vom Bauteil weg (Licht geht aus, LED). */
const lightOut = [...arrow(-6, -16, 5, -27, 6), ...arrow(4, -14, 15, -25, 6)];

const twoPin = [pin(-40, 0, '1', 'W'), pin(40, 0, '2', 'E')];
const resistorBody = [L(-40, 0, -30, 0), L(30, 0, 40, 0), R(-30, -10, 60, 20)];
const diodeBody = [L(-40, 0, -10, 0), L(10, 0, 40, 0), PG([[-10, -14], [-10, 14], [10, 0]]), L(10, -14, 10, 14, { lw: 2.5 })];
const circleSource = [L(-40, 0, -16, 0), L(16, 0, 40, 0), C(0, 0, 16, { lw: 2 })];
const switchBase = [L(-40, 0, -12, 0), L(12, 0, 40, 0), C(-12, 0, 2.5, { fill: 1, lw: 1 }), C(12, 0, 2.5, { fill: 1, lw: 1 })];
const opvTriangle = [PG([[-20, -40], [-20, 40], [40, 0]]), L(-40, -20, -20, -20), L(-40, 20, -20, 20),
  T(-15, -15, '−', { size: 16, anchor: 'start' }), T(-15, 25, '+', { size: 16, anchor: 'start' })];

function coilPoints(cx, cy, vertical, bumps = 3, side = 1) {
  const pts = [];
  for (let h = 0; h < bumps; h++) {
    const c = -20 + h * 20;
    for (let k = 0; k <= 12; k++) {
      const th = (Math.PI * k) / 12;
      const along = c - 10 * Math.cos(th);
      const across = -10 * Math.sin(th) * side;
      pts.push(vertical ? [rnd(cx + across), rnd(cy + along)] : [rnd(cx + along), rnd(cy + across)]);
    }
  }
  return pts;
}

export const SYMBOLS = {
  // ── Versorgung ──
  gnd: { prims: [L(0, 0, 0, 12), L(-14, 12, 14, 12, { lw: 2.5 }), L(-9, 18, 9, 18), L(-4, 24, 4, 24)], pins: [pin(0, 0, 'GND', 'N')] },
  battery: {
    // lange dünne Platte = Pluspol, kurze dicke = Minuspol
    prims: [L(-40, 0, -6, 0), L(-6, -18, -6, 18, { lw: 2 }), L(6, -9, 6, 9, { lw: 5 }), L(6, 0, 40, 0), T(-18, -12, '+', { size: 13 })],
    pins: [pin(-40, 0, '+', 'W'), pin(40, 0, '−', 'E')],
  },
  dcSource: {
    // ideale Spannungsquelle nach DIN EN 60617: Strich in Leitungsrichtung durch den Kreis
    prims: [...circleSource, L(-16, 0, 16, 0, { lw: 2 }), T(-24, -12, '+', { size: 13 }), T(24, -12, '−', { size: 13 })],
    pins: [pin(-40, 0, '+', 'W'), pin(40, 0, '−', 'E')],
  },
  acSource: {
    prims: [...circleSource, PL([[-9, 0], [-6, -5], [-3, -6], [0, -3], [0, 3], [3, 6], [6, 5], [9, 0]], { lw: 2, upright: 1 })],
    pins: [pin(-40, 0, '1', 'W'), pin(40, 0, '2', 'E')],
  },
  squareSource: {
    prims: [...circleSource, PL([[-9, 5], [-9, -5], [0, -5], [0, 5], [9, 5], [9, -5]], { lw: 2, upright: 1 })],
    pins: [pin(-40, 0, '1', 'W'), pin(40, 0, '2', 'E')],
  },
  currentSource: {
    prims: [...circleSource, ...arrow(-9, 0, 10, 0, 7)],
    pins: [pin(-40, 0, '1', 'W'), pin(40, 0, '2', 'E')], // Strom fließt im Bauteil von 1 nach 2
  },
  solar: {
    prims: [L(-40, 0, -6, 0), L(-6, -18, -6, 18, { lw: 2 }), L(6, -9, 6, 9, { lw: 5 }), L(6, 0, 40, 0),
      T(-18, 26, '+', { size: 13 }), ...lightIn(0, -14)],
    pins: [pin(-40, 0, '+', 'W'), pin(40, 0, '−', 'E')],
  },

  // ── Passive Bauteile ──
  resistor: { prims: resistorBody, pins: twoPin },
  poti: {
    prims: [...resistorBody, L(0, -40, 0, -10), arrowHead(0, -40, 0, -10, 8)],
    pins: [pin(-40, 0, 'A', 'W'), pin(40, 0, 'B', 'E'), pin(0, -40, 'S', 'N')],
  },
  ldr: { prims: [...resistorBody, ...lightIn(0, -12)], pins: twoPin },
  ntc: {
    prims: [...resistorBody, L(-22, 18, 22, -18, { lw: 1.5 }), L(22, -18, 32, -18, { lw: 1.5 }), T(-26, 30, '−ϑ', { size: 12 })],
    pins: twoPin,
  },
  capacitor: { prims: [L(-40, 0, -5, 0), L(5, 0, 40, 0), L(-5, -16, -5, 16, { lw: 3 }), L(5, -16, 5, 16, { lw: 3 })], pins: twoPin },
  elko: {
    prims: [L(-40, 0, -5, 0), L(3, 0, 40, 0), L(-5, -16, -5, 16, { lw: 3 }), R(3, -16, 6, 32, { fill: 1, lw: 1 }), T(-17, -8, '+', { size: 14 })],
    pins: [pin(-40, 0, '+', 'W'), pin(40, 0, '−', 'E')],
  },
  coil: { prims: [L(-40, 0, -30, 0), L(30, 0, 40, 0), PL(coilPoints(0, 0, false))], pins: twoPin },
  transformer: {
    // Primärspule links, Sekundärspule rechts, Eisenkern dazwischen; Punkt = Wicklungsanfang
    prims: [
      L(-40, -40, -20, -40), L(-20, -40, -20, -30), L(-20, 30, -20, 40), L(-40, 40, -20, 40), PL(coilPoints(-20, 0, true, 3, -1)),
      L(40, -40, 20, -40), L(20, -40, 20, -30), L(20, 30, 20, 40), L(40, 40, 20, 40), PL(coilPoints(20, 0, true, 3, 1)),
      L(-3, -32, -3, 32, { lw: 2 }), L(3, -32, 3, 32, { lw: 2 }),
      C(-34, -30, 2.5, { fill: 1, lw: 1 }), C(34, -30, 2.5, { fill: 1, lw: 1 }),
    ],
    pins: [pin(-40, -40, 'P1', 'W'), pin(-40, 40, 'P2', 'W'), pin(40, -40, 'S1', 'E'), pin(40, 40, 'S2', 'E')],
  },
  lamp: {
    prims: [L(-40, 0, -14, 0), L(14, 0, 40, 0), C(0, 0, 14, { lw: 2 }), L(-9.9, -9.9, 9.9, 9.9), L(-9.9, 9.9, 9.9, -9.9)],
    pins: twoPin,
  },
  motor: {
    prims: [L(-40, 0, -16, 0), L(16, 0, 40, 0), C(0, 0, 16, { lw: 2 }), T(0, 5, 'M', { size: 15, weight: 'bold', upright: 1 }), L(-5, 10, 5, 10, { lw: 1.2, upright: 1 })],
    pins: [pin(-40, 0, '+', 'W'), pin(40, 0, '−', 'E')],
  },

  // ── Halbleiter ──
  diode: { prims: diodeBody, pins: [pin(-40, 0, 'A', 'W'), pin(40, 0, 'K', 'E')] },
  zdiode: {
    prims: [L(-40, 0, -10, 0), L(10, 0, 40, 0), PG([[-10, -14], [-10, 14], [10, 0]]), PL([[4, -18], [10, -14], [10, 14], [16, 18]], { lw: 2.5 })],
    pins: [pin(-40, 0, 'A', 'W'), pin(40, 0, 'K', 'E')],
  },
  led: { prims: [...diodeBody, ...lightOut], pins: [pin(-40, 0, 'A', 'W'), pin(40, 0, 'K', 'E')] },
  npn: {
    prims: [C(7, 0, 29, { lw: 1.5 }), L(-40, 0, -6, 0), L(-6, -20, -6, 20, { lw: 3 }),
      L(-6, -8, 20, -24), L(20, -24, 20, -40), L(-6, 8, 20, 24), L(20, 24, 20, 40), arrowHead(-6, 8, 16.1, 21.6, 8)],
    pins: [pin(-40, 0, 'B', 'W'), pin(20, -40, 'C', 'N'), pin(20, 40, 'E', 'S')],
  },
  pnp: {
    prims: [C(7, 0, 29, { lw: 1.5 }), L(-40, 0, -6, 0), L(-6, -20, -6, 20, { lw: 3 }),
      L(-6, 8, 20, 24), L(20, 24, 20, 40), L(-6, -8, 20, -24), L(20, -24, 20, -40), arrowHead(20, -24, 0.5, -12, 8)],
    pins: [pin(-40, 0, 'B', 'W'), pin(20, 40, 'C', 'S'), pin(20, -40, 'E', 'N')],
  },
  nmos: {
    prims: [L(-40, 0, -14, 0), L(-14, -16, -14, 16, { lw: 3 }),
      L(-6, -22, -6, -12, { lw: 3 }), L(-6, -6, -6, 6, { lw: 3 }), L(-6, 12, -6, 22, { lw: 3 }),
      L(-6, -17, 20, -17), L(20, -17, 20, -40), L(-6, 17, 20, 17), L(20, 17, 20, 40),
      L(-4, 0, 20, 0), L(20, 0, 20, 17), arrowHead(20, 0, -4, 0, 7), C(20, 17, 2.5, { fill: 1, lw: 1 })],
    pins: [pin(-40, 0, 'G', 'W'), pin(20, -40, 'D', 'N'), pin(20, 40, 'S', 'S')],
  },
  pmos: {
    prims: [L(-40, 0, -14, 0), L(-14, -16, -14, 16, { lw: 3 }),
      L(-6, -22, -6, -12, { lw: 3 }), L(-6, -6, -6, 6, { lw: 3 }), L(-6, 12, -6, 22, { lw: 3 }),
      L(-6, -17, 20, -17), L(20, -17, 20, -40), L(-6, 17, 20, 17), L(20, 17, 20, 40),
      L(-6, 0, 20, 0), L(20, 0, 20, -17), arrowHead(-6, 0, 16, 0, 7), C(20, -17, 2.5, { fill: 1, lw: 1 })],
    pins: [pin(-40, 0, 'G', 'W'), pin(20, -40, 'S', 'N'), pin(20, 40, 'D', 'S')],
  },
  opamp: {
    prims: [...opvTriangle, L(0, -40, 0, -26.7), L(0, 40, 0, 26.7)],
    pins: [pin(-40, -20, 'IN−', 'W'), pin(-40, 20, 'IN+', 'W'), pin(40, 0, 'OUT', 'E'), pin(0, -40, 'V+', 'N'), pin(0, 40, 'V−', 'S')],
  },

  // ── Schalter ──
  switch: { prims: [...switchBase, L(-12, 0, 9, -15)], closedPrims: [...switchBase, L(-12, 0, 12, 0)], pins: twoPin },
  button: {
    prims: [...switchBase, L(-12, 0, 9, -15), L(-1.5, -7.5, -1.5, -24, { dash: '4 3', lw: 1.5 }), L(-9, -24, 6, -24, { lw: 3 })],
    closedPrims: [...switchBase, L(-12, 0, 12, 0), L(0, -1.5, 0, -14, { dash: '4 3', lw: 1.5 }), L(-8, -14, 8, -14, { lw: 3 })],
    pins: twoPin,
  },
  changeover: {
    // Mittelkontakt links, Stellung a oben rechts, b unten rechts
    prims: [L(-40, 0, -12, 0), C(-12, 0, 2.5, { fill: 1, lw: 1 }), L(40, -20, 14, -20), L(40, 20, 14, 20),
      C(12, -20, 2.5, { fill: 1, lw: 1 }), C(12, 20, 2.5, { fill: 1, lw: 1 }), L(-12, 0, 12, -18), T(30, -26, 'a', { size: 11 }), T(30, 34, 'b', { size: 11 })],
    closedPrims: [L(-40, 0, -12, 0), C(-12, 0, 2.5, { fill: 1, lw: 1 }), L(40, -20, 14, -20), L(40, 20, 14, 20),
      C(12, -20, 2.5, { fill: 1, lw: 1 }), C(12, 20, 2.5, { fill: 1, lw: 1 }), L(-12, 0, 12, 18), T(30, -26, 'a', { size: 11 }), T(30, 34, 'b', { size: 11 })],
    pins: [pin(-40, 0, 'M', 'W'), pin(40, -20, 'a', 'E'), pin(40, 20, 'b', 'E')],
  },
};

/** Grenzen eines Symbols (für Auswahlrahmen und Vorschau). */
export function symbolBounds(sym) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of sym.prims) {
    if (p.t === 'line') { add(p.x1, p.y1); add(p.x2, p.y2); }
    else if (p.t === 'rect') { add(p.x, p.y); add(p.x + p.w, p.y + p.h); }
    else if (p.t === 'circle') { add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); }
    else if (p.t === 'poly') p.pts.forEach(([x, y]) => add(x, y));
    else if (p.t === 'text') { add(p.x - 6, p.y - 12); add(p.x + 6, p.y + 2); }
  }
  for (const p of sym.pins) add(p.x, p.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
