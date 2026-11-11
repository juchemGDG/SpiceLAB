// Einstiegspunkt der Web-App: verbindet Zeichnung, Ansicht, Bedienung, Bauteilleiste und Menü.

import { SchematicDocument } from './editor/document.js';
import { EditorView, GRID } from './editor/view.js';
import { Interaction } from './editor/interaction.js';
import { buildPalette } from './editor/palette.js';
import { buildNetlist } from './editor/netlist.js';
import { openProperties } from './editor/properties.js';
import { simulate, annotationsSVG, probeValues, describe } from './ui/results.js';
import { download, pickFile, parseSchematic, confirmDiscard, FILE_SUFFIX } from './ui/files.js';
import { dialog } from './ui/dialog.js';
import { openHelp } from './ui/help.js';

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
  isLive: () => app.live,
  probeValues: () => app.probeValues,
  describe: (target) => describe(target, app.sim),
});

/** Gemeinsamer Zustand (auch für Bedienungstests im Browser erreichbar). */
export const app = {
  doc, view, ui, render, setStatus,
  live: false, // nach dem ersten „Simulieren“: bei jeder Änderung neu rechnen
  sim: null, // letztes erfolgreiches Ergebnis { result, built }
  showAll: false, // Spannung und Strom an allen Bauteilen anzeigen
  underlay: '', annotations: '', probeValues: new Map(), highlight: new Set(),
};

// ── Simulation ──
// Nach dem ersten „Simulieren“ wird bei jeder Änderung der Zeichnung neu gerechnet (live).

const docKey = () => JSON.stringify([doc.comps, doc.wires, doc.probes]);
let simulatedKey = null;

function runSimulation() {
  simulatedKey = docKey();
  const sim = simulate(doc);
  if (sim.ok) {
    Object.assign(app, { sim, highlight: new Set() });
    refreshAnnotations();
    const hints = [
      sim.built.reference,
      sim.built.skipped.length ? `Nicht angeschlossen: ${sim.built.skipped.join(', ')}` : null,
      sim.built.isolated.length ? `Ohne Spannungsquelle (kein Strom): ${sim.built.isolated.join(', ')}` : null,
    ];
    const tip = doc.probes.length ? 'Arbeitspunkt berechnet' : 'Berechnet – Messpunkt setzen (P) oder mit der Maus über Leitungen und Bauteile fahren';
    setStatus(hints.filter(Boolean).join(' · ') || tip);
  } else {
    Object.assign(app, { sim: null, underlay: '', annotations: '', probeValues: new Map(), highlight: sim.highlight });
    setStatus(sim.message, { error: true });
  }
}

/** Anzeige aus dem letzten Ergebnis neu aufbauen (z. B. nach „Alle Werte“). */
function refreshAnnotations() {
  if (!app.sim) return;
  const { under, over } = annotationsSVG(doc, app.sim.result, { showAll: app.showAll });
  Object.assign(app, { underlay: under, annotations: over, probeValues: probeValues(doc, app.sim) });
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
    probeValues: app.probeValues,
  });
  $('btn-delete').disabled = ui.selection.size === 0;
  $('btn-undo').disabled = !doc.canUndo;
  $('btn-redo').disabled = !doc.canRedo;
  $('btn-wire').classList.toggle('active', ui.tool === 'wire');
  $('btn-probe').classList.toggle('active', ui.tool === 'probe');
  $('btn-values').classList.toggle('active', app.showAll);
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

// ── Dateien ──

let docName = 'Neue Schaltung';
let savedKey = docKey();
const dirty = () => docKey() !== savedKey;

function setDocName(name) {
  docName = name;
  $('breadcrumb').textContent = name;
  document.title = `${name} – SpiceLab`;
}

/** Neue oder geladene Zeichnung übernehmen: Simulation beenden, Ansicht einpassen. */
function resetTo(data, name) {
  doc.load(data);
  ui.selection = new Set();
  Object.assign(app, { live: false, sim: null, underlay: '', annotations: '', probeValues: new Map(), highlight: new Set() });
  savedKey = docKey();
  setDocName(name);
  setStatus();
  view.fit(doc);
  render();
}

on('btn-new', async () => {
  if (await confirmDiscard(dirty())) resetTo({ comps: [], wires: [], n: 0 }, 'Neue Schaltung');
});
on('btn-save', () => {
  download(`${docName}${FILE_SUFFIX}`, JSON.stringify(doc.toJSON(), null, 1));
  savedKey = docKey();
  setStatus(`Gespeichert als „${docName}${FILE_SUFFIX}“`);
});
on('btn-load', async () => {
  if (!(await confirmDiscard(dirty()))) return;
  const file = await pickFile($('file-in'));
  if (!file) return;
  try {
    resetTo(parseSchematic(file.text), file.name.replace(FILE_SUFFIX, '').replace(/\.json$/, ''));
  } catch (err) {
    await dialog({ title: 'Laden nicht möglich', body: err.message, buttons: [{ label: 'OK', value: true, primary: true }] });
  }
});
window.addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });
$('breadcrumb').title = 'Name der Schaltung – Klick zum Umbenennen';
$('breadcrumb').style.cursor = 'pointer';
$('breadcrumb').addEventListener('click', async () => {
  const input = document.createElement('input');
  input.value = docName;
  const form = document.createElement('div');
  form.className = 'dlg-form';
  form.append(input);
  const ok = await dialog({ title: 'Schaltung umbenennen', body: form, buttons: [{ label: 'Abbrechen', value: false }, { label: 'OK', value: true, primary: true }] });
  if (ok && input.value.trim()) setDocName(input.value.trim());
});
on('btn-wire', () => ui.setTool(ui.tool === 'wire' ? 'select' : 'wire'));
on('btn-probe', () => ui.setTool(ui.tool === 'probe' ? 'select' : 'probe'));
on('btn-values', () => { app.showAll = !app.showAll; refreshAnnotations(); render(); });
on('btn-rot', () => ui.rotate());
on('btn-mir', () => ui.mirror());
on('btn-undo', () => { doc.undo(); ui.selection = new Set(); render(); });
on('btn-redo', () => { doc.redo(); ui.selection = new Set(); render(); });
on('btn-delete', () => ui.deleteSelection());
on('btn-fit', () => { view.fit(doc); render(); });
on('zoom-in', () => { const r = view.svg.getBoundingClientRect(); view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); render(); });
on('zoom-out', () => { const r = view.svg.getBoundingClientRect(); view.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); render(); });
on('zoom-pct', () => { view.z = 1; render(); });
on('btn-help', openHelp);
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
