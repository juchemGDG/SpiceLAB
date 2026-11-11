// Kennlinienschreiber: Diode, Widerstand, Z-Diode, LDR aus gezeichneten Schaltungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchematicDocument } from '../app/js/editor/document.js';
import { sweepSources, quantities, defaultAxes, characteristic } from '../app/js/ui/curve-data.js';
import { CircuitError } from '../app/js/engine/errors.js';

/** Netzgerät – Vorwiderstand – Bauteil (Diode/LED/Z-Diode/Widerstand) – Masse. */
function loop(type, params = {}, series = 100) {
  const d = new SchematicDocument();
  const u = d.addComponent('powerSupply', 0, 0);
  d.setParams(u.id, { voltage: 3 });
  d.rotateComponents([u.id]); // + (0,−40), − (0,40)
  const r = d.addComponent('resistor', 100, -40);
  d.setParams(r.id, { value: series });
  const x = d.addComponent(type, 200, 0);
  d.setParams(x.id, params);
  d.rotateComponents([x.id]);
  d.addWire([[0, -40], [60, -40]]);
  d.addWire([[140, -40], [200, -40]]);
  d.addWire([[0, 40], [200, 40]]);
  d.addComponent('gnd', 0, 40);
  return { d, u, x };
}

test('Quellen, Messgrößen und Voreinstellung', () => {
  const { d, x } = loop('diode');
  const sources = sweepSources(d);
  assert.deepEqual(sources.map((s) => s.name), ['U1']);
  const ids = quantities(d, sources[0]).map((q) => q.id);
  assert.deepEqual(ids, ['sweep', 'U:U1', 'I:U1', 'U:R1', 'I:R1', 'U:D1', 'I:D1']);
  assert.deepEqual(defaultAxes(d, sources[0]), { x: 'U:R1', y: 'I:R1' }, 'erstes Bauteil nach der Quelle');
  assert.ok(x);
});

test('Diodenkennlinie 1N4148 über 100 Ω: Knick bei etwa 0,6 V, Sperrrichtung ohne Strom', () => {
  const { d, u } = loop('diode');
  const c = characteristic(d, { sourceId: u.id, from: -3, to: 3, points: 61, x: 'U:D1', y: 'I:D1' });
  const at = (v) => c.y[c.x.findIndex((u) => u >= v)];
  assert.ok(Math.abs(at(-2)) < 1e-7, 'gesperrt (nur Sperrstrom im nA-Bereich)');
  assert.ok(at(0.5) < 1e-3 && at(0.7) > 1e-3, 'Knick zwischen 0,5 und 0,7 V');
  assert.ok(c.x.every((v) => v < 1), 'Diodenspannung bleibt unter 1 V');
  assert.deepEqual(c.marker && [Math.round(c.marker.x * 10), c.marker.y > 0.01], [Math.round(c.marker.x * 10), true], 'Arbeitspunkt bei 3 V');
});

test('Widerstandskennlinie: Gerade, Steigung 1/R; Quellenwert als x-Achse', () => {
  const { d, u } = loop('resistor', { value: 400 }, 100);
  const c = characteristic(d, { sourceId: u.id, from: 0, to: 5, points: 6, x: 'sweep', y: 'I:R2' });
  c.y.forEach((i, k) => assert.ok(Math.abs(i - c.x[k] / 500) <= 1e-4 * (c.x[k] / 500) + 1e-12)); // Netzgerät hat 0,01 Ω Innenwiderstand
  assert.deepEqual(c.x, [0, 1, 2, 3, 4, 5]);
});

test('Z-Diode: Durchbruch bei etwa −5,1 V (Messpunkt als Größe)', () => {
  const { d, u } = loop('zdiode', { type: '5V1' }, 100);
  d.addProbe(200, -40); // am Bauteil, oberer Anschluss (nach Drehen)
  const c = characteristic(d, { sourceId: u.id, from: -10, to: 0, points: 21, x: 'sweep', y: 'I:D1' });
  assert.ok(Math.abs(c.y[0]) > 0.04, 'bei −10 V fließt Durchbruchstrom');
  assert.ok(Math.abs(c.y.at(-1)) < 1e-6);
});

test('Fotowiderstand: Strom steigt mit der Beleuchtungsstärke', () => {
  const d = new SchematicDocument();
  const u = d.addComponent('powerSupply', 0, 0);
  d.rotateComponents([u.id]);
  const l = d.addComponent('ldr', 100, -40);
  d.addWire([[0, -40], [60, -40]]);
  d.addWire([[140, -40], [200, -40], [200, 40], [0, 40]]);
  d.addComponent('gnd', 0, 40);
  const src = sweepSources(d).find((s) => s.name === l.label);
  assert.equal(src.unit, 'lx');
  const c = characteristic(d, { sourceId: l.id, from: 1, to: 1000, points: 10, x: 'sweep', y: 'I:U1' });
  const i = c.y.map(Math.abs);
  assert.ok(i.every((v, k) => k === 0 || v > i[k - 1]));
});

test('Fehler: kein Bauteil gewählt, von = bis', () => {
  const { d, u } = loop('diode');
  assert.throws(() => characteristic(d, { sourceId: 'nix', from: 0, to: 1, x: 'sweep', y: 'I:D1' }), CircuitError);
  assert.throws(() => characteristic(d, { sourceId: u.id, from: 2, to: 2, x: 'sweep', y: 'I:D1' }), /verschiedene/);
});
