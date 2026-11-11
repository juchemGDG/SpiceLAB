import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchematic } from '../app/js/ui/files.js';
import { SchematicDocument } from '../app/js/editor/document.js';

test('gespeicherte Schaltung wird wieder eingelesen', () => {
  const doc = new SchematicDocument();
  doc.addComponent('resistor', 0, 0);
  doc.addWire([[40, 0], [100, 0]]);
  const data = parseSchematic(JSON.stringify(doc.toJSON()));
  assert.deepEqual(new SchematicDocument(data).toJSON(), doc.toJSON());
});

test('fehlende Einstellungen älterer Dateien werden ergänzt', () => {
  const data = parseSchematic(JSON.stringify({ app: 'SpiceLab', version: 1, comps: [{ id: 'c1', type: 'resistor', label: 'R1', x: 0, y: 0, params: {} }], wires: [] }));
  assert.equal(data.comps[0].params.value, 1000);
});

test('verständliche Fehler bei falschen Dateien', () => {
  assert.throws(() => parseSchematic('kein json'), /kein gültiges JSON/);
  assert.throws(() => parseSchematic('{"comps": []}'), /keine SpiceLab-Schaltung/);
  assert.throws(() => parseSchematic(JSON.stringify({ app: 'SpiceLab', comps: [{ type: 'flux' }], wires: [] })), /Unbekannte Bauteile in der Datei: flux/);
});
