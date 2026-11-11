// Frequenzgang: Bedienfeld und Diagramm (Verstärkung in dB oben, Phase in Grad unten, Frequenz logarithmisch).

import { frequencyResponse, logFrequencies, cutoffFrequencies } from '../engine/frequency.js';
import { CircuitError } from '../engine/errors.js';
import { buildNetlist } from '../editor/netlist.js';
import { probeColor } from '../editor/view.js';
import { drawPlot } from './plot.js';
import { formatValue, parseValue } from './units.js';

const PER_DECADE = 10;

export class BodePanel {
  constructor(root, getDoc, status) {
    this.root = root;
    this.getDoc = getDoc;
    this.status = status;
    this.state = { from: 10, to: 100000 };
    this.data = null;
    this.cursorF = null;
    root.innerHTML = `
      <div class="scope-screen"><canvas></canvas></div>
      <div class="scope-side">
        <label>Wechselspannungsquelle<select data-k="source"></select></label>
        <div class="row"><label>von<input data-k="from"></label><label>bis<input data-k="to"></label></div>
        <div class="scope-readout"></div>
      </div>`;
    this.canvas = root.querySelector('canvas');
    this.readout = root.querySelector('.scope-readout');
    for (const el of root.querySelectorAll('[data-k]')) el.addEventListener('change', () => this.#changed());
    const move = (e) => {
      if (!this.plots || !this.data) return;
      this.cursorF = this.plots.top.fromPx(e.clientX - this.canvas.getBoundingClientRect().left);
      this.draw();
    };
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerdown', move);
    this.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.cursorF = null; this.draw(); } });
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }

  #el(k) {
    return this.root.querySelector(`[data-k="${k}"]`);
  }

  #sources() {
    return this.getDoc().comps.filter((c) => c.type === 'sine');
  }

  #populate() {
    const sources = this.#sources();
    const sel = this.#el('source');
    const keep = sel.value;
    sel.innerHTML = '';
    for (const c of sources) sel.add(new Option(`${c.label} – ${c.params.amplitude} V`.replace('.', ','), c.id));
    if (sources.some((c) => c.id === keep)) sel.value = keep;
    this.#el('from').value = formatValue(this.state.from, 'Hz', 6);
    this.#el('to').value = formatValue(this.state.to, 'Hz', 6);
  }

  #changed() {
    const from = parseValue(this.#el('from').value);
    const to = parseValue(this.#el('to').value);
    this.#el('from').classList.toggle('invalid', !(from > 0));
    this.#el('to').classList.toggle('invalid', !(to > from));
    if (!(from > 0 && to > from)) return;
    Object.assign(this.state, { from, to });
    this.refresh(false);
  }

  /** Messung ausführen (z. B. nach Änderung der Schaltung). */
  refresh(repopulate = true) {
    if (repopulate) this.#populate();
    this.data = null;
    const doc = this.getDoc();
    const source = this.#sources().find((c) => c.id === this.#el('source').value);
    if (!source) {
      this.status('Für den Frequenzgang braucht die Schaltung eine Wechselspannungsquelle (Sinus).', true);
      return this.draw();
    }
    const built = buildNetlist(doc);
    const probes = doc.probes.filter((p) => built.probeNets.get(p.id) && built.probeNets.get(p.id) !== '0');
    if (!probes.length) {
      this.status('Setze Messpunkte (P) an die Ausgänge, deren Frequenzgang du sehen willst.', true);
      return this.draw();
    }
    try {
      const started = performance.now();
      const nets = [...new Set(probes.map((p) => built.probeNets.get(p.id)))];
      const r = frequencyResponse(built.netlist, {
        source: source.label || source.id,
        outputs: nets,
        frequencies: logFrequencies(this.state.from, this.state.to, PER_DECADE),
      });
      this.data = {
        f: r.frequencies,
        series: probes.map((p) => ({ label: p.label, color: probeColor(p), ...r.outputs[built.probeNets.get(p.id)] })),
      };
      const edges = cutoffFrequencies(r.frequencies, this.data.series[0].dB);
      this.edges = edges;
      this.status(`Frequenzgang gemessen (${Math.round(performance.now() - started)} ms) – Maus über das Diagramm: Werte ablesen`);
    } catch (err) {
      if (!(err instanceof CircuitError)) throw err;
      this.status(err.message, true);
    }
    this.draw();
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
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    this.plots = null;
    if (!this.data) {
      this.readout.textContent = '';
      return;
    }
    const { f, series } = this.data;
    const common = { xlog: true, formatX: (v) => formatValue(v, 'Hz', 3), cursorX: this.cursorF };
    const topH = Math.round(h * 0.52);
    const dbSeries = series.map((s) => ({ xs: f, ys: s.dB, color: s.color }));
    const phSeries = series.map((s) => ({ xs: f, ys: s.phase, color: s.color }));
    const top = drawPlot(g, { x: 0, y: 0, w, h: topH }, { ...common, series: dbSeries, yTitle: 'Verstärkung (dB)', formatY: (v) => `${String(v).replace('.', ',')} dB`, compactX: true });
    const bottom = drawPlot(g, { x: 0, y: topH, w, h: h - topH }, { ...common, series: phSeries, yTitle: 'Phase (°)', xTitle: 'Frequenz', formatY: (v) => `${String(v).replace('.', ',')}°` });
    this.plots = { top, bottom };

    const lines = [];
    if (this.cursorF !== null) {
      let k = 0;
      for (let i = 1; i < f.length; i++) if (Math.abs(Math.log(f[i] / this.cursorF)) < Math.abs(Math.log(f[k] / this.cursorF))) k = i;
      lines.push(`f = ${formatValue(f[k], 'Hz')}`);
      for (const s of series) lines.push(`<span style="color:${s.color}">■</span> ${s.label}: ${s.dB[k].toFixed(1).replace('.', ',')} dB · ${s.phase[k].toFixed(0)}°`);
    }
    if (this.edges?.length) lines.push(`−3 dB bei ${this.edges.map((e) => formatValue(e, 'Hz')).join(' und ')}`);
    this.readout.innerHTML = lines.join('<br>');
  }
}
