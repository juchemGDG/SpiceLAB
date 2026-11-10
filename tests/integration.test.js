// Integrationsverfahren und Fehlerschätzung an Funktionen, deren Ableitungen man kennt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChargeHistory, integrationCoefficient } from '../app/js/engine/integration.js';
import { SIM_DEFAULTS } from '../app/js/engine/newton.js';

function ctxFor(order, h) {
  return { order, ag0: integrationCoefficient(order, h), deltaOld: [h, h, h], options: SIM_DEFAULTS };
}

/** Integriert q(t) mit fester Schrittweite und liefert die Historie nach n Schritten. */
function run(q, dq0, order, h, n) {
  const hist = new ChargeHistory();
  hist.init(q(0), dq0);
  const ctx = ctxFor(order, h);
  for (let k = 1; k <= n; k++) {
    hist.update(q(k * h), ctx);
    if (k < n) hist.accept();
  }
  return { hist, ctx };
}

test('Trapez ist für q = t² exakt (dq/dt = 2t)', () => {
  const { hist } = run((t) => t * t, 0, 2, 0.1, 10);
  assert.ok(Math.abs(hist.dqNow - 2) < 1e-12, `dq = ${hist.dqNow}`);
});

test('Euler rückwärts hat bei q = t² den Fehler h', () => {
  const { hist } = run((t) => t * t, 0, 1, 0.1, 10);
  assert.ok(Math.abs(hist.dqNow - (2 - 0.1)) < 1e-12, `dq = ${hist.dqNow}`);
});

test('Fehlerschätzung Trapez: dritte dividierte Differenz von t³ ist 1', () => {
  const h = 1e-3;
  const { hist, ctx } = run((t) => t ** 3, 0, 2, h, 10);
  const { reltol, abstol, chgtol, trtol } = SIM_DEFAULTS;
  const tol = Math.max(
    abstol + reltol * Math.max(Math.abs(hist.dqNow), Math.abs(hist.dq)),
    (reltol * Math.max(Math.abs(hist.qNow), Math.abs(hist.q[0]), chgtol)) / h,
  );
  const expected = Math.sqrt((trtol * tol) / (1 / 12));
  const step = hist.truncationStep(ctx);
  assert.ok(Math.abs(step - expected) < 1e-6 * expected, `${step} ≠ ${expected}`);
});

test('linearer Verlauf: kein Abschneidefehler → sehr große erlaubte Schrittweite', () => {
  const { hist, ctx } = run((t) => 3 * t, 3, 2, 1e-3, 10);
  assert.ok(hist.truncationStep(ctx) > 1e3);
});

test('stärker gekrümmter Verlauf erlaubt kleinere Schritte', () => {
  const smooth = run((t) => Math.exp(-t), -1, 2, 1e-3, 10);
  const steep = run((t) => Math.exp(-100 * t), -100, 2, 1e-3, 10);
  assert.ok(steep.hist.truncationStep(steep.ctx) < smooth.hist.truncationStep(smooth.ctx));
});
