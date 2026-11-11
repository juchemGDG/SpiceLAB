// Bauteilkatalog: verbindet die Karten in der Seitenleiste mit dem Simulationskern.
//
// Jeder Eintrag beschreibt
//   symbol   – Schaltzeichen (symbols.js)
//   source   – (optional) Anschluss, der bei fehlender Masse zum Bezugspunkt wird: Das Bauteil ist eine Quelle
//   galvanic – (optional) Gruppen elektrisch verbundener Anschlüsse; Vorgabe: alle Anschlüsse zusammen
//   energizes – (optional) versorgt galvanisch getrennte Teile (Transformator)
//   params   – Einstellungen im Eigenschaften-Dialog:
//              { key, label, unit, default, kind: 'number' | 'select' | 'bool', options, min, max }
//   text     – was neben dem Symbol steht (aus den Einstellungen)
//   elements – welche Elemente des Simulationskerns daraus entstehen.
//              net(pinName) liefert den Knotennamen, an dem der Anschluss hängt.
// Die Kennwerte der Bibliothekstypen stehen in app/js/library – hier wird nur ausgewählt.

import { formatValue } from '../ui/units.js';
import { BATTERIES } from '../library/batteries.js';
import { DIODES, LEDS, ZENERS } from '../library/diodes.js';
import { LAMPS } from '../library/lamps.js';
import { MOTORS } from '../library/motors.js';
import { TRANSISTORS } from '../library/transistors.js';
import { MOSFETS } from '../library/mosfets.js';
import { OPAMPS } from '../library/opamps.js';
import { LDRS, NTCS } from '../library/sensors.js';
import { SOLAR_CELLS } from '../library/solar.js';

export const CATEGORIES = ['Versorgung', 'Passive Bauteile', 'Halbleiter', 'Schalter & Taster'];

/** Auswahlliste aus einer Bibliothek: [{ value: Schlüssel, label }]. */
const choices = (lib, filter = () => true) =>
  Object.entries(lib).filter(([, v]) => filter(v)).map(([value, v]) => ({ value, label: v.label }));
const num = (key, label, unit, def, extra = {}) => ({ key, label, unit, default: def, kind: 'number', ...extra });
const sel = (key, label, options, def) => ({ key, label, kind: 'select', options, default: def ?? options[0].value });
const fmt = formatValue;

export const CATALOG = [
  // ── Versorgung ──
  {
    id: 'gnd', name: 'Masse', cat: 'Versorgung', symbol: 'gnd', prefix: '', hint: 'Bezugspunkt 0 V',
    params: [], text: () => '', elements: () => [], // wird beim Aufbau der Netzliste zum Knoten '0'
  },
  {
    id: 'battery', name: 'Batterie / Akku', cat: 'Versorgung', symbol: 'battery', prefix: 'B', hint: 'mit Innenwiderstand',
    source: '−',
    params: [sel('type', 'Typ', choices(BATTERIES), 'block9V')],
    text: (p) => BATTERIES[p.type].label,
    elements: (p, net, name) => [{ type: 'BAT', name, nodes: [net('+'), net('−')], ...pick(BATTERIES[p.type], ['voltage', 'internalResistance']) }],
  },
  {
    id: 'powerSupply', name: 'Netzgerät', cat: 'Versorgung', symbol: 'dcSource', prefix: 'U', hint: 'Gleichspannung einstellbar',
    source: '−',
    params: [num('voltage', 'Spannung', 'V', 5)],
    text: (p) => fmt(p.voltage, 'V'),
    elements: (p, net, name) => [{ type: 'BAT', name, nodes: [net('+'), net('−')], voltage: p.voltage, internalResistance: 0.01 }],
  },
  {
    id: 'sine', name: 'Wechselspannung', cat: 'Versorgung', symbol: 'acSource', prefix: 'U', hint: 'Sinus (Funktionsgenerator)',
    source: '2',
    params: [num('amplitude', 'Scheitelwert', 'V', 5), num('frequency', 'Frequenz', 'Hz', 50, { min: 0 }), num('offset', 'Gleichanteil', 'V', 0)],
    text: (p) => `${fmt(p.amplitude, 'V')} · ${fmt(p.frequency, 'Hz')}`,
    elements: (p, net, name) => [{
      type: 'V', name, nodes: [net('1'), net('2')],
      waveform: { shape: 'sine', offset: p.offset, amplitude: p.amplitude, frequency: p.frequency },
    }],
  },
  {
    id: 'square', name: 'Rechteckspannung', cat: 'Versorgung', symbol: 'squareSource', prefix: 'U', hint: 'Takt (Funktionsgenerator)',
    source: '2',
    params: [num('high', 'Spannung „an“', 'V', 5), num('low', 'Spannung „aus“', 'V', 0), num('frequency', 'Frequenz', 'Hz', 1000, { min: 0 }),
      num('duty', 'Tastgrad', '%', 50, { min: 1, max: 99 })],
    text: (p) => `${fmt(p.low, 'V')}/${fmt(p.high, 'V')} · ${fmt(p.frequency, 'Hz')}`,
    elements: (p, net, name) => {
      const period = 1 / p.frequency;
      const edge = Math.min(1e-6, period / 1000);
      return [{
        type: 'V', name, nodes: [net('1'), net('2')],
        waveform: { shape: 'pulse', low: p.low, high: p.high, rise: edge, fall: edge, width: (period * p.duty) / 100 - edge, period },
      }];
    },
  },
  {
    id: 'currentSource', name: 'Stromquelle', cat: 'Versorgung', symbol: 'currentSource', prefix: 'I', hint: 'konstanter Strom',
    source: '1',
    params: [num('current', 'Stromstärke', 'A', 0.01)],
    text: (p) => fmt(p.current, 'A'),
    elements: (p, net, name) => [{ type: 'I', name, nodes: [net('1'), net('2')], value: p.current }],
  },
  {
    id: 'solar', name: 'Solarzelle', cat: 'Versorgung', symbol: 'solar', prefix: 'PV', hint: 'Bestrahlung einstellbar',
    source: '−',
    params: [sel('type', 'Typ', choices(SOLAR_CELLS), 'module6V'), num('irradiance', 'Bestrahlungsstärke', 'W/m²', 1000, { min: 0 })],
    text: (p) => `${SOLAR_CELLS[p.type].label} · ${fmt(p.irradiance, 'W/m²')}`,
    elements: (p, net, name) => [{ type: 'PV', name, nodes: [net('+'), net('−')], ...strip(SOLAR_CELLS[p.type]), irradiance: p.irradiance }],
  },

  // ── Passive Bauteile ──
  {
    id: 'resistor', name: 'Widerstand', cat: 'Passive Bauteile', symbol: 'resistor', prefix: 'R', hint: 'ohmscher Widerstand',
    params: [num('value', 'Widerstand', 'Ω', 1000, { min: 0 })],
    text: (p) => fmt(p.value, 'Ω'),
    elements: (p, net, name) => [{ type: 'R', name, nodes: [net('1'), net('2')], value: p.value }],
  },
  {
    id: 'poti', name: 'Potentiometer', cat: 'Passive Bauteile', symbol: 'poti', prefix: 'R', hint: 'Schleifer einstellbar',
    params: [num('value', 'Widerstand', 'Ω', 10000, { min: 0 }), num('position', 'Schleiferstellung (A → B)', '%', 50, { min: 0, max: 100 })],
    text: (p) => `${fmt(p.value, 'Ω')} · ${Math.round(p.position)} %`,
    elements: (p, net, name) => [{ type: 'POT', name, nodes: [net('A'), net('B'), net('S')], value: p.value, position: p.position / 100 }],
  },
  {
    id: 'ldr', name: 'Fotowiderstand (LDR)', cat: 'Passive Bauteile', symbol: 'ldr', prefix: 'R', hint: 'Helligkeit einstellbar',
    params: [sel('type', 'Typ', choices(LDRS), 'GL5528'), num('illuminance', 'Beleuchtungsstärke', 'lx', 300, { min: 0 })],
    text: (p) => `${p.type} · ${fmt(p.illuminance, 'lx')}`,
    elements: (p, net, name) => [{ type: 'LDR', name, nodes: [net('1'), net('2')], ...strip(LDRS[p.type]), illuminance: Math.max(p.illuminance, 1e-3) }],
  },
  {
    id: 'ntc', name: 'Heißleiter (NTC)', cat: 'Passive Bauteile', symbol: 'ntc', prefix: 'R', hint: 'Temperatur einstellbar',
    params: [sel('type', 'Typ', choices(NTCS), 'ntc10k'), num('temperature', 'Temperatur', '°C', 20)],
    text: (p) => `${NTCS[p.type].label.split(' (')[0]} · ${fmt(p.temperature, '°C')}`,
    elements: (p, net, name) => [{ type: 'NTC', name, nodes: [net('1'), net('2')], ...strip(NTCS[p.type]), temperature: p.temperature }],
  },
  {
    id: 'capacitor', name: 'Kondensator', cat: 'Passive Bauteile', symbol: 'capacitor', prefix: 'C', hint: 'ungepolt',
    params: [num('value', 'Kapazität', 'F', 100e-9, { min: 0 })],
    text: (p) => fmt(p.value, 'F'),
    elements: (p, net, name) => [{ type: 'C', name, nodes: [net('1'), net('2')], value: p.value }],
  },
  {
    id: 'elko', name: 'Elektrolytkondensator', cat: 'Passive Bauteile', symbol: 'elko', prefix: 'C', hint: 'gepolt (Elko)',
    params: [num('value', 'Kapazität', 'F', 100e-6, { min: 0 })],
    text: (p) => fmt(p.value, 'F'),
    elements: (p, net, name) => [{ type: 'C', name, nodes: [net('+'), net('−')], value: p.value }],
  },
  {
    id: 'coil', name: 'Spule', cat: 'Passive Bauteile', symbol: 'coil', prefix: 'L', hint: 'mit Wicklungswiderstand',
    params: [num('value', 'Induktivität', 'H', 10e-3, { min: 0 }), num('resistance', 'Wicklungswiderstand', 'Ω', 1, { min: 0 })],
    text: (p) => fmt(p.value, 'H'),
    elements: (p, net, name) => [{ type: 'L', name, nodes: [net('1'), net('2')], value: p.value, resistance: p.resistance }],
  },
  {
    id: 'transformer', name: 'Transformator', cat: 'Passive Bauteile', symbol: 'transformer', prefix: 'Tr', hint: 'zwei gekoppelte Spulen',
    galvanic: [['P1', 'P2'], ['S1', 'S2']], // Primär- und Sekundärseite sind elektrisch getrennt
    energizes: true, // die Sekundärseite wird über das Magnetfeld versorgt
    params: [
      num('primary', 'Induktivität primär', 'H', 1, { min: 0 }), num('ratio', 'Übersetzung N₂/N₁', '', 0.5, { min: 0 }),
      num('k', 'Koppelfaktor k', '', 0.99, { min: 0, max: 1 }), num('r1', 'Wicklungswiderstand primär', 'Ω', 1, { min: 0 }),
      num('r2', 'Wicklungswiderstand sekundär', 'Ω', 0.5, { min: 0 }),
    ],
    text: (p) => `N₂/N₁ = ${String(p.ratio).replace('.', ',')}`,
    elements: (p, net, name) => [
      { type: 'L', name: `${name}:primär`, nodes: [net('P1'), net('P2')], value: p.primary, resistance: p.r1 },
      { type: 'L', name: `${name}:sekundär`, nodes: [net('S1'), net('S2')], value: p.primary * p.ratio ** 2, resistance: p.r2 },
      { type: 'K', name, inductors: [`${name}:primär`, `${name}:sekundär`], k: p.k },
    ],
  },
  {
    id: 'lamp', name: 'Glühlampe', cat: 'Passive Bauteile', symbol: 'lamp', prefix: 'H', hint: 'Wolframfaden',
    params: [sel('type', 'Typ', choices(LAMPS), '6V_0A1')],
    text: (p) => LAMPS[p.type].label.replace('Glühlampe ', ''),
    elements: (p, net, name) => [{ type: 'LAMP', name, nodes: [net('1'), net('2')], ...strip(LAMPS[p.type]) }],
  },
  {
    id: 'motor', name: 'Gleichstrommotor', cat: 'Passive Bauteile', symbol: 'motor', prefix: 'M', hint: 'mit Drehzahl',
    params: [sel('type', 'Typ', choices(MOTORS), 'small3V'), num('loadTorque', 'Lastmoment', 'N·m', 0)],
    text: (p) => MOTORS[p.type].label.split(' (')[0],
    elements: (p, net, name) => [{ type: 'MOT', name, nodes: [net('+'), net('−')], ...strip(MOTORS[p.type]), loadTorque: p.loadTorque }],
  },

  // ── Halbleiter ──
  {
    id: 'diode', name: 'Diode', cat: 'Halbleiter', symbol: 'diode', prefix: 'D', hint: 'Anode links, Kathode rechts',
    params: [sel('type', 'Typ', choices(DIODES), '1N4148')],
    text: (p) => p.type,
    elements: (p, net, name) => [{ type: 'D', name, nodes: [net('A'), net('K')], model: DIODES[p.type].model }],
  },
  {
    id: 'zdiode', name: 'Z-Diode', cat: 'Halbleiter', symbol: 'zdiode', prefix: 'D', hint: 'in Sperrrichtung betreiben',
    params: [sel('type', 'Z-Spannung', choices(ZENERS), '5V1')],
    text: (p) => ZENERS[p.type].label.replace('Z-Diode ', 'Z '),
    elements: (p, net, name) => [{ type: 'D', name, nodes: [net('A'), net('K')], model: ZENERS[p.type].model }],
  },
  {
    id: 'led', name: 'LED', cat: 'Halbleiter', symbol: 'led', prefix: 'D', hint: 'Leuchtdiode',
    params: [sel('type', 'Farbe', choices(LEDS), 'rot')],
    text: (p) => LEDS[p.type].label.replace('LED ', ''),
    elements: (p, net, name) => [{ type: 'D', name, nodes: [net('A'), net('K')], model: LEDS[p.type].model }],
  },
  {
    id: 'npn', name: 'NPN-Transistor', cat: 'Halbleiter', symbol: 'npn', prefix: 'T', hint: 'B · C · E',
    params: [sel('type', 'Typ', choices(TRANSISTORS, (t) => t.polarity === 'npn'), 'BC547B')],
    text: (p) => p.type,
    elements: (p, net, name) => [{ type: 'Q', name, nodes: [net('C'), net('B'), net('E')], polarity: 'npn', model: TRANSISTORS[p.type].model }],
  },
  {
    id: 'pnp', name: 'PNP-Transistor', cat: 'Halbleiter', symbol: 'pnp', prefix: 'T', hint: 'B · C · E',
    params: [sel('type', 'Typ', choices(TRANSISTORS, (t) => t.polarity === 'pnp'), 'BC557B')],
    text: (p) => p.type,
    elements: (p, net, name) => [{ type: 'Q', name, nodes: [net('C'), net('B'), net('E')], polarity: 'pnp', model: TRANSISTORS[p.type].model }],
  },
  {
    id: 'nmos', name: 'N-MOSFET', cat: 'Halbleiter', symbol: 'nmos', prefix: 'T', hint: 'G · D · S',
    params: [sel('type', 'Typ', choices(MOSFETS, (t) => t.polarity === 'n'), 'IRLZ44N')],
    text: (p) => p.type,
    elements: (p, net, name) => [{
      type: 'M', name, nodes: [net('D'), net('G'), net('S')], polarity: 'n', model: MOSFETS[p.type].model, bodyDiode: MOSFETS[p.type].bodyDiode,
    }],
  },
  {
    id: 'pmos', name: 'P-MOSFET', cat: 'Halbleiter', symbol: 'pmos', prefix: 'T', hint: 'G · D · S',
    params: [sel('type', 'Typ', choices(MOSFETS, (t) => t.polarity === 'p'), 'IRF9540N')],
    text: (p) => p.type,
    elements: (p, net, name) => [{
      type: 'M', name, nodes: [net('D'), net('G'), net('S')], polarity: 'p', model: MOSFETS[p.type].model, bodyDiode: MOSFETS[p.type].bodyDiode,
    }],
  },
  {
    id: 'opamp', name: 'Operationsverstärker', cat: 'Halbleiter', symbol: 'opamp', prefix: 'U', hint: 'braucht V+ und V−',
    params: [sel('type', 'Typ', choices(OPAMPS), 'LM358')],
    text: (p) => p.type,
    elements: (p, net, name) => [{
      type: 'OPV', name, nodes: [net('IN+'), net('IN−'), net('OUT'), net('V+'), net('V−')], model: OPAMPS[p.type].model,
    }],
  },

  // ── Schalter & Taster ──
  {
    id: 'switch', name: 'Schalter', cat: 'Schalter & Taster', symbol: 'switch', prefix: 'S', hint: 'bleibt in seiner Stellung',
    params: [{ key: 'closed', label: 'geschlossen', kind: 'bool', default: false }],
    text: () => '',
    closed: (p) => p.closed,
    elements: (p, net, name) => [{ type: 'S', name, nodes: [net('1'), net('2')], closed: p.closed }],
  },
  {
    id: 'button', name: 'Taster', cat: 'Schalter & Taster', symbol: 'button', prefix: 'S', hint: 'leitet nur, solange gedrückt',
    params: [{ key: 'closed', label: 'gedrückt', kind: 'bool', default: false }],
    text: () => '',
    closed: (p) => p.closed,
    elements: (p, net, name) => [{ type: 'S', name, nodes: [net('1'), net('2')], closed: p.closed }],
  },
  {
    id: 'changeover', name: 'Umschalter', cat: 'Schalter & Taster', symbol: 'changeover', prefix: 'S', hint: 'Mitte → a oder b',
    params: [sel('position', 'Stellung', [{ value: 'a', label: 'a (oben)' }, { value: 'b', label: 'b (unten)' }], 'a')],
    text: () => '',
    closed: (p) => p.position === 'b', // Symbol „geschlossen“ zeigt Stellung b
    elements: (p, net, name) => [{ type: 'SPDT', name, nodes: [net('M'), net('a'), net('b')], position: p.position }],
  },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

/** Voreinstellungen eines Katalogeintrags. */
export function defaultParams(entry) {
  return Object.fromEntries(entry.params.map((p) => [p.key, p.default]));
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

/** Bibliothekseintrag ohne die reinen Anzeigefelder. */
function strip(obj) {
  const { label: _label, ...rest } = obj;
  return rest;
}
