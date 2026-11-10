// Erzeugt die ngspice-Referenzen für den Abgleich (Phase 5).
//
// Aufruf:  node tools/ngspice/make-references.mjs [id …]
// Voraussetzung: ngspice im Suchpfad (macOS: brew install ngspice). Die Tests selbst brauchen ngspice
// nicht – sie lesen die hier erzeugten Dateien tests/reference/fixtures/<id>.json.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from '../../tests/reference/cases.js';
import { toSpice } from './to-spice.mjs';

const FIXTURES = fileURLToPath(new URL('../../tests/reference/fixtures/', import.meta.url));
const GRID = 1000; // Zeitverläufe werden auf so viele gleichmäßige Punkte gebracht

/** SpiceLab-Messpunkt → ngspice-Vektor ('i(V1)' → 'i(vv1)'). */
export function spiceProbe(probe) {
  const m = /^i\((.+)\)$/.exec(probe);
  return (m ? `i(v${m[1]})` : probe).toLowerCase();
}

function analysisLine(a) {
  if (a.type === 'dc') return `dc v${a.source} ${a.from} ${a.to} ${a.step}`;
  return `tran ${a.step} ${a.stopTime} 0 ${a.maxStep}${a.useInitialConditions ? ' uic' : ''}`;
}

function runCase(c, dir) {
  const out = join(dir, `${c.id}.txt`);
  const deck = [
    `* ${c.title}`,
    ...toSpice(c.netlist),
    '.control',
    'set wr_singlescale',
    'set wr_vecnames',
    analysisLine(c.analysis),
    `wrdata ${out} ${c.probes.map(spiceProbe).join(' ')}`,
    '.endc',
    '.end',
  ].join('\n');
  const file = join(dir, `${c.id}.cir`);
  writeFileSync(file, deck);
  execFileSync('ngspice', ['-b', file], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

  const [header, ...rows] = readFileSync(out, 'utf8').trim().split('\n');
  const names = header.trim().split(/\s+/);
  const data = rows.map((r) => r.trim().split(/\s+/).map(Number));
  const x = data.map((r) => r[0]);
  const columns = c.probes.map((p) => {
    const k = names.indexOf(spiceProbe(p));
    if (k < 0) throw new Error(`${c.id}: Messpunkt ${p} fehlt in der ngspice-Ausgabe (${names.join(', ')})`);
    return data.map((r) => r[k]);
  });

  if (c.analysis.type === 'dc') return { x, probes: Object.fromEntries(c.probes.map((p, i) => [p, columns[i]])) };
  // Zeitverlauf: auf ein gleichmäßiges Raster interpolieren
  const grid = Array.from({ length: GRID }, (_, i) => (i * c.analysis.stopTime) / (GRID - 1));
  const resample = (ys) => grid.map((t) => interpolate(x, ys, t));
  return { x: grid, probes: Object.fromEntries(c.probes.map((p, i) => [p, resample(columns[i])])) };
}

function interpolate(xs, ys, t) {
  if (t <= xs[0]) return ys[0];
  let k = xs.findIndex((v) => v >= t);
  if (k < 0) return ys.at(-1);
  if (xs[k] === t) return ys[k];
  const f = (t - xs[k - 1]) / (xs[k] - xs[k - 1]);
  return ys[k - 1] + f * (ys[k] - ys[k - 1]);
}

const version = execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0] ?? 'ngspice';
const only = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'spicelab-ref-'));
mkdirSync(FIXTURES, { recursive: true });
try {
  for (const c of CASES) {
    if (only.length && !only.includes(c.id)) continue;
    const result = runCase(c, dir);
    const fixture = { id: c.id, title: c.title, generator: version, analysis: c.analysis, ...result };
    writeFileSync(join(FIXTURES, `${c.id}.json`), `${JSON.stringify(fixture)}\n`);
    console.log(`✔ ${c.id} (${result.x.length} Punkte)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
