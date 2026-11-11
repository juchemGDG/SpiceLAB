// Bauteilkatalog: jede Karte muss ein gültiges Symbol haben und für den Simulationskern brauchbare
// Elemente erzeugen – mit genau den Anschlussnamen des Symbols.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORIES, defaultParams } from '../app/js/editor/catalog.js';
import { SYMBOLS } from '../app/js/editor/symbols.js';
import { operatingPoint } from '../app/js/engine/dc.js';

test('Katalog: eindeutige Kennungen, bekannte Kategorien und Symbole', () => {
  assert.equal(new Set(CATALOG.map((e) => e.id)).size, CATALOG.length);
  for (const e of CATALOG) {
    assert.ok(CATEGORIES.includes(e.cat), `${e.id}: Kategorie ${e.cat}`);
    assert.ok(SYMBOLS[e.symbol], `${e.id}: Symbol ${e.symbol}`);
  }
});

for (const entry of CATALOG.filter((e) => e.id !== 'gnd')) {
  test(`${entry.name}: Voreinstellungen ergeben eine berechenbare Schaltung`, () => {
    const params = defaultParams(entry);
    const pinNames = SYMBOLS[entry.symbol].pins.map((p) => p.name);
    const used = new Set();
    const net = (pinName) => {
      assert.ok(pinNames.includes(pinName), `${entry.id}: Anschluss „${pinName}“ gibt es im Symbol nicht`);
      used.add(pinName);
      return `n_${pinName}`;
    };
    const elements = entry.elements(params, net, 'X1');
    assert.equal(used.size, pinNames.length, `${entry.id}: nicht alle Anschlüsse verwendet`);
    assert.equal(typeof entry.text(params), 'string');
    // jeden Anschluss über 1 kΩ an Masse legen, damit die Schaltung berechenbar ist
    const loads = pinNames.map((p, i) => ({ type: 'R', name: `RL${i}`, nodes: [`n_${p}`, '0'], value: 1000 }));
    // OPV braucht Versorgung
    const supply = entry.id === 'opamp' ? [{ type: 'V', name: 'VP', nodes: ['n_V+', '0'], value: 5 }] : [];
    const r = operatingPoint({ elements: [...elements, ...loads, ...supply] });
    assert.ok(Object.values(r.potentials).every(Number.isFinite));
  });
}
