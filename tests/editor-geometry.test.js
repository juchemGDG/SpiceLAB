// Schaltzeichen und Geometrie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, symbolBounds } from '../app/js/editor/symbols.js';
import { toWorld, toSymbol, pinPositions, pinDirection, onSegment, snap } from '../app/js/editor/geometry.js';

test('alle Anschlüsse liegen auf dem 20er-Raster und haben eindeutige Namen', () => {
  for (const [id, sym] of Object.entries(SYMBOLS)) {
    for (const p of sym.pins) {
      assert.ok(p.x % 20 === 0 && p.y % 20 === 0, `${id}: Anschluss ${p.name} bei (${p.x}, ${p.y})`);
      assert.ok(['W', 'E', 'N', 'S'].includes(p.d), `${id}: Richtung ${p.d}`);
    }
    assert.equal(new Set(sym.pins.map((p) => p.name)).size, sym.pins.length, `${id}: doppelte Anschlussnamen`);
  }
});

test('Grenzen enthalten alle Anschlüsse', () => {
  for (const [id, sym] of Object.entries(SYMBOLS)) {
    const b = symbolBounds(sym);
    for (const p of sym.pins) assert.ok(p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h, id);
  }
});

test('Drehen um 90° (Uhrzeigersinn im Bild), Spiegeln, Umkehrung', () => {
  const c = { x: 100, y: 200, rot: 90, mir: false };
  assert.deepEqual(toWorld(c, [40, 0]), [100, 240]); // rechts → unten
  assert.deepEqual(toWorld({ ...c, rot: 0, mir: true }, [40, 0]), [60, 200]);
  for (const rot of [0, 90, 180, 270]) {
    for (const mir of [false, true]) {
      const comp = { x: 20, y: -40, rot, mir };
      const back = toSymbol(comp, toWorld(comp, [40, -20]));
      assert.ok(Math.abs(back[0] - 40) < 1e-12 && Math.abs(back[1] + 20) < 1e-12, `rot ${rot}, mir ${mir}`);
    }
  }
});

test('Anschlüsse und Abgangsrichtung drehen mit', () => {
  const pins = pinPositions({ x: 0, y: 0, rot: 90 }, SYMBOLS.resistor);
  assert.deepEqual(pins.map((p) => [p.x, p.y, p.d]), [[0, -40, 'N'], [0, 40, 'S']]);
  assert.equal(pinDirection({ x: 0, y: 0, rot: 0, mir: true }, { d: 'W' }), 'E');
});

test('Punkt auf Strecke, Raster', () => {
  assert.ok(onSegment([20, 0], [0, 0], [40, 0]));
  assert.ok(!onSegment([20, 1], [0, 0], [40, 0]));
  assert.ok(onSegment([0, 40], [0, 0], [0, 40]));
  assert.deepEqual(snap([31, -9]), [40, 0]);
});
