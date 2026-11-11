// Jede Beispielschaltung muss sich ohne Hinweise auf lose Bauteile simulieren lassen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../app/js/ui/examples.js';
import { simulate, probeValues } from '../app/js/ui/results.js';

for (const ex of EXAMPLES) {
  test(`Beispiel „${ex.title}“`, () => {
    const doc = ex.build();
    const sim = simulate(doc);
    assert.ok(sim.ok, sim.message);
    assert.deepEqual(sim.built.skipped, [], 'keine losen Bauteile');
    assert.deepEqual(sim.built.isolated, [], 'keine Teile ohne Quelle');
    for (const [, v] of probeValues(doc, sim)) assert.notEqual(v, '–', 'Messpunkt liegt auf einer Leitung');
    if (ex.scope) {
      const tran = simulate(doc, { stopTime: 0.4, discharged: true });
      assert.ok(tran.ok, tran.message);
    }
  });
}

test('Lampen: Reihenschaltung bekommt etwa halb so viel Spannung je Lampe wie die Parallelschaltung', () => {
  const doc = EXAMPLES.find((e) => e.id === 'lamps').build();
  const sim = simulate(doc);
  const lamps = doc.comps.filter((c) => c.type === 'lamp').map((c) => Math.abs(sim.result.elements[c.label].U));
  assert.ok(Math.abs(lamps[0] - lamps[2] / 2) < 0.1, `Reihe ${lamps[0]} V, parallel ${lamps[2]} V`);
  const meters = doc.comps.filter((c) => c.type === 'ammeter').map((c) => Math.abs(sim.result.elements[c.label].I));
  assert.ok(meters[1] > 2.5 * meters[0], `Strom parallel ${meters[1]} A, Reihe ${meters[0]} A`);
});
