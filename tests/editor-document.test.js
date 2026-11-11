// Zeichnung und Netzliste: vom Schaltplan bis zum berechneten Ergebnis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchematicDocument, cleanPoints } from '../app/js/editor/document.js';
import { buildNetlist } from '../app/js/editor/netlist.js';
import { operatingPoint } from '../app/js/engine/dc.js';

/** Batterie (senkrecht, + oben) links, Widerstand (senkrecht) rechts, zwei Leitungen. */
function simpleCircuit() {
  const doc = new SchematicDocument();
  const bat = doc.addComponent('battery', 0, 0);
  doc.rotateComponents([bat.id]); // + jetzt oben bei (0, −40), − unten bei (0, 40)
  doc.setParams(bat.id, { type: 'block9V' });
  const r = doc.addComponent('resistor', 100, 0);
  doc.rotateComponents([r.id]);
  doc.addWire([[0, -40], [100, -40]]);
  doc.addWire([[0, 40], [100, 40]]);
  return { doc, bat, r };
}

test('Bezeichnungen werden fortlaufend vergeben', () => {
  const doc = new SchematicDocument();
  assert.equal(doc.addComponent('resistor', 0, 0).label, 'R1');
  assert.equal(doc.addComponent('resistor', 0, 0).label, 'R2');
  assert.equal(doc.addComponent('ldr', 0, 0).label, 'R3'); // gleiches Kürzel
  assert.equal(doc.addComponent('gnd', 0, 0).label, '');
});

test('einfacher Stromkreis: Batterie und Widerstand, ohne Massesymbol', () => {
  const { doc } = simpleCircuit();
  const built = buildNetlist(doc);
  assert.match(built.reference, /Bezugspunkt .* − von B1/);
  const r = operatingPoint(built.netlist);
  assert.ok(Math.abs(r.elements.R1.I - 9 / 1001.5) < 1e-9);
});

test('Massesymbol macht den Knoten zu 0 V', () => {
  const { doc } = simpleCircuit();
  doc.addComponent('gnd', 100, 40); // Anschluss des Massesymbols liegt auf der unteren Leitung
  const built = buildNetlist(doc);
  assert.equal(built.reference, null);
  const r = operatingPoint(built.netlist);
  const top = built.pinNets.get(doc.comps[1].id)['1'];
  assert.ok(Math.abs(r.potentials[top] - 9 * 1000 / 1001.5) < 1e-6);
});

test('T-Verbindung verbindet und bekommt einen Verbindungspunkt; Kreuzung verbindet nicht', () => {
  const doc = new SchematicDocument();
  // T: Leitung B endet mitten auf Leitung A
  doc.addWire([[0, 0], [200, 0]]);
  doc.addWire([[100, 0], [100, 100]]);
  const r1 = doc.addComponent('resistor', 140, 100); // Anschluss 1 bei (100, 100) = Ende von B
  const r2 = doc.addComponent('resistor', -40, 0); // Anschluss 2 bei (0, 0) = Anfang von A
  // Kreuzung: C senkrecht, D waagerecht, sie kreuzen sich bei (300, 0)
  doc.addWire([[300, -50], [300, 50]]);
  doc.addWire([[250, 0], [350, 0]]);
  const r3 = doc.addComponent('resistor', 300, 90);
  doc.rotateComponents([r3.id]); // Anschluss 1 bei (300, 50) = Ende von C
  const r4 = doc.addComponent('resistor', 390, 0); // Anschluss 1 bei (350, 0) = Ende von D
  const built = buildNetlist(doc);
  assert.deepEqual(built.junctions, [[100, 0]]);
  assert.equal(built.pinNets.get(r1.id)['1'], built.pinNets.get(r2.id)['2']);
  assert.notEqual(built.pinNets.get(r3.id)['1'], built.pinNets.get(r4.id)['1']);
});

test('Anschlüsse, die direkt aufeinanderliegen, sind verbunden; lose Bauteile werden übersprungen', () => {
  const doc = new SchematicDocument();
  const a = doc.addComponent('resistor', 0, 0); // Anschlüsse (−40, 0) und (40, 0)
  const b = doc.addComponent('resistor', 80, 0); // Anschlüsse (40, 0) und (120, 0)
  doc.addComponent('lamp', 500, 500); // hängt nirgends dran
  const built = buildNetlist(doc);
  assert.equal(built.pinNets.get(a.id)['2'], built.pinNets.get(b.id)['1']);
  assert.deepEqual(built.skipped, ['H1']);
});

test('Teil ohne Quelle wird übersprungen, zweiter Stromkreis mit eigener Batterie bekommt eigenen Bezug', () => {
  const { doc } = simpleCircuit();
  doc.addComponent('gnd', 100, 40);
  // Insel ohne Quelle: zwei Widerstände nur miteinander verbunden
  doc.addComponent('resistor', 800, 100);
  doc.addComponent('resistor', 800, 200);
  doc.addWire([[760, 100], [760, 200]]);
  doc.addWire([[840, 100], [840, 200]]);
  // zweiter Stromkreis ohne Masse: Batterie + Lampe
  const b2 = doc.addComponent('battery', 400, 400);
  doc.rotateComponents([b2.id]);
  doc.setParams(b2.id, { type: 'flat4V5' });
  const h = doc.addComponent('lamp', 600, 400);
  doc.rotateComponents([h.id]);
  doc.addWire([[400, 360], [600, 360]]);
  doc.addWire([[400, 440], [600, 440]]);
  const built = buildNetlist(doc);
  assert.deepEqual(built.isolated, ['R2', 'R3']);
  assert.match(built.reference, /− von B2/);
  const r = operatingPoint(built.netlist); // ohne Fehler „hängt in der Luft“
  assert.ok(r.elements.H1.I > 0.05);
  assert.ok(Math.abs(r.elements.R1.I - 9 / 1001.5) < 1e-9);
});

test('Transformator: die Sekundärseite bekommt einen eigenen Bezugspunkt', () => {
  const doc = new SchematicDocument();
  const src = doc.addComponent('sine', 0, 0);
  doc.rotateComponents([src.id]); // Anschluss 1 oben (0, −40), 2 unten (0, 40)
  doc.addComponent('gnd', 0, 40);
  doc.addComponent('transformer', 100, 0); // P1 (60, −40), P2 (60, 40), S1 (140, −40), S2 (140, 40)
  doc.addWire([[0, -40], [60, -40]]);
  doc.addWire([[0, 40], [60, 40]]);
  const r = doc.addComponent('resistor', 200, 0);
  doc.rotateComponents([r.id]); // (200, −40) und (200, 40)
  doc.addWire([[140, -40], [200, -40]]);
  doc.addWire([[140, 40], [200, 40]]);
  const built = buildNetlist(doc);
  assert.deepEqual(built.isolated, []);
  assert.ok(built.netlist.elements.some((e) => e.type === 'K'));
  assert.ok(built.pinNets.get(r.id)['2'] === '0' || built.pinNets.get(r.id)['1'] === '0', 'Sekundärseite hat Bezug');
  operatingPoint(built.netlist); // berechenbar
});

test('Drehen: angeschlossene Leitungen laufen mit und bleiben rechtwinklig', () => {
  const doc = new SchematicDocument();
  const r = doc.addComponent('resistor', 0, 0);
  const w = doc.addWire([[40, 0], [100, 0], [100, 100]]);
  doc.rotateComponents([r.id]); // Anschluss 2 wandert von (40, 0) nach (0, 40)
  assert.deepEqual(w.pts[0], [0, 40]);
  for (let i = 1; i < w.pts.length; i++) {
    const [a, b] = [w.pts[i - 1], w.pts[i]];
    assert.ok(a[0] === b[0] || a[1] === b[1], `schräges Stück ${a} → ${b}`);
  }
  assert.deepEqual(w.pts.at(-1), [100, 100]);
});

test('Verschieben mit gerader Leitung: Knick wird eingefügt', () => {
  const doc = new SchematicDocument();
  const r = doc.addComponent('resistor', 0, 0);
  const w = doc.addWire([[40, 0], [200, 0]]);
  doc.moveComponents([r.id], 0, 60);
  assert.deepEqual(w.pts, [[40, 60], [200, 60], [200, 0]]);
});

test('Rückgängig und Wiederholen', () => {
  const doc = new SchematicDocument();
  doc.addComponent('resistor', 0, 0);
  doc.commit();
  doc.addComponent('resistor', 100, 0);
  doc.commit();
  assert.equal(doc.comps.length, 2);
  doc.undo();
  assert.equal(doc.comps.length, 1);
  doc.redo();
  assert.equal(doc.comps.length, 2);
  assert.ok(!doc.commit(), 'ohne Änderung kein neuer Schritt');
});

test('Speichern und Laden ergibt dieselbe Zeichnung', () => {
  const { doc } = simpleCircuit();
  const copy = new SchematicDocument(JSON.parse(JSON.stringify(doc.toJSON())));
  assert.deepEqual(copy.toJSON(), doc.toJSON());
});

test('cleanPoints entfernt doppelte und gerade Zwischenpunkte', () => {
  assert.deepEqual(cleanPoints([[0, 0], [0, 0], [50, 0], [100, 0], [100, 50]]), [[0, 0], [100, 0], [100, 50]]);
});
