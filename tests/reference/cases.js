// Vergleichsschaltungen für den Abgleich mit ngspice (Phase 5).
//
// Jede Schaltung wird von tools/ngspice/make-references.mjs mit ngspice gerechnet; die Ergebnisse
// liegen in tests/reference/fixtures/<id>.json. tests/reference.test.js rechnet dieselbe Schaltung
// mit SpiceLab und vergleicht. ngspice wird nur zum Erzeugen der Referenzen gebraucht.
//
// analysis:
//   { type: 'dc', source, from, to, step }     Kennlinie über eine Quelle (wie .dc)
//   { type: 'tran', stopTime, step, maxStep, useInitialConditions }
// probes: 'v(knoten)' = Potenzial, 'i(QUELLE)' = Strom in der Quelle (SPICE-Vorzeichen)
// tolerance: dc → rel/abs je Punkt; tran → nrmse (Effektivwert der Abweichung / Spannweite)

import { DIODES, LEDS, ZENERS } from '../../app/js/library/diodes.js';
import { TRANSISTORS } from '../../app/js/library/transistors.js';
import { MOSFETS } from '../../app/js/library/mosfets.js';
import { SOLAR_CELLS } from '../../app/js/library/solar.js';

const V = (name, a, b, value) => ({ type: 'V', name, nodes: [a, b], value });
const I = (name, a, b, value) => ({ type: 'I', name, nodes: [a, b], value });
const R = (name, a, b, value) => ({ type: 'R', name, nodes: [a, b], value });
const C = (name, a, b, value, ic) => ({ type: 'C', name, nodes: [a, b], value, ...(ic !== undefined && { ic }) });
const D = (name, a, b, model) => ({ type: 'D', name, nodes: [a, b], model });
const Q = (name, nodes, key) => ({ type: 'Q', name, nodes, polarity: TRANSISTORS[key].polarity, model: TRANSISTORS[key].model });
const M = (name, nodes, key) => ({
  type: 'M', name, nodes, polarity: MOSFETS[key].polarity, model: MOSFETS[key].model, bodyDiode: MOSFETS[key].bodyDiode,
});

const DC_TOL = { rel: 2e-3, absV: 1e-6, absI: 1e-9 };

export const CASES = [
  // ── Gleichstrom: Kennlinien ──
  {
    id: 'dc-1n4148',
    title: '1N4148 mit 1 kΩ, Quelle −5 … 5 V',
    netlist: { elements: [V('V1', 'q', '0', 0), R('R1', 'q', 'a', 1e3), D('D1', 'a', '0', DIODES['1N4148'].model)] },
    analysis: { type: 'dc', source: 'V1', from: -5, to: 5, step: 0.25 },
    probes: ['v(a)', 'i(V1)'],
    tolerance: DC_TOL,
  },
  {
    id: 'dc-zener-5v1',
    title: 'Z-Diode 5,1 V mit 1 kΩ, Quelle −12 … 2 V (Durchbruch)',
    netlist: { elements: [V('V1', 'q', '0', 0), R('R1', 'q', 'a', 1e3), D('D1', 'a', '0', ZENERS['5V1'].model)] },
    analysis: { type: 'dc', source: 'V1', from: -12, to: 2, step: 0.25 },
    probes: ['v(a)', 'i(V1)'],
    tolerance: DC_TOL,
  },
  {
    id: 'dc-led-blau',
    title: 'LED blau mit 100 Ω, Quelle 0 … 6 V',
    netlist: { elements: [V('V1', 'q', '0', 0), R('R1', 'q', 'a', 100), D('D1', 'a', '0', LEDS.blau.model)] },
    analysis: { type: 'dc', source: 'V1', from: 0, to: 6, step: 0.2 },
    probes: ['v(a)', 'i(V1)'],
    tolerance: DC_TOL,
  },
  ...['BC547B', 'BC337', 'BD139'].map((key) => ({
    id: `dc-${key.toLowerCase()}-ausgang`,
    title: `${key}: Ausgangskennlinie I_C(U_CE) bei fester Basisspannung über 100 kΩ`,
    netlist: {
      elements: [V('VB', 'pb', '0', 1.2), R('RB', 'pb', 'b', key === 'BC547B' ? 100e3 : 10e3), V('VC', 'c', '0', 0), Q('Q1', ['c', 'b', '0'], key)],
    },
    analysis: { type: 'dc', source: 'VC', from: 0, to: 10, step: 0.2 },
    probes: ['i(VC)', 'v(b)'],
    tolerance: DC_TOL,
  })),
  {
    id: 'dc-bc557b-ausgang',
    title: 'BC557B (PNP): Ausgangskennlinie',
    netlist: { elements: [V('VB', '0', 'pb', 1.2), R('RB', 'pb', 'b', 100e3), V('VC', '0', 'c', 0), Q('Q1', ['c', 'b', '0'], 'BC557B')] },
    analysis: { type: 'dc', source: 'VC', from: 0, to: 10, step: 0.2 },
    probes: ['i(VC)', 'v(b)'],
    tolerance: DC_TOL,
  },
  {
    id: 'dc-bc547b-eingang',
    title: 'BC547B: Eingangs-/Übertragungskennlinie über U_BE 0,3 … 0,85 V (Gummel-Plot)',
    netlist: { elements: [V('VB', 'b', '0', 0.3), V('VC', 'c', '0', 5), Q('Q1', ['c', 'b', '0'], 'BC547B')] },
    analysis: { type: 'dc', source: 'VB', from: 0.3, to: 0.85, step: 0.01 },
    probes: ['i(VB)', 'i(VC)'],
    tolerance: { ...DC_TOL, absI: 1e-12 },
  },
  {
    id: 'dc-emitterschaltung',
    title: 'Emitterschaltung mit Spannungsteiler (BC547B), Versorgung 0 … 12 V',
    netlist: {
      elements: [
        V('VCC', 'p', '0', 0), R('R1', 'p', 'b', 47e3), R('R2', 'b', '0', 10e3),
        R('RC', 'p', 'c', 2.2e3), R('RE', 'e', '0', 470), Q('Q1', ['c', 'b', 'e'], 'BC547B'),
      ],
    },
    analysis: { type: 'dc', source: 'VCC', from: 0, to: 12, step: 0.5 },
    probes: ['v(c)', 'v(e)', 'v(b)'],
    tolerance: DC_TOL,
  },
  ...[['IRLZ44N', 3], ['IRLZ44N', 5], ['BS170', 5]].map(([key, ugs]) => ({
    id: `dc-${key.toLowerCase()}-ugs${ugs}`,
    title: `${key}: Ausgangskennlinie bei U_GS = ${ugs} V`,
    netlist: { elements: [V('VG', 'g', '0', ugs), V('VD', 'd', '0', 0), M('M1', ['d', 'g', '0'], key)] },
    analysis: { type: 'dc', source: 'VD', from: -1, to: 5, step: 0.1 },
    probes: ['i(VD)'],
    tolerance: DC_TOL,
  })),
  {
    id: 'dc-irf9540n',
    title: 'IRF9540N (P-Kanal): Ausgangskennlinie bei U_GS = −6 V',
    netlist: { elements: [V('VG', '0', 'g', 6), V('VD', '0', 'd', 0), M('M1', ['d', 'g', '0'], 'IRF9540N')] },
    analysis: { type: 'dc', source: 'VD', from: -1, to: 5, step: 0.1 },
    probes: ['i(VD)'],
    tolerance: DC_TOL,
  },
  {
    id: 'dc-solarmodul',
    title: 'Solarmodul 6 V: Kennlinie über der Klemmenspannung 0 … 7,5 V',
    netlist: { elements: [{ type: 'PV', name: 'PV1', nodes: ['p', '0'], ...SOLAR_CELLS.module6V }, V('VL', 'p', '0', 0)] },
    analysis: { type: 'dc', source: 'VL', from: 0, to: 7.5, step: 0.25 },
    probes: ['i(VL)'],
    tolerance: DC_TOL,
  },

  // ── Zeitbereich ──
  {
    id: 'tran-rc',
    title: 'RC-Glied laden (entladen gestartet)',
    netlist: { elements: [V('V1', 'p', '0', 5), R('R1', 'p', 'a', 1e3), C('C1', 'a', '0', 1e-6, 0)] },
    analysis: { type: 'tran', stopTime: 5e-3, step: 10e-6, maxStep: 10e-6, useInitialConditions: true },
    probes: ['v(a)'],
    tolerance: { nrmse: 2e-3 },
  },
  {
    id: 'tran-rlc',
    title: 'Reihenschwingkreis, gedämpft',
    netlist: {
      elements: [
        V('V1', 'p', '0', 5), R('R1', 'p', 'a', 20),
        { type: 'L', name: 'L1', nodes: ['a', 'b'], value: 10e-3, ic: 0 }, C('C1', 'b', '0', 10e-6, 0),
      ],
    },
    analysis: { type: 'tran', stopTime: 10e-3, step: 10e-6, maxStep: 10e-6, useInitialConditions: true },
    probes: ['v(b)', 'i(V1)'],
    tolerance: { nrmse: 3e-3 },
  },
  {
    id: 'tran-transformator',
    title: 'Transformator 2:1 (k = 0,99) mit Last, 50 Hz',
    netlist: {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 10, frequency: 50 } },
        { type: 'L', name: 'LP', nodes: ['p', '0'], value: 4, resistance: 1 },
        { type: 'L', name: 'LS', nodes: ['s', '0'], value: 1, resistance: 0.5 },
        { type: 'K', name: 'K1', inductors: ['LP', 'LS'], k: 0.99 },
        R('RL', 's', '0', 100),
      ],
    },
    analysis: { type: 'tran', stopTime: 0.1, step: 1e-4, maxStep: 1e-4 },
    probes: ['v(s)', 'i(V1)'],
    tolerance: { nrmse: 5e-3 },
  },
  {
    id: 'tran-gleichrichter',
    title: 'Einweggleichrichter 1N4001 mit Glättung',
    netlist: {
      elements: [
        { type: 'V', name: 'V1', nodes: ['ac', '0'], waveform: { shape: 'sine', offset: 0, amplitude: 12, frequency: 50 } },
        D('D1', 'ac', 'out', DIODES['1N4001'].model), C('C1', 'out', '0', 470e-6), R('RL', 'out', '0', 1e3),
      ],
    },
    analysis: { type: 'tran', stopTime: 0.1, step: 1e-4, maxStep: 1e-4 },
    probes: ['v(out)', 'i(V1)'],
    tolerance: { nrmse: 1e-2 },
  },
  {
    id: 'tran-sperrverzug',
    title: '1N4148: Sperrverzug beim Umschalten +5 V → −5 V',
    netlist: {
      elements: [
        { type: 'V', name: 'V1', nodes: ['p', '0'], waveform: { shape: 'pulse', low: 5, high: -5, delay: 50e-9, rise: 1e-9, fall: 1e-9, width: 1 } },
        R('R1', 'p', 'a', 500), D('D1', 'a', '0', DIODES['1N4148'].model),
      ],
    },
    analysis: { type: 'tran', stopTime: 150e-9, step: 0.2e-9, maxStep: 0.2e-9 },
    probes: ['i(V1)', 'v(a)'],
    tolerance: { nrmse: 1e-2 },
  },
  {
    id: 'tran-transistorschalter',
    title: 'BC547B als Schalter, Rechteck an der Basis',
    netlist: {
      elements: [
        V('VCC', 'p', '0', 5),
        { type: 'V', name: 'VIN', nodes: ['in', '0'], waveform: { shape: 'pulse', low: 0, high: 5, delay: 0.5e-6, rise: 10e-9, fall: 10e-9, width: 2e-6, period: 5e-6 } },
        R('RB', 'in', 'b', 10e3), R('RC', 'p', 'c', 1e3), Q('Q1', ['c', 'b', '0'], 'BC547B'),
      ],
    },
    analysis: { type: 'tran', stopTime: 10e-6, step: 5e-9, maxStep: 5e-9 },
    probes: ['v(c)', 'v(b)'],
    tolerance: { nrmse: 1e-2 },
  },
  {
    id: 'tran-mosfet-gate',
    title: 'IRLZ44N über 1 kΩ am Gate eingeschaltet (Gate-Ladung)',
    netlist: {
      elements: [
        V('VCC', 'p', '0', 12),
        { type: 'V', name: 'VG', nodes: ['in', '0'], waveform: { shape: 'pulse', low: 0, high: 5, delay: 1e-6, rise: 10e-9, fall: 10e-9, width: 10e-6, period: 20e-6 } },
        R('RG', 'in', 'g', 1e3), R('RL', 'p', 'd', 10), M('M1', ['d', 'g', '0'], 'IRLZ44N'),
      ],
    },
    analysis: { type: 'tran', stopTime: 20e-6, step: 10e-9, maxStep: 10e-9 },
    probes: ['v(d)', 'v(g)'],
    tolerance: { nrmse: 1e-2 },
  },
  {
    id: 'tran-wechselblinker',
    title: 'Astabiler Multivibrator mit 2 × BC547B und LEDs',
    netlist: {
      elements: [
        V('VCC', 'p', '0', 9),
        R('RV1', 'p', 'a1', 680), D('LED1', 'a1', 'c1', LEDS.rot.model),
        R('RV2', 'p', 'a2', 680), D('LED2', 'a2', 'c2', LEDS.gruen.model),
        R('RB1', 'p', 'b1', 47e3), R('RB2', 'p', 'b2', 51.7e3),
        C('C1', 'c2', 'b1', 10e-6, 0), C('C2', 'c1', 'b2', 10e-6, 0),
        Q('Q1', ['c1', 'b1', '0'], 'BC547B'), Q('Q2', ['c2', 'b2', '0'], 'BC547B'),
      ],
    },
    analysis: { type: 'tran', stopTime: 3, step: 1e-3, maxStep: 1e-3, useInitialConditions: true },
    probes: ['v(c1)'],
    // Schwingungen laufen bei kleinsten Unterschieden in der Phase auseinander → Periode vergleichen
    tolerance: { period: { probe: 'v(c1)', threshold: 4.5, rel: 0.01, after: 1 } },
  },
];
