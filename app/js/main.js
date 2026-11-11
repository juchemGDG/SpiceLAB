// Einstiegspunkt der Web-App: verbindet Zeichnung, Ansicht, Bedienung, Bauteilleiste und Menü.

import { SchematicDocument } from './editor/document.js';
import { EditorView, GRID } from './editor/view.js';
import { Interaction } from './editor/interaction.js';
import { buildPalette } from './editor/palette.js';
import { buildNetlist } from './editor/netlist.js';
import { openProperties } from './editor/properties.js';
import { simulate, annotationsSVG } from './ui/results.js';

const $ = (id) => document.getElementById(id);

const doc = new SchematicDocument();
const view = new EditorView($('svg'));
let statusText = null;

const ui = new Interaction({
  doc,
  view,
  changed: render,
  openProperties: async (comp) => {
    if (await openProperties(doc, comp)) app.onChange?.();
    render();
  },
  status: (text) => setStatus(text),
});

/** Gemeinsamer Zustand (auch für Bedienungstests im Browser erreichbar). */
export const app = { doc, view, ui, render, setStatus, underlay: '', annotations: '', highlight: new Set(), live: false };

// ── Simulation ──
// Nach dem ersten „Simulieren“ wird bei jeder Änderung der Zeichnung neu gerechnet (live).

const docKey = () => JSON.stringify([doc.comps, doc.wires]);
let simulatedKey = null;

function runSimulation() {
  simulatedKey = docKey();
  const sim = simulate(doc);
  if (sim.ok) {
    const { under, over } = annotationsSVG(doc, sim.result);
    Object.assign(app, { underlay: under, annotations: over, highlight: new Set() });
    const hints = [
      sim.built.reference,
      sim.built.skipped.length ? `Nicht angeschlossen: ${sim.built.skipped.join(', ')}` : null,
      sim.built.isolated.length ? `Ohne Spannungsquelle (kein Strom): ${sim.built.isolated.join(', ')}` : null,
    ];
    setStatus(hints.filter(Boolean).join(' · ') || 'Arbeitspunkt berechnet');
  } else {
    Object.assign(app, { underlay: '', annotations: '', highlight: sim.highlight });
    setStatus(sim.message, { error: true });
  }
}

function render() {
  if (app.live && docKey() !== simulatedKey) runSimulation();
  const { junctions } = buildNetlist(doc);
  view.render({
    doc,
    selection: ui.selection,
    junctions,
    overlay: ui.overlaySVG(),
    underlay: app.underlay,
    annotations: app.annotations,
    highlight: app.highlight,
  });
  $('btn-delete').disabled = ui.selection.size === 0;
  $('btn-undo').disabled = !doc.canUndo;
  $('btn-redo').disabled = !doc.canRedo;
  $('btn-wire').classList.toggle('active', ui.tool === 'wire');
  $('zoom-pct').textContent = `${Math.round(view.z * 100)} %`;
  if (!statusText) $('status').textContent = `${doc.comps.length} Bauteile · ${doc.wires.length} Leitungen`;
}

/** Statuszeile; ohne Text die Übersicht. Fehler werden rot dargestellt. */
function setStatus(text, { error = false } = {}) {
  statusText = text ?? null;
  const el = $('status');
  el.classList.toggle('error', error);
  el.textContent = text ?? `${doc.comps.length} Bauteile · ${doc.wires.length} Leitungen`;
}

// ── Bauteile platzieren ──

function place(type, clientX, clientY) {
  let x;
  let y;
  if (clientX === undefined) {
    const r = view.svg.getBoundingClientRect();
    [x, y] = view.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  } else {
    [x, y] = view.toWorld(clientX, clientY);
  }
  const comp = doc.addComponent(type, Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID);
  doc.commit();
  ui.selection = new Set([comp.id]);
  $('sidebar').classList.remove('open');
  render();
}

buildPalette($('palette'), {
  place,
  isOverCanvas: (cx, cy) => {
    const r = view.svg.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  },
});

// ── Menü ──

const on = (id, fn) => $(id).addEventListener('click', fn);
on('btn-simulate', () => { app.live = true; runSimulation(); render(); });
on('btn-wire', () => ui.setTool(ui.tool === 'wire' ? 'select' : 'wire'));
on('btn-rot', () => ui.rotate());
on('btn-mir', () => ui.mirror());
on('btn-undo', () => { doc.undo(); ui.selection = new Set(); render(); });
on('btn-redo', () => { doc.redo(); ui.selection = new Set(); render(); });
on('btn-delete', () => ui.deleteSelection());
on('btn-fit', () => { view.fit(doc); render(); });
on('zoom-in', () => { const r = view.svg.getBoundingClientRect(); view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); render(); });
on('zoom-out', () => { const r = view.svg.getBoundingClientRect(); view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); render(); });
on('zoom-pct', () => { view.z = 1; render(); });
on('sidebar-toggle', () => $('sidebar').classList.toggle('open'));
on('menu-toggle', () => $('menubar').classList.toggle('open'));

// ── Tastatur ──

const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.querySelector('.overlay');
window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (ui.onKey(e)) {
    e.preventDefault();
    return;
  }
  if (e.key === 'F5') { e.preventDefault(); $('btn-simulate').click(); }
  if (e.key === '0') { view.fit(doc); render(); }
  if (e.key === '+') { $('zoom-in').click(); }
  if (e.key === '-') { $('zoom-out').click(); }
});
window.addEventListener('keyup', (e) => ui.onKeyUp(e));
window.addEventListener('resize', render);

render();
