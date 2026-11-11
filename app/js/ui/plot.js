// Diagramme (Kennlinie, Frequenzgang) auf einem <canvas>: Achsen mit „runden“ Teilungen,
// Gitter, Beschriftung, mehrere Kurven, Markierung und Cursor. Heller Hintergrund (druckfreundlich).

const AXIS = '#475569';
const GRID = '#e2e8f0';
const FONT = '11px Helvetica, Arial, sans-serif';

/**
 * Runde Teilstriche (Abstand 1, 2 oder 5 · 10^n) für den Bereich [min, max].
 * @returns {{ ticks: number[], min: number, max: number, step: number }} min/max auf Teilstriche erweitert
 */
export function niceTicks(min, max, count = 6) {
  if (!(max > min)) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const step = (base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10) * 10 ** exp;
  const first = Math.floor(min / step + 1e-9);
  const last = Math.ceil(max / step - 1e-9);
  // ganze Vielfache der Schrittweite (so bleibt die 0 exakt 0)
  const ticks = Array.from({ length: last - first + 1 }, (_, k) => Number(((first + k) * step).toPrecision(12)));
  return { ticks, min: ticks[0], max: ticks.at(-1), step };
}

/** Dekaden-Teilung für logarithmische Achsen: Hauptstriche 10^n, Nebenstriche 2 und 5. */
export function logTicks(min, max) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const ticks = [];
  for (let e = lo; e <= hi; e++) {
    for (const m of [1, 2, 5]) ticks.push({ v: Number((m * 10 ** e).toPrecision(3)), major: m === 1 });
  }
  return { ticks, min: 10 ** lo, max: 10 ** hi };
}

/**
 * Diagramm zeichnen.
 * @param {CanvasRenderingContext2D} g
 * @param {{x: number, y: number, w: number, h: number}} r  Zeichenbereich
 * @param {object} o
 * @param {{xs: ArrayLike<number>, ys: ArrayLike<number>, color: string, label?: string}[]} o.series
 * @param {boolean} [o.xlog]
 * @param {string} [o.xTitle]  @param {string} [o.yTitle]
 * @param {(v: number) => string} o.formatX  @param {(v: number) => string} o.formatY
 * @param {{x: number, y: number, color: string}} [o.marker]  hervorgehobener Punkt (z. B. Arbeitspunkt)
 * @param {number} [o.cursorX]  senkrechte Cursorlinie
 * @param {number[]} [o.yRange] feste Grenzen [min, max]
 * @returns {{ toX: (x: number) => number, toY: (y: number) => number, fromPx: (px: number) => number, area: object }}
 */
export function drawPlot(g, r, o) {
  const pad = { l: 62, r: 14, t: 14, b: 38 };
  const area = { x: r.x + pad.l, y: r.y + pad.t, w: r.w - pad.l - pad.r, h: r.h - pad.t - pad.b };
  g.save();
  g.fillStyle = '#fff';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.font = FONT;

  // Wertebereiche
  const all = (key) => o.series.flatMap((s) => Array.from(s[key]).filter(Number.isFinite));
  const xs = all('xs');
  const ys = all('ys');
  const xMinData = Math.min(...xs);
  const xMaxData = Math.max(...xs);
  let xt;
  let xMin;
  let xMax;
  if (o.xlog) {
    xt = logTicks(Math.max(xMinData, 1e-12), Math.max(xMaxData, 1e-12));
    [xMin, xMax] = [Math.log10(xt.min), Math.log10(xt.max)];
  } else {
    xt = niceTicks(xMinData, xMaxData, Math.max(3, Math.round(area.w / 90)));
    [xMin, xMax] = [xt.min, xt.max];
  }
  const yt = niceTicks(o.yRange?.[0] ?? Math.min(...ys), o.yRange?.[1] ?? Math.max(...ys), Math.max(3, Math.round(area.h / 50)));
  const toX = (x) => area.x + (((o.xlog ? Math.log10(x) : x) - xMin) / (xMax - xMin)) * area.w;
  const toY = (y) => area.y + area.h - ((y - yt.min) / (yt.max - yt.min)) * area.h;
  const fromPx = (px) => {
    const f = (px - area.x) / area.w;
    const v = xMin + f * (xMax - xMin);
    return o.xlog ? 10 ** v : v;
  };

  // Gitter und Teilstriche
  g.lineWidth = 1;
  g.textBaseline = 'middle';
  g.textAlign = 'right';
  g.fillStyle = AXIS;
  for (const v of yt.ticks) {
    const y = Math.round(toY(v)) + 0.5;
    g.strokeStyle = v === 0 ? '#94a3b8' : GRID;
    g.beginPath(); g.moveTo(area.x, y); g.lineTo(area.x + area.w, y); g.stroke();
    g.fillText(o.formatY(v), area.x - 6, y);
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const xTicks = o.xlog ? xt.ticks.map((t) => ({ v: t.v, major: t.major })) : xt.ticks.map((v) => ({ v, major: true }));
  for (const t of xTicks) {
    if (o.xlog ? t.v < xt.min || t.v > xt.max : false) continue;
    const x = Math.round(toX(t.v)) + 0.5;
    g.strokeStyle = t.major ? '#cbd5e1' : GRID;
    g.beginPath(); g.moveTo(x, area.y); g.lineTo(x, area.y + area.h); g.stroke();
    if (t.major) g.fillText(o.formatX(t.v), x, area.y + area.h + 5);
  }
  g.strokeStyle = AXIS;
  g.strokeRect(area.x + 0.5, area.y + 0.5, area.w, area.h);

  // Achsentitel
  g.fillStyle = '#0f172a';
  g.font = 'bold 11px Helvetica, Arial, sans-serif';
  g.textBaseline = 'alphabetic';
  if (o.xTitle) g.fillText(o.xTitle, area.x + area.w / 2, r.y + r.h - 4);
  if (o.yTitle) {
    g.save();
    g.translate(r.x + 12, area.y + area.h / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(o.yTitle, 0, 0);
    g.restore();
  }

  // Kurven (auf den Zeichenbereich begrenzt)
  g.beginPath();
  g.rect(area.x, area.y, area.w, area.h);
  g.clip();
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  for (const s of o.series) {
    g.strokeStyle = s.color;
    g.beginPath();
    let pen = false;
    for (let k = 0; k < s.xs.length; k++) {
      if (!Number.isFinite(s.ys[k]) || !Number.isFinite(s.xs[k])) { pen = false; continue; }
      const px = toX(s.xs[k]);
      const py = toY(s.ys[k]);
      if (pen) g.lineTo(px, py);
      else g.moveTo(px, py);
      pen = true;
    }
    g.stroke();
  }
  if (o.cursorX !== undefined && o.cursorX !== null) {
    const x = Math.round(toX(o.cursorX)) + 0.5;
    g.strokeStyle = '#0f172a';
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, area.y); g.lineTo(x, area.y + area.h); g.stroke();
    g.setLineDash([]);
  }
  if (o.marker) {
    g.fillStyle = o.marker.color;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath(); g.arc(toX(o.marker.x), toY(o.marker.y), 6, 0, 2 * Math.PI); g.fill(); g.stroke();
  }
  g.restore();
  return { toX, toY, fromPx, area };
}
