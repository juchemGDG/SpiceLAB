// Kennlinienschreiber: Bedienfeld und Diagramm.

import { sweepSources, quantities, defaultAxes, characteristic } from './curve-data.js';
import { drawPlot } from './plot.js';
import { formatValue, parseValue } from './units.js';
import { CircuitError } from '../engine/errors.js';

const COLOR = '#2563eb';

export class CurvePanel {
  /**
   * @param {HTMLElement} root
   * @param {() => import('../editor/document.js').SchematicDocument} getDoc
   * @param {(text: string, error?: boolean) => void} status
   */
  constructor(root, getDoc, status) {
    this.root = root;
    this.getDoc = getDoc;
    this.status = status;
    this.state = null; // { sourceId, from, to, x, y }
    this.result = null;
    this.cursorX = null;
    root.innerHTML = `
      <div class="scope-screen"><canvas></canvas></div>
      <div class="scope-side">
        <label>Größe durchfahren<select data-k="source"></select></label>
        <div class="row"><label>von<input data-k="from"></label><label>bis<input data-k="to"></label></div>
        <label>x-Achse<select data-k="x"></select></label>
        <label>y-Achse<select data-k="y"></select></label>
        <div class="scope-readout"></div>
      </div>`;
    this.canvas = root.querySelector('canvas');
    this.readout = root.querySelector('.scope-readout');
    for (const el of root.querySelectorAll('[data-k]')) el.addEventListener('change', () => this.#changed(el.dataset.k));
    const move = (e) => {
      if (!this.plot || !this.result) return;
      const r = this.canvas.getBoundingClientRect();
      this.cursorX = this.plot.fromPx(e.clientX - r.left);
      this.draw();
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerdown', move);
    this.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.cursorX = null; this.draw(); } });
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  #el(k) {
    return this.root.querySelector(`[data-k="${k}"]`);
  }

  /** Auswahllisten passend zur Zeichnung füllen; behält frühere Einstellungen, wenn sie noch passen. */
  #populate() {
    const doc = this.getDoc();
    const sources = sweepSources(doc);
    const sel = this.#el('source');
    sel.innerHTML = '';
    for (const s of sources) sel.add(new Option(`${s.name} – ${s.label}`, s.comp.id));
    if (!sources.length) {
      this.state = null;
      return;
    }
    const keep = this.state && sources.some((s) => s.comp.id === this.state.sourceId);
    const source = sources.find((s) => s.comp.id === (keep ? this.state.sourceId : sources[0].comp.id));
    sel.value = source.comp.id;
    const qs = quantities(doc, source);
    for (const k of ['x', 'y']) {
      const q = this.#el(k);
      q.innerHTML = '';
      for (const o of qs) q.add(new Option(`${o.label} (${o.unit})`, o.id));
    }
    const def = defaultAxes(doc, source);
    const ids = new Set(qs.map((q) => q.id));
    const state = {
      sourceId: source.comp.id,
      from: keep ? this.state.from : source.from,
      to: keep ? this.state.to : source.to,
      x: keep && ids.has(this.state.x) ? this.state.x : def.x,
      y: keep && ids.has(this.state.y) ? this.state.y : def.y,
    };
    this.state = state;
    this.#el('x').value = state.x;
    this.#el('y').value = state.y;
    this.#el('from').value = formatValue(state.from, source.unit, 6);
    this.#el('to').value = formatValue(state.to, source.unit, 6);
    this.source = source;
  }

  #changed(key) {
    if (key === 'source') {
      this.state = { sourceId: this.#el('source').value }; // Voreinstellungen des neuen Bauteils
      this.#populate();
    } else {
      const from = parseValue(this.#el('from').value);
      const to = parseValue(this.#el('to').value);
      this.#el('from').classList.toggle('invalid', !Number.isFinite(from));
      this.#el('to').classList.toggle('invalid', !Number.isFinite(to));
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;
      Object.assign(this.state, { from, to, x: this.#el('x').value, y: this.#el('y').value });
    }
    this.refresh(false);
  }

  /** Neu berechnen (z. B. nach Änderung der Schaltung). */
  refresh(repopulate = true) {
    if (repopulate) this.#populate();
    this.result = null;
    if (!this.state) {
      this.status('Für eine Kennlinie braucht die Schaltung ein Netzgerät (oder einen LDR, NTC, Poti …), dessen Wert durchgefahren wird.', true);
      this.draw();
      return;
    }
    try {
      this.result = characteristic(this.getDoc(), { ...this.state, points: 120 });
      this.status('Kennlinie berechnet – Maus über das Diagramm: Werte ablesen');
    } catch (err) {
      if (!(err instanceof CircuitError)) throw err;
      this.status(err.message, true);
    }
    this.draw();
  }

  #unit(id) {
    return quantities(this.getDoc(), this.source).find((q) => q.id === id) ?? { label: '', unit: '' };
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
    if (!this.result || !this.state) {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      this.plot = null;
      this.readout.textContent = '';
      return;
    }
    const qx = this.#unit(this.state.x);
    const qy = this.#unit(this.state.y);
    const { x, y, marker } = this.result;
    this.plot = drawPlot(g, { x: 0, y: 0, w, h }, {
      series: [{ xs: x, ys: y, color: COLOR }],
      xTitle: `${qx.label} (${qx.unit})`,
      yTitle: `${qy.label} (${qy.unit})`,
      formatX: (v) => formatValue(v, qx.unit, 3),
      formatY: (v) => formatValue(v, qy.unit, 3),
      marker: marker && { ...marker, color: '#ea580c' },
      cursorX: this.cursorX,
    });
    const lines = [];
    if (this.cursorX !== null) {
      // y-Wert zum Cursor: nächster berechneter Punkt (x ist nicht immer monoton, deshalb Suche nach Abstand)
      let best = 0;
      for (let k = 1; k < x.length; k++) if (Math.abs(x[k] - this.cursorX) < Math.abs(x[best] - this.cursorX)) best = k;
      lines.push(`x = ${formatValue(x[best], qx.unit)}`, `y = ${formatValue(y[best], qy.unit)}`);
    }
    if (marker) lines.push('<span style="color:#ea580c">●</span> Arbeitspunkt der Schaltung');
    this.readout.innerHTML = lines.join('<br>');
  }
}
