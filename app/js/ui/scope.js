// Oszilloskop: Bildschirm mit 10 × 8 Kästchen, eine Kurve je Messpunkt, Zeit-Cursor („Zeitlupe“).
//
// Der Bildschirm ist ein <canvas>; Einstellungen (Zeit/Div, Volt/Div, Kondensatoren entladen) und
// die Ablesung stehen daneben bzw. darunter. Die Rechnung selbst macht main.js über results.js.

import { DIVISIONS_X, DIVISIONS_Y, TIME_STEPS, VOLT_STEPS, autoVertical } from './scale.js';
import { formatValue } from './units.js';
import { valueAt } from '../engine/transient.js';

const SCREEN_BG = '#0b1220';
const GRID_COLOR = 'rgba(148, 163, 184, 0.25)';
const AXIS_COLOR = 'rgba(148, 163, 184, 0.55)';

export class Scope {
  /**
   * @param {HTMLElement} root   Container (#scope)
   * @param {object} handlers
   * @param {(settings) => void} handlers.settingsChanged  Zeit/Div oder „entladen“ geändert → neu rechnen
   * @param {(t: number|null) => void} handlers.cursorChanged Zeit-Cursor bewegt (null: Cursor weg)
   */
  constructor(root, { settingsChanged, cursorChanged }) {
    this.root = root;
    this.settings = { timePerDiv: 'auto', voltsPerDiv: 'auto', discharged: true };
    this.data = null; // { time: Float64Array, channels: [{ label, color, values }] }
    this.cursor = null;
    this.handlers = { settingsChanged, cursorChanged };
    this.#build();
  }

  #build() {
    const option = (v, unit) => `<option value="${v}">${formatValue(v, unit)}/Div</option>`;
    this.root.innerHTML = `
      <div class="scope-screen"><canvas></canvas></div>
      <div class="scope-side">
        <label>Zeit<select data-k="timePerDiv"><option value="auto">Auto</option>${TIME_STEPS.map((v) => option(v, 's')).join('')}</select></label>
        <label>Spannung<select data-k="voltsPerDiv"><option value="auto">Auto</option>${VOLT_STEPS.map((v) => option(v, 'V')).join('')}</select></label>
        <label class="chk"><input type="checkbox" data-k="discharged" checked> Kondensatoren zu Beginn entladen</label>
        <div class="scope-readout"></div>
      </div>`;
    this.canvas = this.root.querySelector('canvas');
    this.readout = this.root.querySelector('.scope-readout');
    for (const el of this.root.querySelectorAll('[data-k]')) {
      el.addEventListener('change', () => {
        const k = el.dataset.k;
        this.settings[k] = el.type === 'checkbox' ? el.checked : el.value === 'auto' ? 'auto' : Number(el.value);
        if (k === 'voltsPerDiv') this.draw();
        else this.handlers.settingsChanged(this.settings);
      });
    }
    const pick = (e) => {
      if (!this.data) return;
      const r = this.canvas.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      this.cursor = f * this.data.stopTime;
      this.handlers.cursorChanged(this.cursor);
      this.draw();
    };
    this.canvas.addEventListener('pointermove', pick);
    this.canvas.addEventListener('pointerdown', pick);
    this.canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return; // auf dem Tablet bleibt der Cursor stehen
      this.cursor = null;
      this.handlers.cursorChanged(null);
      this.draw();
    });
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  /** Neue Kurven anzeigen. channels: [{ label, color, values (Float64Array, Werte zu data.time) }] */
  setData(data) {
    this.data = data;
    if (this.cursor !== null && data && this.cursor > data.stopTime) this.cursor = null;
    this.draw();
  }

  /** Angezeigte Zeit/Div (bei „Auto“ der gewählte Vorschlag). */
  setTimePerDiv(value) {
    this.timePerDiv = value;
  }

  #vertical() {
    const ch = this.data?.channels ?? [];
    if (this.settings.voltsPerDiv !== 'auto') return { voltsPerDiv: this.settings.voltsPerDiv, zeroDiv: DIVISIONS_Y / 2 };
    let min = Infinity;
    let max = -Infinity;
    for (const c of ch) for (const v of c.values) { if (v < min) min = v; if (v > max) max = v; }
    return autoVertical(min, max);
  }

  draw() {
    const cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = SCREEN_BG;
    g.fillRect(0, 0, w, h);

    // Raster: 10 × 8 Kästchen, Mittelachsen mit Teilstrichen
    const dx = w / DIVISIONS_X;
    const dy = h / DIVISIONS_Y;
    g.lineWidth = 1;
    g.strokeStyle = GRID_COLOR;
    g.beginPath();
    for (let i = 1; i < DIVISIONS_X; i++) { g.moveTo(i * dx + 0.5, 0); g.lineTo(i * dx + 0.5, h); }
    for (let j = 1; j < DIVISIONS_Y; j++) { g.moveTo(0, j * dy + 0.5); g.lineTo(w, j * dy + 0.5); }
    g.stroke();

    const { voltsPerDiv, zeroDiv } = this.#vertical();
    const yOf = (v) => h - (zeroDiv + v / voltsPerDiv) * dy;
    g.strokeStyle = AXIS_COLOR;
    g.beginPath();
    const y0 = Math.round(yOf(0)) + 0.5;
    g.moveTo(0, y0);
    g.lineTo(w, y0);
    g.stroke();

    const labels = [`${formatValue(this.timePerDiv ?? 0, 's')}/Div`, `${formatValue(voltsPerDiv, 'V')}/Div`];
    g.font = '11px Helvetica, Arial, sans-serif';
    g.fillStyle = '#94a3b8';
    g.fillText(labels.join('   '), 8, h - 8);
    g.fillText('0 V ▸', 4, Math.min(h - 20, Math.max(12, y0 - 4)));

    if (!this.data || !this.data.channels.length) {
      g.fillStyle = '#cbd5e1';
      g.font = '13px Helvetica, Arial, sans-serif';
      g.fillText(this.data ? 'Setze Messpunkte (P) – jeder Messpunkt wird eine Kurve.' : 'Noch keine Messung.', 12, 22);
      this.readout.textContent = '';
      return;
    }

    // Kurven
    const { time, stopTime, channels } = this.data;
    const xOf = (t) => (t / stopTime) * w;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    g.lineWidth = 2;
    g.lineJoin = 'round';
    for (const c of channels) {
      g.strokeStyle = c.color;
      g.beginPath();
      for (let k = 0; k < time.length; k++) {
        const x = xOf(time[k]);
        const y = Math.max(-5, Math.min(h + 5, yOf(c.values[k])));
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();

    // Cursor und Ablesung
    let read = '';
    if (this.cursor !== null) {
      const x = Math.round(xOf(this.cursor)) + 0.5;
      g.strokeStyle = '#f8fafc';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.setLineDash([]);
      read = `t = ${formatValue(this.cursor, 's')}`;
    }
    this.readout.innerHTML = [read, ...channels.map((c) => {
      const v = this.cursor === null ? null : valueAt(time, c.values, this.cursor);
      return `<span style="color:${c.color}">■</span> ${c.label}${v === null ? '' : `: ${formatValue(v, 'V')}`}`;
    })].filter(Boolean).join('<br>');
  }
}
