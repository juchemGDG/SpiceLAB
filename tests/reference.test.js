// Abgleich mit ngspice: SpiceLab rechnet die Vergleichsschaltungen aus tests/reference/cases.js und
// vergleicht mit den gespeicherten ngspice-Ergebnissen (tests/reference/fixtures).
// Neu erzeugen: node tools/ngspice/make-references.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CASES } from './reference/cases.js';
import { dcSweep } from '../app/js/engine/sweep.js';
import { transient, valueAt } from '../app/js/engine/transient.js';

const fixturePath = (id) => new URL(`./reference/fixtures/${id}.json`, import.meta.url);

/** Messwert aus einem SpiceLab-Ergebnis: 'v(knoten)' oder 'i(QUELLE)'. */
function series(result, probe) {
  const v = /^v\((.+)\)$/.exec(probe);
  if (v) return result.potentials[v[1]];
  const i = /^i\((.+)\)$/.exec(probe);
  return result.elements[i[1]].I;
}

function runSpiceLab(c, fixture) {
  const a = c.analysis;
  if (a.type === 'dc') {
    const r = dcSweep(c.netlist, { element: a.source, values: fixture.x });
    return Object.fromEntries(c.probes.map((p) => [p, Array.from(series(r, p))]));
  }
  const { type, ...settings } = a;
  const r = transient(c.netlist, settings);
  return Object.fromEntries(c.probes.map((p) => [p, fixture.x.map((t) => valueAt(r.time, series(r, p), t))]));
}

function risingCrossings(time, values, threshold, after) {
  const t = [];
  for (let k = 1; k < values.length; k++) {
    if (time[k] > after && values[k - 1] < threshold && values[k] >= threshold) {
      t.push(time[k - 1] + ((threshold - values[k - 1]) / (values[k] - values[k - 1])) * (time[k] - time[k - 1]));
    }
  }
  return t;
}
const meanPeriod = (edges) => (edges.at(-1) - edges[0]) / (edges.length - 1);

/** Vergleich eines Messpunkts; liefert eine Kennzahl für den Bericht. */
function compare(c, probe, ours, ref, x) {
  const tol = c.tolerance;
  if (c.analysis.type === 'dc') {
    const abs = probe.startsWith('i(') ? tol.absI : tol.absV;
    let worst = 0;
    ref.forEach((r, k) => {
      const err = Math.abs(ours[k] - r);
      const allowed = tol.rel * Math.abs(r) + abs;
      worst = Math.max(worst, err / allowed);
      assert.ok(err <= allowed, `${probe} bei ${x[k]}: SpiceLab ${ours[k]}, ngspice ${r}`);
    });
    return `${probe}: größte Abweichung ${(worst * 100).toFixed(0)} % der Toleranz`;
  }
  if (tol.period) {
    const { threshold, rel, after } = tol.period;
    const pOurs = meanPeriod(risingCrossings(x, ours, threshold, after));
    const pRef = meanPeriod(risingCrossings(x, ref, threshold, after));
    assert.ok(Math.abs(pOurs / pRef - 1) <= rel, `Periode SpiceLab ${pOurs}, ngspice ${pRef}`);
    return `Periode: SpiceLab ${pOurs.toFixed(4)} s, ngspice ${pRef.toFixed(4)} s`;
  }
  const span = Math.max(...ref) - Math.min(...ref) || 1;
  const rms = Math.sqrt(ref.reduce((s, r, k) => s + (ours[k] - r) ** 2, 0) / ref.length);
  const nrmse = rms / span;
  assert.ok(nrmse <= tol.nrmse, `${probe}: Abweichung ${(nrmse * 100).toFixed(3)} % der Spannweite (erlaubt ${tol.nrmse * 100} %)`);
  return `${probe}: Abweichung ${(nrmse * 100).toFixed(3)} % der Spannweite`;
}

for (const c of CASES) {
  const path = fixturePath(c.id);
  test(`ngspice-Abgleich: ${c.title}`, { skip: !existsSync(path) && 'Referenz fehlt (make-references.mjs)' }, (t) => {
    const fixture = JSON.parse(readFileSync(path, 'utf8'));
    const ours = runSpiceLab(c, fixture);
    const probes = c.tolerance.period ? [c.tolerance.period.probe] : c.probes;
    for (const p of probes) t.diagnostic(compare(c, p, ours[p], fixture.probes[p], fixture.x));
  });
}
