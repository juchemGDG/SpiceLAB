// SVG-Text für Schaltzeichen (ohne DOM, damit es auch für Export und Tests taugt).

export const INK = '#0f172a';
export const INK_SELECTED = '#2563eb';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Eine Grundform als SVG-Element. */
export function primitiveSVG(p, color = INK, width = 2) {
  const lw = p.lw ?? width;
  const stroke = `stroke="${color}" stroke-width="${lw}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}`;
  const fill = p.fill ? color : 'none';
  switch (p.t) {
    case 'line':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" ${stroke} stroke-linecap="${p.cap ?? 'round'}"/>`;
    case 'rect':
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${fill}" ${stroke}/>`;
    case 'circle':
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${fill}" ${stroke}/>`;
    case 'poly': {
      const tag = p.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${p.pts.map((q) => q.join(',')).join(' ')}" fill="${fill}" ${stroke} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    case 'text':
      return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" font-family="Helvetica, Arial, sans-serif"${p.weight ? ` font-weight="${p.weight}"` : ''} text-anchor="${p.anchor}" fill="${color}">${esc(p.text)}</text>`;
    default:
      return '';
  }
}

/** Bleibt die Grundform beim Drehen aufrecht? (Texte und mit upright markierte Zeichen) */
const isUpright = (p) => p.t === 'text' || p.upright;

/** Alle Grundformen eines Schaltzeichens ohne Drehung (Vorschau in der Bauteilleiste). */
export function symbolSVG(symbol, { color = INK, closed = false } = {}) {
  const prims = closed && symbol.closedPrims ? symbol.closedPrims : symbol.prims;
  return prims.map((p) => primitiveSVG(p, color)).join('');
}

/**
 * Schaltzeichen an einem Bauteil: Linien drehen und spiegeln mit, Texte und „aufrechte“ Zeichen
 * (z. B. die Sinuswelle) wandern mit, bleiben aber lesbar.
 * @param {string} transform  SVG-transform des Bauteils (geometry.svgTransform)
 * @param {(pt: number[]) => number[]} toWorld  Symbolpunkt → Zeichnungspunkt
 */
export function placedSymbolSVG(symbol, transform, toWorld, { color = INK, closed = false } = {}) {
  const prims = closed && symbol.closedPrims ? symbol.closedPrims : symbol.prims;
  let out = `<g transform="${transform}">${prims.filter((p) => !isUpright(p)).map((p) => primitiveSVG(p, color)).join('')}</g>`;
  const [ox, oy] = toWorld([0, 0]);
  for (const p of prims.filter(isUpright)) {
    if (p.upright) {
      // Zeichen in der Symbolmitte (Welle, „M“): bleibt als Ganzes aufrecht um den Mittelpunkt
      out += `<g transform="translate(${ox} ${oy})">${primitiveSVG(p, color)}</g>`;
    } else {
      // Text neben dem Symbol (z. B. „+“ am Anschluss): Lage dreht mit, Schrift bleibt lesbar
      const [x, y] = toWorld([p.x, p.y]);
      out += primitiveSVG({ ...p, x, y }, color);
    }
  }
  return out;
}
