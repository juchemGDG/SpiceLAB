// Bedienungstests: Zeichnen, Eigenschaften, Simulieren, Messpunkte, Schalter, Oszilloskop, Dateien, Export.
// Aufruf: npm run uitest   (braucht Chrome; siehe browser.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './browser.mjs';

let page;
before(async () => { page = await openApp(); });
after(() => page?.close());

/** Zeichnung leeren (ohne Nachfrage). */
const fresh = () => page.app(`app.doc.load({ comps: [], wires: [], probes: [], n: 0 }); app.live = false; app.sim = null;
  app.underlay = ''; app.annotations = ''; app.probeValues = new Map(); app.highlight = new Set(); app.ui.selection = new Set(); app.render();`);

const card = (name) => page.eval(`(() => { const c = [...document.querySelectorAll('.palette-card')].find((k) => k.querySelector('.palette-name').textContent === ${JSON.stringify(name)}); c.scrollIntoView(); const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

test('Bauteile aus der Leiste ziehen, drehen und mit Leitungen verbinden (Leitung führt um die LED herum)', async () => {
  await fresh();
  for (const [name, x, y] of [['Batterie / Akku', 200, 200], ['Widerstand', 400, 200], ['LED', 400, 300]]) {
    await page.drag(...(await card(name)), ...(await page.screen(x, y)));
    await page.key('r', 'KeyR');
  }
  const wire = async (a, b) => page.drag(...(await page.screen(...a)), ...(await page.screen(...b)), 12);
  await wire([200, 160], [400, 160]);
  await wire([400, 240], [400, 260]);
  await wire([400, 340], [200, 240]);
  const state = await page.app(`const { buildNetlist } = await import('/js/editor/netlist.js'); const n = buildNetlist(app.doc);
    const net = (label, pin) => n.pinNets.get(app.doc.comps.find((c) => c.label === label).id)[pin];
    return { wires: app.doc.wires.map((w) => w.pts), loop: [net('B1', '+') === net('R1', '1'), net('R1', '2') === net('D1', 'A'), net('D1', 'K') === net('B1', '−')] };`);
  assert.deepEqual(state.loop, [true, true, true], 'geschlossener Stromkreis B1 → R1 → D1 → B1');
  assert.deepEqual(state.wires[2], [[400, 340], [400, 360], [200, 360], [200, 240]]);
  assert.deepEqual(page.errors, []);
});

test('Eigenschaften-Dialog: Fehleingabe wird abgelehnt, 4k7 übernommen', async () => {
  await fresh();
  await page.app(`app.doc.addComponent('resistor', 200, 100); app.doc.commit(); app.render();`);
  await page.dblclick(...(await page.screen(200, 100)));
  await page.sleep(80);
  const setValue = (v) => page.eval(`(() => { const i = document.querySelectorAll('.dlg input')[1]; i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input')); document.querySelector('.dlg-btn.primary').click(); })()`);
  await setValue('4,7x');
  assert.ok(await page.eval(`!!document.querySelector('.overlay')`), 'Dialog bleibt bei Fehleingabe offen');
  await setValue('4k7');
  await page.sleep(80);
  assert.equal(await page.app(`return app.doc.comps[0].params.value`), 4700);
});

/** Dämmerungsschalter (LDR, BC547B, LED) mit Masse. */
const twilight = (lux) => page.app(`
  const d = app.doc;
  const bat = d.addComponent('battery', 100, 260); d.rotateComponents([bat.id]);
  const r1 = d.addComponent('resistor', 240, 160); d.rotateComponents([r1.id]); d.setParams(r1.id, { value: 47000 });
  const ldr = d.addComponent('ldr', 240, 340); d.rotateComponents([ldr.id]); d.setParams(ldr.id, { illuminance: ${lux} });
  const rb = d.addComponent('resistor', 320, 260); d.setParams(rb.id, { value: 10000 });
  d.addComponent('npn', 400, 260);
  const rv = d.addComponent('resistor', 420, 60); d.rotateComponents([rv.id]); d.setParams(rv.id, { value: 330 });
  const led = d.addComponent('led', 420, 160); d.rotateComponents([led.id]);
  d.addWire([[100, 220], [100, 20], [420, 20]]); d.addWire([[240, 120], [240, 20]]); d.addWire([[240, 200], [240, 300]]);
  d.addWire([[280, 260], [240, 260]]); d.addWire([[420, 100], [420, 120]]); d.addWire([[420, 200], [420, 220]]);
  d.addWire([[100, 300], [100, 420], [420, 420], [420, 300]]); d.addWire([[240, 380], [240, 420]]);
  d.addComponent('gnd', 100, 420); d.commit(); app.view.fit(d); app.render();`);

test('Simulieren mit Messpunkten: Potenziale, Hinweis beim Überfahren, keine Zahlen an Bauteilen', async () => {
  await fresh();
  await twilight(2);
  await page.eval(`document.getElementById('btn-simulate').click()`);
  assert.equal(await page.eval(`document.querySelectorAll('#svg text[font-weight=bold]').length`), 0);
  await page.key('p', 'KeyP');
  await page.click(...(await page.screen(243, 230)));
  await page.click(...(await page.screen(420, 210)));
  await page.key('Escape', 'Escape');
  const values = await page.app(`return app.doc.probes.map((p) => app.probeValues.get(p.id))`);
  assert.deepEqual(values, ['1,71 V', '180 mV']);
  await page.hover(...(await page.screen(405, 262)));
  const tip = await page.eval(`[...document.querySelectorAll('#svg g[pointer-events=none] text')].map((t) => t.textContent)`);
  assert.deepEqual(tip, ['T1 – NPN-Transistor', 'U_CE = 180 mV', 'I_C = 20,6 mA']);
  await page.eval(`document.getElementById('btn-values').click()`);
  assert.ok(await page.eval(`document.querySelectorAll('#svg text[font-weight=bold]').length`) > 10);
  await page.eval(`document.getElementById('btn-values').click()`);
});

test('Schalter in der Simulation umschalten, Taster nur solange gedrückt', async () => {
  await fresh();
  await page.app(`const d = app.doc;
    const bat = d.addComponent('battery', 100, 200); d.rotateComponents([bat.id]);
    d.addComponent('switch', 200, 160); d.addComponent('button', 200, 80);
    const r = d.addComponent('resistor', 360, 200); d.rotateComponents([r.id]); d.setParams(r.id, { value: 330 });
    const led = d.addComponent('led', 360, 300); d.rotateComponents([led.id]);
    d.addWire([[100, 160], [160, 160]]); d.addWire([[240, 160], [360, 160]]); d.addWire([[160, 160], [160, 80]]); d.addWire([[240, 80], [240, 160]]);
    d.addWire([[360, 240], [360, 260]]); d.addWire([[360, 340], [360, 360], [100, 360], [100, 240]]);
    d.addComponent('gnd', 100, 360); d.addProbe(360, 250); d.commit(); app.render();`);
  await page.eval(`document.getElementById('btn-simulate').click()`);
  const probe = () => page.app(`return app.probeValues.get(app.doc.probes[0].id)`);
  const off = await probe();
  await page.click(...(await page.screen(200, 160)));
  const on = await probe();
  assert.notEqual(on, off, 'Schalter geschlossen ändert das Potenzial');
  await page.click(...(await page.screen(200, 160)));
  assert.equal(await probe(), off);
  assert.equal(await page.eval(`!!document.querySelector('.overlay')`), false, 'schnelles Umschalten öffnet keinen Dialog');
  const [tx, ty] = await page.screen(200, 75);
  await page.mouse('mousePressed', tx, ty);
  await page.sleep(40);
  assert.equal(await probe(), on, 'Taster gedrückt');
  await page.mouse('mouseReleased', tx, ty);
  await page.sleep(40);
  assert.equal(await probe(), off, 'Taster losgelassen');
});

test('Oszilloskop: RC-Glied an Rechteckspannung, Zeitlupe, Neuberechnung nach Änderung', async () => {
  await fresh();
  await page.app(`const d = app.doc;
    const u = d.addComponent('square', 0, 0); d.rotateComponents([u.id]); d.setParams(u.id, { frequency: 100 });
    d.addComponent('resistor', 100, -40);
    const c = d.addComponent('capacitor', 200, 0); d.rotateComponents([c.id]); d.setParams(c.id, { value: 1e-6 });
    d.addWire([[0, -40], [60, -40]]); d.addWire([[140, -40], [200, -40]]); d.addWire([[0, 40], [200, 40]]);
    d.addComponent('gnd', 0, 40); d.addProbe(40, -40); d.addProbe(200, -40); d.commit(); app.view.fit(d); app.render();`);
  await page.eval(`document.getElementById('btn-scope').click()`);
  await page.sleep(300);
  assert.match(await page.text('#status'), /Zeitverlauf über 50 ms berechnet/);
  const r = await page.eval(`(() => { const r = document.querySelector('#scope canvas').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height / 2]; })()`);
  await page.hover(...r);
  assert.match(await page.eval(`document.querySelector('.scope-readout').innerText`), /t = 25 ms[\s\S]*B: 4,97 V/);
  await page.app(`app.doc.setParams(app.doc.comps[2].id, { value: 4.7e-6 }); app.doc.commit(); app.render();`);
  await page.sleep(400);
  assert.match(await page.eval(`document.querySelector('.scope-readout').innerText`), /B: 3,71 V/);
  await page.eval(`document.getElementById('btn-scope').click()`);
});

test('Speichern, Neu mit Nachfrage, Laden; Kopieren und Einfügen; Bildexport', async () => {
  await fresh();
  await page.app(`const r = app.doc.addComponent('resistor', 100, 100); app.doc.commit(); app.ui.selection = new Set([r.id]); app.render();`);
  await page.key('c', 'KeyC', { modifiers: 4 });
  await page.key('v', 'KeyV', { modifiers: 4 });
  assert.deepEqual(await page.app(`return app.doc.comps.map((c) => c.label)`), ['R1', 'R2']);

  await page.eval(`(() => { window.__files = []; const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__files.push(blob); return orig(blob); };
    HTMLAnchorElement.prototype.click = function () { window.__names = (window.__names || []).concat(this.download); }; })()`);
  for (const id of ['btn-save', 'btn-svg', 'btn-png']) await page.eval(`document.getElementById('${id}').click()`);
  await page.sleep(300);
  assert.deepEqual(await page.eval('window.__names'), ['Neue Schaltung.spicelab.json', 'Neue Schaltung.svg', 'Neue Schaltung.png']);
  assert.equal(await page.eval(`window.__files[2].type`), 'image/png');

  await page.app(`app.doc.addComponent('lamp', 300, 100); app.doc.commit(); app.render();`);
  await page.eval(`document.getElementById('btn-new').click()`);
  await page.sleep(50);
  assert.equal(await page.text('.dlg h2'), 'Änderungen verwerfen?');
  await page.eval(`[...document.querySelectorAll('.dlg-btn')].find((b) => b.textContent === 'Verwerfen').click()`);
  await page.sleep(50);
  await page.eval(`document.getElementById('btn-load').click()`);
  await page.sleep(50);
  await page.eval(`(async () => { const input = document.getElementById('file-in'); const dt = new DataTransfer();
    dt.items.add(new File([await window.__files[0].text()], 'Versuch 1.spicelab.json')); input.files = dt.files; input.onchange(); })()`);
  await page.sleep(150);
  assert.deepEqual(await page.app(`return app.doc.comps.map((c) => c.label)`), ['R1', 'R2']);
  assert.equal(await page.text('#breadcrumb'), 'Versuch 1');
  assert.deepEqual(page.errors, []);
});
