// Geometrie: Bauteile drehen und spiegeln, Anschlusspositionen in Zeichnungskoordinaten.
//
// Ein Bauteil in der Zeichnung: { x, y, rot: 0 | 90 | 180 | 270, mir: true/false }.
// Umrechnung eines Symbolpunkts (sx, sy):  erst spiegeln (x → −x), dann drehen, dann verschieben.
// Drehung um +90° bedeutet im Bildschirm (y nach unten) im Uhrzeigersinn – wie SVG rotate().

const COS_SIN = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };

/** Symbolpunkt → Zeichnungspunkt. */
export function toWorld(comp, [sx, sy]) {
  const x = comp.mir ? -sx : sx;
  const [c, s] = COS_SIN[comp.rot ?? 0];
  return [comp.x + c * x - s * sy, comp.y + s * x + c * sy];
}

/** Zeichnungspunkt → Symbolpunkt (Umkehrung von toWorld). */
export function toSymbol(comp, [wx, wy]) {
  const [c, s] = COS_SIN[comp.rot ?? 0];
  const dx = wx - comp.x;
  const dy = wy - comp.y;
  const x = c * dx + s * dy;
  const y = -s * dx + c * dy;
  return [comp.mir ? -x : x, y];
}

const DIRS = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const DIR_OF = (dx, dy) => (dx < 0 ? 'W' : dx > 0 ? 'E' : dy < 0 ? 'N' : 'S');

/** Richtung, in die die Leitung an einem Anschluss abgeht – nach Drehen und Spiegeln. */
export function pinDirection(comp, pin) {
  const [dx, dy] = DIRS[pin.d];
  const [x1, y1] = toWorld({ ...comp, x: 0, y: 0 }, [dx, dy]);
  return DIR_OF(Math.round(x1), Math.round(y1));
}

/** Anschlüsse eines Bauteils in Zeichnungskoordinaten: [{ name, x, y, d }]. */
export function pinPositions(comp, symbol) {
  return symbol.pins.map((p) => {
    const [x, y] = toWorld(comp, [p.x, p.y]);
    return { name: p.name, x: Math.round(x), y: Math.round(y), d: pinDirection(comp, p) };
  });
}

/** SVG-transform-Attribut zum Zeichnen eines Symbols an der Bauteilposition. */
export function svgTransform(comp) {
  return `translate(${comp.x} ${comp.y}) rotate(${comp.rot ?? 0}) scale(${comp.mir ? -1 : 1} 1)`;
}

/** Abstand eines Punkts von einer Strecke. */
export function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Liegt der Punkt auf der achsparallelen Strecke (einschließlich der Enden)? */
export function onSegment([px, py], [ax, ay], [bx, by]) {
  if (ax === bx) return px === ax && py >= Math.min(ay, by) && py <= Math.max(ay, by);
  if (ay === by) return py === ay && px >= Math.min(ax, bx) && px <= Math.max(ax, bx);
  return false;
}

/** Auf das Raster runden. */
export function snap([x, y], grid = 20) {
  // „|| 0“ macht aus −0 eine 0 (sonst sind Vergleiche mit Object.is überraschend)
  return [Math.round(x / grid) * grid || 0, Math.round(y / grid) * grid || 0];
}
