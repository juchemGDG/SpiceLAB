// Fototransistor und Summer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchematicDocument } from '../app/js/editor/document.js';
import { simulate, annotationsSVG } from '../app/js/ui/results.js';
import { sweepSources, characteristic } from '../app/js/ui/curve-data.js';
import { fromSchaltLab } from '../app/js/ui/schaltlab-import.js';

/** 5 V – 4,7 kΩ – Fototransistor (C oben) – Masse. */
function lightMeter(lux) {
  const d = new SchematicDocument();
  const u = d.addComponent('powerSupply', 0, 0);
  d.setParams(u.id, { voltage: 5 });
  d.rotateComponents([u.id]);
  const r = d.addComponent('resistor', 100, -40);
  d.setParams(r.id, { value: 4700 });
  const t = d.addComponent('phototransistor', 200, 0, ); // C (220,−40), E (220,40)
  d.setParams(t.id, { illuminance: lux });
  d.addWire([[0, -40], [60, -40]]);
  d.addWire([[140, -40], [220, -40]]);
  d.addWire([[220, 40], [0, 40]]);
  d.addComponent('gnd', 0, 40);
  return { d, t };
}

test('Fototransistor: Kollektorstrom steigt mit der Helligkeit, ≈ 0,8 mA bei 1000 lx (Richtwert), Sättigung bei viel Licht', () => {
  const ic = (lux) => {
    const { d, t } = lightMeter(lux);
    const sim = simulate(d);
    assert.ok(sim.ok, sim.message);
    return Math.abs(sim.result.elements[t.label].I);
  };
  assert.ok(ic(0) < 1e-6, 'dunkel: nur Dunkelstrom');
  assert.ok(Math.abs(ic(1000) - 0.8e-3) < 0.1e-3, `I_C(1000 lx) = ${ic(1000)}`);
  assert.ok(Math.abs(ic(500) / ic(1000) - 0.5) < 0.06, 'etwa linear');
  assert.ok(ic(100000) < 5 / 4700 * 1.01, 'am Vorwiderstand begrenzt (Sättigung)');
});

test('Kennlinienschreiber über der Beleuchtungsstärke (Lichtmessung)', () => {
  const { d, t } = lightMeter(500);
  const source = sweepSources(d).find((s) => s.comp.id === t.id);
  assert.equal(source.unit, 'lx');
  const c = characteristic(d, { sourceId: t.id, from: 0, to: 2000, points: 5, x: 'sweep', y: `I:${t.label}` });
  assert.deepEqual(c.x, [0, 500, 1000, 1500, 2000]);
  const i = c.y.map(Math.abs);
  assert.ok(i[4] > i[2] && i[2] > i[1] && i[1] > i[0]);
  assert.ok(Math.abs(i[2] - 0.8e-3) < 0.1e-3);
  assert.ok(c.marker && Math.abs(c.marker.x - 500) < 1e-9, 'Arbeitspunkt bei 500 lx');
});

/** Netzgerät → Summer (+ oben). */
function buzzer(voltage) {
  const d = new SchematicDocument();
  const u = d.addComponent('powerSupply', 0, 0);
  d.setParams(u.id, { voltage });
  d.rotateComponents([u.id]);
  const b = d.addComponent('buzzer', 100, 0);
  d.rotateComponents([b.id]); // + oben
  d.addWire([[0, -40], [100, -40]]);
  d.addWire([[0, 40], [100, 40]]);
  return d;
}

test('Summer: tönt ab 60 % der Nennspannung bei richtiger Polung, nicht bei falscher; Überspannung warnt', () => {
  const text = (v) => { const d = buzzer(v); return annotationsSVG(d, simulate(d).result, { showAll: true }).over; };
  assert.match(text(5), /♪ Ton/);
  assert.match(text(3.2), /♪ Ton/);
  assert.match(text(2), /kein Ton/);
  assert.match(text(-5), /falsch herum/);
  assert.match(text(9), /Überspannung/);
  assert.match(annotationsSVG(buzzer(5), simulate(buzzer(5)).result).under, /#a78bfa/, 'leuchtet violett wie ein Schallsymbol');
});

test('SchaltLab: NPN „SFH 300-3/4“ wird Fototransistor, Fototransistor-Karte ebenfalls', () => {
  const { data, notes } = fromSchaltLab({
    format: 'schaltplan-editor', comps: [
      { id: 'c1', type: 'npn', x: 40, y: 100, rot: 0, mir: 0, label: 'T1', value: 'SFH 300-3/4' },
      { id: 'c2', type: 'phototransistor', x: 200, y: 100, rot: 0, mir: 0, label: 'T2', value: 'BPW40' },
      { id: 'c3', type: 'npn', x: 300, y: 100, rot: 0, mir: 0, label: 'T3', value: 'BC547' },
    ], wires: [],
  });
  assert.deepEqual(data.comps.map((c) => c.type), ['phototransistor', 'phototransistor', 'npn']);
  assert.ok(notes.some((n) => /T1.*Fototransistor SFH 300/.test(n)));
  assert.ok(notes.some((n) => /BPW40.*SFH 300/.test(n)));
});
