// Bauteilleiste: Karten nach Kategorien, mit Vorschau des Schaltzeichens.
// Karte auf die Zeichenfläche ziehen → Bauteil an dieser Stelle; Doppelklick → Bauteil in der Mitte.

import { CATALOG, CATEGORIES } from './catalog.js';
import { SYMBOLS, symbolBounds } from './symbols.js';
import { symbolSVG } from './svg.js';

/** Kleine Vorschau eines Schaltzeichens (helle Linien auf dunkler Karte). */
function previewSVG(symbolId, size = 44) {
  const sym = SYMBOLS[symbolId];
  const b = symbolBounds(sym);
  const pad = 4;
  const scale = Math.min((size - 2 * pad) / b.w, (size - 2 * pad) / b.h, 0.7);
  const tx = size / 2 - (b.x + b.w / 2) * scale;
  const ty = size / 2 - (b.y + b.h / 2) * scale;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${tx} ${ty}) scale(${scale})">` +
    `${symbolSVG(sym, { color: '#f8fafc' })}</g></svg>`;
}

/**
 * @param {HTMLElement} container
 * @param {object} handlers
 * @param {(type: string, clientX?: number, clientY?: number) => void} handlers.place
 * @param {(clientX: number, clientY: number) => boolean} handlers.isOverCanvas
 */
export function buildPalette(container, { place, isOverCanvas }) {
  container.innerHTML = '';
  for (const cat of CATEGORIES) {
    const label = document.createElement('div');
    label.className = 'cat-label';
    label.textContent = cat;
    container.append(label);
    for (const entry of CATALOG.filter((e) => e.cat === cat)) {
      const card = document.createElement('div');
      card.className = 'palette-card';
      card.title = `${entry.name} – auf die Fläche ziehen oder doppelklicken`;
      card.innerHTML = `<span class="palette-shape">${previewSVG(entry.symbol)}</span>` +
        `<span class="palette-text"><div class="palette-name">${entry.name}</div><div class="palette-hint">${entry.hint}</div></span>`;
      card.addEventListener('dblclick', () => place(entry.id));
      card.addEventListener('pointerdown', (e) => startCardDrag(e, entry, { place, isOverCanvas }));
      container.append(card);
    }
  }
}

let lastTap = null;

function startCardDrag(e, entry, { place, isOverCanvas }) {
  if (e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let ghost = null;

  const move = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'drag-ghost';
      ghost.innerHTML = previewSVG(entry.symbol, 56);
      document.body.append(ghost);
    }
    ghost.style.left = `${ev.clientX - 28}px`;
    ghost.style.top = `${ev.clientY - 28}px`;
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (ghost) {
      ghost.remove();
      if (isOverCanvas(ev.clientX, ev.clientY)) place(entry.id, ev.clientX, ev.clientY);
      return;
    }
    // doppeltes Tippen (Tablet) wie Doppelklick
    const now = Date.now();
    if (lastTap && lastTap.id === entry.id && now - lastTap.t < 400) {
      lastTap = null;
      if (ev.pointerType !== 'mouse') place(entry.id);
    } else {
      lastTap = { id: entry.id, t: now };
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
