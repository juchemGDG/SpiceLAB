// SchaltLab-Dateien (format: 'schaltplan-editor') in SpiceLab übernehmen.
//
// SchaltLab zeichnet nur; SpiceLab braucht zu jedem Bauteil ein Modell. Deshalb:
//   - Werte werden gelesen („4,7 kΩ“ → 4700), Typen der Bibliothek zugeordnet („BC547“ → BC547B).
//   - Was sich nicht eindeutig zuordnen lässt, wird mit einem Hinweis angenähert oder ausgelassen
//     (z. B. Mikrocontroller, OPV ohne Versorgungsanschlüsse, eigene Bauteile).
// Die Schaltzeichen stammen aus SchaltLab, deshalb liegen die Anschlüsse an denselben Stellen.

import { parseValue } from './units.js';
import { CATALOG_BY_ID, defaultParams } from '../editor/catalog.js';

export const isSchaltLab = (data) => data?.format === 'schaltplan-editor';

const lower = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');

/** Bibliothekstyp aus der Beschriftung; [Schlüssel, genau getroffen?]. */
function pick(value, table, fallback) {
  const v = lower(value);
  for (const [pattern, key] of table) if (v.includes(pattern)) return [key, true];
  return [fallback, false];
}

const DIODE_TYPES = [['1n4148', '1N4148'], ['1n400', '1N4001']];
const ZENER = /z\s*(\d+)[,.]?(\d*)\s*v/i;
const LED_COLORS = [['rot', 'rot'], ['red', 'rot'], ['grün', 'gruen'], ['gruen', 'gruen'], ['green', 'gruen'], ['gelb', 'gelb'], ['yellow', 'gelb'], ['blau', 'blau'], ['blue', 'blau'], ['weiß', 'weiss'], ['weiss', 'weiss'], ['white', 'weiss']];
const NPN_TYPES = [['bc547', 'BC547B'], ['bc548', 'BC547B'], ['bc546', 'BC547B'], ['bc337', 'BC337'], ['bd139', 'BD139'], ['2n2222', 'BC337']];
const PNP_TYPES = [['bc557', 'BC557B'], ['bc558', 'BC557B'], ['bc556', 'BC557B']];
const NMOS_TYPES = [['bs170', 'BS170'], ['2n7000', 'BS170'], ['irlz44', 'IRLZ44N'], ['irf540', 'IRF540N']];
const PMOS_TYPES = [['irf9540', 'IRF9540N']];
const OPAMP_TYPES = [['lm358', 'LM358'], ['tl07', 'TL072'], ['tl08', 'TL072'], ['mcp600', 'MCP6002']];

/**
 * Ein SchaltLab-Bauteil umsetzen.
 * @returns {{ type, params, note? } | { skip: string }}
 */
function convert(c) {
  const name = c.label || c.type;
  const number = (unit, fallback) => {
    const v = parseValue(c.value);
    return Number.isFinite(v) ? [v, null] : [fallback, `${name}: Wert „${c.value}“ nicht lesbar, ${fallback} ${unit} angenommen`];
  };
  const typed = (type, table, fallback, extra = {}) => {
    const [key, exact] = pick(c.value, table, fallback);
    return { type, params: { type: key, ...extra }, note: exact || !c.value ? null : `${name}: „${c.value}“ nicht in der Bibliothek, als ${key} übernommen` };
  };
  switch (c.type) {
    case 'gnd': return { type: 'gnd', params: {} };
    case 'gndrail': return { type: 'groundRail', params: { len: c.len ?? 4 } };
    case 'rail': {
      const v = parseValue(c.value);
      if (!Number.isFinite(v)) return { skip: `Schiene „${c.value}“ hat keine Spannungsangabe (Anschluss/Signal) – ausgelassen` };
      return { type: 'rail', params: { voltage: v, len: c.len ?? 4 } };
    }
    case 'resistor': { const [value, note] = number('Ω', 1000); return { type: 'resistor', params: { value }, note }; }
    case 'poti': { const [value, note] = number('Ω', 10000); return { type: 'poti', params: { value, position: 50 }, note }; }
    case 'capacitor': { const [value, note] = number('F', 100e-9); return { type: 'capacitor', params: { value }, note }; }
    case 'elko': { const [value, note] = number('F', 100e-6); return { type: 'elko', params: { value }, note }; }
    case 'coil': { const [value, note] = number('H', 10e-3); return { type: 'coil', params: { value, resistance: 1 }, note }; }
    case 'diode': {
      const z = ZENER.exec(c.value ?? '');
      if (z) {
        const key = `${z[1]}V${z[2] || ''}`; // „Z 5,1 V“ → 5V1, „Z 12 V“ → 12V
        const known = { '3V3': '3V3', '4V7': '4V7', '5V1': '5V1', '6V2': '6V2', '9V1': '9V1', '12V': '12V' }[key];
        return { type: 'zdiode', params: { type: known ?? '5V1' }, note: known ? null : `${name}: Z-Diode „${c.value}“ als 5,1 V übernommen` };
      }
      return typed('diode', DIODE_TYPES, '1N4148');
    }
    case 'led': return typed('led', LED_COLORS, 'rot');
    case 'npn': return typed('npn', NPN_TYPES, 'BC547B');
    case 'pnp': return typed('pnp', PNP_TYPES, 'BC557B');
    case 'nmos': return typed('nmos', NMOS_TYPES, 'BS170');
    case 'pmos': return typed('pmos', PMOS_TYPES, 'IRF9540N');
    case 'opv': return typed('opamp', OPAMP_TYPES, 'LM358');
    case 'opv2': return { skip: `${name}: OPV ohne Versorgungsanschlüsse lässt sich nicht simulieren – ausgelassen (OPV mit V+ und V− verwenden)` };
    case 'switch': return { type: 'switch', params: { closed: Boolean(c.on) } };
    case 'button': return { type: 'button', params: { closed: Boolean(c.on) } };
    case 'phototransistor': return { skip: `${name}: Fototransistor gibt es in SpiceLab noch nicht – ausgelassen` };
    case 'terminal': return { skip: null }; // reine Beschriftung eines Anschlusses
    default:
      if (c.type.startsWith('mcu_')) return { skip: `${name}: Mikrocontroller-Board wird nicht simuliert – ausgelassen` };
      return { skip: `${name}: Bauteil „${c.type}“ (eigenes Bauteil?) wird nicht simuliert – ausgelassen` };
  }
}

/**
 * @param {object} data SchaltLab-Datei
 * @returns {{ data: object, notes: string[] }} SpiceLab-Zeichnung und Hinweise für die Lehrkraft
 */
export function fromSchaltLab(data) {
  const notes = [];
  const comps = [];
  let n = 0;
  const idNumber = (id) => Number.parseInt(String(id).slice(1), 10) || 0;
  for (const c of data.comps ?? []) {
    if (!c || typeof c.type !== 'string' || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    n = Math.max(n, idNumber(c.id));
    const r = convert(c);
    if ('skip' in r) {
      if (r.skip) notes.push(r.skip);
      continue;
    }
    if (r.note) notes.push(r.note);
    const entry = CATALOG_BY_ID.get(r.type);
    comps.push({
      id: c.id, type: r.type, label: entry.prefix ? c.label || '' : '',
      x: c.x, y: c.y, rot: [0, 90, 180, 270].includes(+c.rot) ? +c.rot : 0, mir: Boolean(c.mir),
      params: { ...defaultParams(entry), ...r.params },
      ...(c.lo && { lo: { dx: c.lo.dx ?? 0, dy: c.lo.dy ?? 0 } }),
    });
  }
  // Bezeichnungen eindeutig machen (der Simulationskern braucht eindeutige Namen)
  const used = new Set();
  for (const c of comps) {
    const prefix = CATALOG_BY_ID.get(c.type).prefix;
    if (!prefix) continue;
    if (!c.label || used.has(c.label)) {
      let k = 1;
      while (used.has(`${prefix}${k}`) || comps.some((o) => o.label === `${prefix}${k}`)) k++;
      if (c.label) notes.push(`Bezeichnung ${c.label} kam doppelt vor – zweites Bauteil heißt jetzt ${prefix}${k}`);
      c.label = `${prefix}${k}`;
    }
    used.add(c.label);
  }

  const wires = (data.wires ?? []).filter((w) => Array.isArray(w?.pts) && w.pts.length >= 2)
    .map((w) => { n = Math.max(n, idNumber(w.id)); return { id: w.id, pts: w.pts.map(([x, y]) => [+x, +y]) }; });
  return { data: { app: 'SpiceLab', version: 1, comps, wires, probes: [], n: Math.max(n, data.n ?? 0) }, notes };
}
