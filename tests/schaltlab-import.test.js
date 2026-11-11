// SchaltLab-Dateien übernehmen (Beispiel nach dem Muster echter SchaltLab-Dateien).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSchaltLab, fromSchaltLab } from '../app/js/ui/schaltlab-import.js';
import { SchematicDocument } from '../app/js/editor/document.js';
import { buildNetlist } from '../app/js/editor/netlist.js';
import { operatingPoint } from '../app/js/engine/dc.js';

// +5-V-Schiene, Vorwiderstand, LED, GND-Schiene; dazu Teile ohne Modell
const sample = {
  format: 'schaltplan-editor', version: 1, name: 'LED an Schiene', grid: 20,
  comps: [
    { id: 'c1', type: 'rail', x: 20, y: 20, rot: 0, mir: 0, label: '', value: '+5 V', fs: 14, len: 4 },
    { id: 'c2', type: 'resistor', x: 60, y: 100, rot: 90, mir: 0, label: 'R1', value: '150 Ω', fs: 14 },
    { id: 'c3', type: 'led', x: 60, y: 200, rot: 90, mir: 0, label: 'D1', value: 'grün', fs: 14 },
    { id: 'c4', type: 'gndrail', x: 20, y: 280, rot: 0, mir: 0, label: '', value: '', fs: 14, len: 4 },
    { id: 'c5', type: 'rail', x: 200, y: 20, rot: 0, mir: 0, label: '', value: 'ADC (GPIO34)', fs: 14, len: 1 },
    { id: 'c6', type: 'npn', x: 300, y: 100, rot: 0, mir: 0, label: 'T1', value: 'SFH 300-3/4', fs: 14 },
    { id: 'c7', type: 'mcu_pico2w', x: 500, y: 100, rot: 0, mir: 0, label: 'MC1', value: '', fs: 14 },
    { id: 'c8', type: 'diode', x: 400, y: 300, rot: 0, mir: 0, label: 'D2', value: 'Z 5,1 V', fs: 14 },
    { id: 'c9', type: 'switch', x: 400, y: 400, rot: 0, mir: 0, label: 'S1', value: '', fs: 14, on: true },
    { id: 'c10', type: 'resistor', x: 600, y: 400, rot: 0, mir: 0, label: 'R1', value: '4k7', fs: 14 },
  ],
  wires: [
    { id: 'w11', pts: [[60, 20], [60, 60]] },
    { id: 'w12', pts: [[60, 140], [60, 160]] },
    { id: 'w13', pts: [[60, 240], [60, 280]] },
  ],
  customs: [],
};

test('Erkennung des SchaltLab-Formats', () => {
  assert.ok(isSchaltLab(sample));
  assert.ok(!isSchaltLab({ app: 'SpiceLab' }));
});

test('Bauteile, Werte und Typen werden übernommen; nicht simulierbare Teile mit Hinweis ausgelassen', () => {
  const { data, notes } = fromSchaltLab(sample);
  const byId = Object.fromEntries(data.comps.map((c) => [c.id, c]));
  assert.equal(byId.c1.type, 'rail');
  assert.equal(byId.c1.params.voltage, 5);
  assert.equal(byId.c2.params.value, 150);
  assert.equal(byId.c3.params.type, 'gruen');
  assert.equal(byId.c4.type, 'groundRail');
  assert.equal(byId.c6.type, 'phototransistor', 'SFH 300 gezeichnet als NPN wird Fototransistor');
  assert.equal(byId.c8.type, 'zdiode');
  assert.equal(byId.c8.params.type, '5V1');
  assert.equal(byId.c9.params.closed, true);
  assert.equal(byId.c10.params.value, 4700);
  assert.equal(byId.c10.label, 'R2', 'doppelte Bezeichnung wird ersetzt');
  assert.equal(byId.c5, undefined, 'Schiene ohne Spannung ausgelassen');
  assert.equal(byId.c7, undefined, 'Mikrocontroller ausgelassen');
  assert.equal(data.n, 13);
  for (const pattern of [/ADC \(GPIO34\)/, /T1.*Fototransistor SFH 300/, /Mikrocontroller/, /R1 kam doppelt vor/]) {
    assert.ok(notes.some((n) => pattern.test(n)), `Hinweis ${pattern} fehlt: ${notes.join(' | ')}`);
  }
});

test('übernommene Schaltung lässt sich simulieren: LED grün an 5 V über 150 Ω', () => {
  const doc = new SchematicDocument(fromSchaltLab(sample).data);
  const r = operatingPoint(buildNetlist(doc).netlist);
  assert.ok(r.elements.D1.I > 0.015 && r.elements.D1.I < 0.025, `I = ${r.elements.D1.I}`);
});
