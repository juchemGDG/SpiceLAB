// Beispielschaltungen für den Unterricht. Jede wird mit der Zeichnungs-API aufgebaut (wie in den Tests);
// nach dem Öffnen wird sie simuliert, bei scope: true mit offenem Oszilloskop.

import { SchematicDocument } from '../editor/document.js';

/** Kleine Hilfen, damit die Beispiele lesbar bleiben. */
function builder() {
  const d = new SchematicDocument();
  const add = (type, x, y, params = {}, { rot = 0, mir = false } = {}) => {
    const c = d.addComponent(type, x, y);
    for (let i = 0; i < rot / 90; i++) d.rotateComponents([c.id]);
    if (mir) d.mirrorComponents([c.id]);
    d.setParams(c.id, params);
    return c;
  };
  const wire = (...pts) => d.addWire(pts);
  const probe = (x, y) => d.addProbe(x, y);
  return { d, add, wire, probe };
}

export const EXAMPLES = [
  {
    id: 'led',
    title: 'LED mit Vorwiderstand',
    level: 'Physik 9/10 · NwT',
    text: 'Strom- und Spannungsmesser zeigen I und U an der LED. Ändere den Vorwiderstand (Doppelklick) – unter etwa 220 Ω wird die LED überlastet.',
    build() {
      const { d, add, wire } = builder();
      add('battery', 0, 120, { type: 'block9V' }, { rot: 90 }); // + (0,80), − (0,160)
      add('ammeter', 80, 0); // + (40,0), − (120,0)
      add('resistor', 200, 0, { value: 330 }); // (160,0)–(240,0)
      add('led', 280, 120, { type: 'rot' }, { rot: 90 }); // A (280,80), K (280,160)
      add('voltmeter', 380, 120, {}, { rot: 90 }); // + (380,80), − (380,160)
      wire([0, 80], [0, 0], [40, 0]);
      wire([120, 0], [160, 0]);
      wire([240, 0], [280, 0], [280, 80]);
      wire([280, 40], [380, 40], [380, 80]);
      wire([280, 160], [280, 240], [0, 240], [0, 160]);
      wire([380, 160], [380, 240], [280, 240]);
      add('gnd', 0, 240);
      return d;
    },
  },
  {
    id: 'lamps',
    title: 'Reihen- und Parallelschaltung von Lampen',
    level: 'Physik 7/8',
    text: 'Links zwei Lampen in Reihe, rechts zwei parallel – an derselben Spannung. Vergleiche Helligkeit und Ströme. Mit der Maus über Bauteile fahren zeigt U und I.',
    build() {
      const { d, add, wire } = builder();
      add('powerSupply', 0, 160, { voltage: 6 }, { rot: 90 }); // + (0,120), − (0,200)
      // Reihenschaltung (eigener Strommesser)
      add('ammeter', 80, 0); // (40,0)–(120,0)
      add('lamp', 160, 80, { type: '6V_0A1' }, { rot: 90 }); // (160,40)–(160,120)
      add('lamp', 160, 200, { type: '6V_0A1' }, { rot: 90 }); // (160,160)–(160,240)
      wire([0, 120], [0, 0], [40, 0]);
      wire([120, 0], [160, 0], [160, 40]);
      wire([160, 120], [160, 160]);
      wire([160, 240], [160, 320], [0, 320], [0, 200]);
      // Parallelschaltung (zweigt vor dem ersten Strommesser ab, eigener Strommesser)
      add('ammeter', 300, 0); // (260,0)–(340,0)
      add('lamp', 380, 140, { type: '6V_0A1' }, { rot: 90 }); // (380,100)–(380,180)
      add('lamp', 480, 140, { type: '6V_0A1' }, { rot: 90 }); // (480,100)–(480,180)
      wire([20, 0], [20, -60], [260, -60], [260, 0]);
      wire([340, 0], [380, 0], [380, 100]);
      wire([380, 40], [480, 40], [480, 100]);
      wire([380, 180], [380, 320], [160, 320]);
      wire([480, 180], [480, 320], [380, 320]);
      add('gnd', 0, 320);
      return d;
    },
  },
  {
    id: 'twilight',
    title: 'Dämmerungsschalter mit Fotowiderstand',
    level: 'NwT',
    text: 'Messpunkt A zeigt die Spannung am Spannungsteiler. Stelle am LDR (Doppelklick) die Beleuchtungsstärke ein, z. B. 2 lx (dunkel) oder 500 lx (hell).',
    build() {
      const { d, add, wire, probe } = builder();
      add('battery', 100, 260, { type: 'block9V' }, { rot: 90 });
      add('resistor', 240, 160, { value: 47000 }, { rot: 90 });
      add('ldr', 240, 340, { illuminance: 2 }, { rot: 90 });
      add('resistor', 320, 260, { value: 10000 });
      add('npn', 400, 260);
      add('resistor', 420, 60, { value: 330 }, { rot: 90 });
      add('led', 420, 160, {}, { rot: 90 });
      wire([100, 220], [100, 20], [420, 20]); wire([240, 120], [240, 20]); wire([240, 200], [240, 300]);
      wire([280, 260], [240, 260]); wire([420, 100], [420, 120]); wire([420, 200], [420, 220]);
      wire([100, 300], [100, 420], [420, 420], [420, 300]); wire([240, 380], [240, 420]);
      add('gnd', 100, 420);
      probe(240, 240);
      return d;
    },
  },
  {
    id: 'rc',
    title: 'Kondensator laden und entladen',
    level: 'Physik Kursstufe',
    text: 'Eine Rechteckspannung lädt und entlädt den Kondensator über den Widerstand. Am Oszilloskop: Eingang (A) und Kondensatorspannung (B). Bei τ = R·C sind 63 % erreicht.',
    scope: true,
    build() {
      const { d, add, wire, probe } = builder();
      add('square', 0, 0, { frequency: 25, high: 5, low: 0 }, { rot: 90 }); // 1 (0,−40), 2 (0,40)
      add('resistor', 100, -40, { value: 1000 }); // (60,−40)–(140,−40)
      add('elko', 200, 0, { value: 4.7e-6 }, { rot: 90 }); // + (200,−40), − (200,40)
      wire([0, -40], [60, -40]); wire([140, -40], [200, -40]); wire([0, 40], [200, 40]);
      add('gnd', 0, 40);
      probe(30, -40); probe(200, -40);
      return d;
    },
  },
  {
    id: 'blinker',
    title: 'Wechselblinker (astabiler Multivibrator)',
    level: 'NwT',
    text: 'Zwei Transistoren schalten sich gegenseitig ab. Am Oszilloskop siehst du die Kollektorspannungen; fahre mit der Maus über den Bildschirm und beobachte die LEDs.',
    scope: true,
    build() {
      const { d, add, wire, probe } = builder();
      add('battery', 0, 200, { type: 'block9V' }, { rot: 90 });
      add('resistor', 160, 60, { value: 680 }, { rot: 90 }); add('led', 160, 160, { type: 'rot' }, { rot: 90 });
      add('resistor', 480, 60, { value: 680 }, { rot: 90 }); add('led', 480, 160, { type: 'gruen' }, { rot: 90 });
      add('resistor', 260, 60, { value: 47000 }, { rot: 90 }); add('resistor', 380, 60, { value: 51000 }, { rot: 90 });
      add('npn', 140, 280); add('npn', 460, 280);
      add('elko', 320, 220, { value: 10e-6 });
      add('elko', 320, 340, { value: 10e-6 }, { mir: true });
      wire([0, 160], [0, 0], [480, 0], [480, 20]); wire([160, 0], [160, 20]); wire([260, 0], [260, 20]); wire([380, 0], [380, 20]);
      wire([160, 100], [160, 120]); wire([480, 100], [480, 120]);
      wire([160, 200], [160, 240]); wire([480, 200], [480, 240]);
      wire([160, 220], [280, 220]); wire([360, 220], [380, 220], [380, 100]);
      wire([380, 220], [380, 280], [420, 280]);
      wire([480, 220], [400, 220], [400, 340], [360, 340]); wire([280, 340], [260, 340], [260, 100]);
      wire([260, 280], [100, 280]);
      wire([160, 320], [160, 400], [480, 400], [480, 320]); wire([0, 240], [0, 400], [160, 400]);
      add('gnd', 0, 400);
      probe(160, 220); probe(480, 220);
      return d;
    },
  },
  {
    id: 'transformer',
    title: 'Transformator mit Last',
    level: 'Physik 9/10',
    text: 'Primär 12 V Wechselspannung (Scheitelwert 17 V), Übersetzung 1:2 aufwärts. Oszilloskop: Primärspannung (A) und Sekundärspannung (B).',
    scope: true,
    build() {
      const { d, add, wire, probe } = builder();
      add('sine', 0, 0, { amplitude: 17, frequency: 50 }, { rot: 90 }); // 1 (0,−40), 2 (0,40)
      add('transformer', 140, 0, { primary: 1, ratio: 2, k: 0.98 }); // P1 (100,−40), P2 (100,40), S1 (180,−40), S2 (180,40)
      add('resistor', 260, 0, { value: 1000 }, { rot: 90 }); // (260,−40)–(260,40)
      wire([0, -40], [100, -40]); wire([0, 40], [100, 40]);
      wire([180, -40], [260, -40]); wire([180, 40], [260, 40]);
      add('gnd', 0, 40);
      probe(50, -40); probe(220, -40);
      return d;
    },
  },
];
