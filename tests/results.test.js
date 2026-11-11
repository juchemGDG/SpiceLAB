// Simulieren aus der Zeichnung: Arbeitspunkt, Zeitverlauf, Momentaufnahme, Messpunkte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchematicDocument } from '../app/js/editor/document.js';
import { simulate, snapshotAt, probeValues, sourceFrequencies, annotationsSVG } from '../app/js/ui/results.js';

/** RC-Glied: Netzgerät 5 V, 1 kΩ, 1 µF, Masse; Messpunkt am Kondensator. */
function rcCircuit() {
  const doc = new SchematicDocument();
  const u = doc.addComponent('powerSupply', 0, 0);
  doc.rotateComponents([u.id]); // + oben (0, −40), − unten (0, 40)
  const r = doc.addComponent('resistor', 100, -40); // (60, −40) – (140, −40)
  doc.setParams(r.id, { value: 1000 });
  const c = doc.addComponent('capacitor', 200, 0);
  doc.rotateComponents([c.id]); // (200, −40) – (200, 40)
  doc.setParams(c.id, { value: 1e-6 });
  doc.addWire([[0, -40], [60, -40]]);
  doc.addWire([[140, -40], [200, -40]]);
  doc.addWire([[0, 40], [200, 40]]);
  doc.addComponent('gnd', 0, 40);
  doc.addProbe(200, -40);
  return doc;
}

test('Arbeitspunkt: Kondensator voll geladen, Messpunkt zeigt 5 V', () => {
  const doc = rcCircuit();
  const sim = simulate(doc);
  assert.ok(sim.ok);
  assert.equal(probeValues(doc, sim).get(doc.probes[0].id), '5 V');
});

test('Zeitverlauf mit entladenem Kondensator: Ladekurve, Momentaufnahme bei τ', () => {
  const doc = rcCircuit();
  const sim = simulate(doc, { stopTime: 5e-3, discharged: true });
  assert.ok(sim.ok, sim.message);
  const net = sim.built.probeNets.get(doc.probes[0].id);
  const atTau = snapshotAt(sim.transient, 1e-3).potentials[net];
  assert.ok(Math.abs(atTau - 5 * (1 - Math.exp(-1))) < 0.01, `u(τ) = ${atTau}`);
  assert.ok(Math.abs(sim.result.potentials[net] - 5 * (1 - Math.exp(-5))) < 0.01, 'Ergebnis = Ende des Verlaufs');
});

test('Messgeräte: Strommesser in Reihe, Spannungsmesser parallel – Anzeige immer, mit Innenwiderständen', () => {
  // Netzgerät 10 V – Strommesser – Widerstand 1 kΩ – zurück; Spannungsmesser parallel zum Widerstand
  const doc = new SchematicDocument();
  const u = doc.addComponent('powerSupply', 0, 0);
  doc.setParams(u.id, { voltage: 10 });
  doc.rotateComponents([u.id]); // + oben (0, −40), − unten (0, 40)
  doc.addComponent('ammeter', 100, -40); // + (60, −40), − (140, −40)
  const r = doc.addComponent('resistor', 200, 0);
  doc.rotateComponents([r.id]); // (200, −40) – (200, 40)
  const v = doc.addComponent('voltmeter', 300, 0);
  doc.rotateComponents([v.id]); // + oben (300, −40), − unten (300, 40)
  doc.addWire([[0, -40], [60, -40]]);
  doc.addWire([[140, -40], [300, -40]]);
  doc.addWire([[0, 40], [300, 40]]);
  const sim = simulate(doc);
  assert.ok(sim.ok, sim.message);
  const { over } = annotationsSVG(doc, sim.result);
  // 10 V / (1 kΩ ∥ 10 MΩ + 0,1 Ω + 0,01 Ω) ≈ 10,001 mA; Spannung am Widerstand ≈ 9,999 V
  assert.match(over, />10 mA</);
  assert.match(over, />10 V</);
});

test('Strommesser parallel zur Quelle: Warnung', () => {
  const doc = new SchematicDocument();
  const u = doc.addComponent('powerSupply', 0, 0);
  doc.rotateComponents([u.id]);
  const a = doc.addComponent('ammeter', 100, 0);
  doc.rotateComponents([a.id]);
  doc.addWire([[0, -40], [100, -40]]);
  doc.addWire([[0, 40], [100, 40]]);
  const sim = simulate(doc);
  assert.match(annotationsSVG(doc, sim.result).over, /Strommesser parallel geschaltet/);
});

test('Frequenzen der Quellen für die Zeitbasis', () => {
  const doc = new SchematicDocument();
  doc.addComponent('sine', 0, 0);
  const sq = doc.addComponent('square', 0, 100);
  doc.setParams(sq.id, { frequency: 2000 });
  assert.deepEqual(sourceFrequencies(doc), [50, 2000]);
});
