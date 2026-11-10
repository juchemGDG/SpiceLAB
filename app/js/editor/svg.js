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

/** Alle Grundformen eines Schaltzeichens (closed: Schalter geschlossen darstellen). */
export function symbolSVG(symbol, { color = INK, closed = false } = {}) {
  const prims = closed && symbol.closedPrims ? symbol.closedPrims : symbol.prims;
  return prims.map((p) => primitiveSVG(p, color)).join('');
}
