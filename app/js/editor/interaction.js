// Bedienung der Zeichenfläche mit Maus, Trackpad, Stift und Finger – angelehnt an SchaltLab.
//
//   Anschluss anfassen und ziehen      → Leitung (rechtwinklig)
//   Anschluss antippen                  → Leitung im Klick-Modus: Eckpunkte klicken; Klick auf Anschluss
//                                         oder Leitung beendet, ebenso Doppelklick/Enter; Leertaste = Knick
//                                         wechseln, Esc = abbrechen
//   Bauteil ziehen                      → verschieben (Leitungen laufen mit)
//   Leitungsstück ziehen                → seitlich verschieben
//   Fläche ziehen                       → Auswahlrahmen; Leertaste/mittlere Taste/zwei Finger → Ansicht verschieben
//   Doppelklick auf Bauteil             → Eigenschaften
//   Tasten: R drehen, M spiegeln, Entf löschen, W Leitung, Strg/⌘+Z/Y, 0 einpassen, +/− zoomen

import { GRID, worldBox, probeFlag, probeText } from './view.js';
import { segmentDistance, onSegment } from './geometry.js';
import { cleanPoints } from './document.js';
import { INK_SELECTED, esc } from './svg.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const SWITCH_TYPES = new Set(['switch', 'button', 'changeover']);
const snapValue = (v) => Math.round(v / GRID) * GRID || 0;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

export class Interaction {
  /**
   * @param {object} deps
   * @param {import('./document.js').SchematicDocument} deps.doc
   * @param {import('./view.js').EditorView} deps.view
   * @param {() => void} deps.changed          neu zeichnen (nach jeder Änderung)
   * @param {(comp) => void} deps.openProperties
   * @param {(text?: string) => void} deps.status
   * @param {() => boolean} [deps.isLive]  läuft die Simulation? (dann lassen sich Schalter bedienen)
   * @param {() => Map} [deps.probeValues]  aktuelle Messwerte der Messpunkte (für die Fähnchengröße)
   * @param {(target) => string[]|null} [deps.describe]  Hinweistext beim Überfahren (Leitung/Bauteil)
   */
  constructor({ doc, view, changed, openProperties, status, isLive, probeValues, describe }) {
    Object.assign(this, { doc, view, changed, openProperties, status, isLive, probeValues, describe });
    this.hover = null; // { kind: 'wire'|'comp', … , at: [x, y] } für den Hinweistext
    this.selection = new Set();
    this.tool = 'select';
    this.wiring = null;
    this.drag = null;
    this.band = null;
    this.hoverPin = null;
    this.pointers = new Map();
    this.gesture = null;
    this.lastTap = null;
    this.spaceDown = false;

    const svg = view.svg;
    svg.addEventListener('pointerdown', (e) => this.onDown(e));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('pointercancel', (e) => this.onUp(e));
    svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Treffer ──

  pinAt([x, y], tol) {
    let best = null;
    for (const comp of this.doc.comps) {
      for (const pin of this.doc.pins(comp)) {
        const d = Math.hypot(pin.x - x, pin.y - y);
        if (d <= tol && (!best || d < best.d)) best = { comp, pin, d };
      }
    }
    return best;
  }

  compAt([x, y]) {
    for (let i = this.doc.comps.length - 1; i >= 0; i--) {
      const c = this.doc.comps[i];
      const [x1, y1, x2, y2] = worldBox(c);
      if (x >= x1 - 3 && x <= x2 + 3 && y >= y1 - 3 && y <= y2 + 3) return c;
    }
    return null;
  }

  /** Messpunkt am Fähnchen (part: 'flag') oder am Punkt (part: 'dot'). */
  probeAt([x, y], { dotOnly = false } = {}) {
    const probes = this.doc.probes;
    for (let i = probes.length - 1; i >= 0; i--) {
      const p = probes[i];
      if (!dotOnly) {
        const f = probeFlag(p, probeText(p, this.probeValues?.()));
        if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return { probe: p, part: 'flag' };
      }
      if (Math.hypot(p.x - x, p.y - y) <= 8 / this.view.z) return { probe: p, part: 'dot' };
    }
    return null;
  }

  /** Stelle für einen Messpunkt: Anschluss in der Nähe oder Rasterpunkt auf einer Leitung (sonst null). */
  probeSpot(p) {
    const pin = this.pinAt(p, 12 / this.view.z);
    if (pin) return [pin.pin.x, pin.pin.y];
    const hit = this.wireAt(p, 10 / this.view.z);
    if (!hit) return null;
    const [a, b] = [hit.wire.pts[hit.seg], hit.wire.pts[hit.seg + 1]];
    const clamp = (v, u, w) => Math.min(Math.max(v, Math.min(u, w)), Math.max(u, w));
    return a[1] === b[1] ? [clamp(snapValue(p[0]), a[0], b[0]), a[1]] : [a[0], clamp(snapValue(p[1]), a[1], b[1])];
  }

  wireAt(p, tol) {
    for (let i = this.doc.wires.length - 1; i >= 0; i--) {
      const w = this.doc.wires[i];
      for (let s = 0; s < w.pts.length - 1; s++) {
        if (segmentDistance(p, w.pts[s], w.pts[s + 1]) <= tol) return { wire: w, seg: s };
      }
    }
    return null;
  }

  /** Rasterpunkt oder – wenn in der Nähe – Anschluss. */
  snapPoint(p) {
    const hit = this.pinAt(p, 12 / this.view.z);
    return hit ? [hit.pin.x, hit.pin.y] : [snapValue(p[0]), snapValue(p[1])];
  }

  /** Richtung, in die die Leitung an einem Anschluss abgeht (W, E, N, S), sonst null. */
  dirAt(pt) {
    return this.pinAt(pt, 0.5)?.pin.d ?? null;
  }

  // ── Leitungen zeichnen ──

  /**
   * Rechtwinkliger Weg von a nach b (Grundidee wie SchaltLab).
   * dirA/dirB: Richtung, in die die Leitung am Anschluss abgehen soll. Liegt das Ziel „hinter“ dem
   * Anschluss, geht die Leitung erst einen Rasterschritt hinaus – sonst liefe sie durchs Bauteil.
   */
  route(a, b, dirA, dirB, flip) {
    const D = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
    const behind = (p, dir, q) => dir && (q[0] - p[0]) * D[dir][0] + (q[1] - p[1]) * D[dir][1] < 0;
    const step = (p, dir) => [p[0] + GRID * D[dir][0], p[1] + GRID * D[dir][1]];
    const toward = (p, dir, q) => (D[dir][0] ? (q[1] > p[1] ? 'S' : 'N') : (q[0] > p[0] ? 'E' : 'W')); // quer zu dir
    if (behind(a, dirA, b)) {
      const out = step(a, dirA);
      return [a, ...this.route(out, b, toward(out, dirA, b), dirB, flip)];
    }
    if (behind(b, dirB, a)) {
      const out = step(b, dirB);
      return [...this.route(a, out, dirA, toward(out, dirB, a), flip), b];
    }
    const axis = (d) => (d ? (d === 'W' || d === 'E' ? 'H' : 'V') : null);
    let axA = axis(dirA);
    const axB = axis(dirB);
    if (a[0] === b[0] || a[1] === b[1]) return [a, b];
    if (!axA) axA = axB ? (axB === 'H' ? 'V' : 'H') : Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'H' : 'V';
    if (flip) axA = axA === 'H' ? 'V' : 'H';
    if (axA === 'H' && axB === 'H') {
      const mx = snapValue((a[0] + b[0]) / 2);
      return [a, [mx, a[1]], [mx, b[1]], b];
    }
    if (axA === 'V' && axB === 'V') {
      const my = snapValue((a[1] + b[1]) / 2);
      return [a, [a[0], my], [b[0], my], b];
    }
    return axA === 'H' ? [a, [b[0], a[1]], b] : [a, [a[0], b[1]], b];
  }

  routeNow() {
    const { pts, cur, flip } = this.wiring;
    const last = pts.at(-1);
    let dirA = this.dirAt(last);
    if (pts.length > 1) {
      // nach einem Eckpunkt quer zum letzten Stück weiter, in Richtung Ziel
      dirA = pts.at(-2)[1] === last[1] ? (cur[1] >= last[1] ? 'S' : 'N') : (cur[0] >= last[0] ? 'E' : 'W');
    }
    return cleanPoints(this.route(last, cur, dirA, this.dirAt(cur), flip));
  }

  wirePreview() {
    if (!this.wiring) return [];
    const { pts, cur } = this.wiring;
    return same(pts.at(-1), cur) ? pts : cleanPoints([...pts, ...this.routeNow().slice(1)]);
  }

  startWire(pt, mode, e) {
    this.wiring = { pts: [pt], cur: pt, mode, moved: false, flip: false, sx: e?.clientX ?? 0, sy: e?.clientY ?? 0 };
    this.selection = new Set();
    this.changed();
  }

  finishWire() {
    if (!this.wiring) return;
    const pts = this.wirePreview();
    this.wiring = null;
    const wire = this.doc.addWire(pts);
    if (wire) {
      this.selection = new Set([wire.id]);
      this.doc.commit();
    }
    this.changed();
  }

  cancel() {
    this.wiring = null;
    this.drag = null;
    this.band = null;
    this.changed();
  }

  isConnectTarget(pt) {
    return Boolean(this.pinAt(pt, 0.5)) || this.doc.wires.some((w) => w.pts.some((_, i) => i > 0 && onSegment(pt, w.pts[i - 1], w.pts[i])));
  }

  wireClick(p) {
    const t = this.snapPoint(p);
    if (same(t, this.wiring.pts.at(-1))) {
      this.finishWire();
      return;
    }
    this.wiring.cur = t;
    this.wiring.pts = cleanPoints([...this.wiring.pts, ...this.routeNow().slice(1)]);
    if (this.isConnectTarget(t)) this.finishWire();
    else this.changed();
  }

  // ── Zeigerereignisse ──

  onDown(e) {
    try { this.view.svg.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) return this.startGesture();
    if (this.pointers.size > 2) return;
    if ((e.pointerType === 'mouse' && e.button === 1) || (this.spaceDown && e.button === 0)) {
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      e.preventDefault();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const p = this.view.toWorld(e.clientX, e.clientY);
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    this.hover = null;

    // Während der Simulation: Schalter bedienen statt auswählen (Ziehen verschiebt weiterhin).
    // Steht vor der Doppelklick-Erkennung, damit schnelles Umschalten keinen Dialog öffnet.
    const operable = !this.wiring && this.tool === 'select' && !multi && this.isLive?.() ? this.compAt(p) : null;
    if (operable && SWITCH_TYPES.has(operable.type) && !this.pinAt(p, 11 / this.view.z)) {
      this.lastTap = null;
      this.drag = { type: 'press', comp: operable, start: p, moved: false };
      if (operable.type === 'button') this.setButton(operable, true);
      return this.changed();
    }

    const now = Date.now();
    const double = this.lastTap && now - this.lastTap.t < 400 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 14;
    this.lastTap = double ? null : { t: now, x: e.clientX, y: e.clientY };
    if (double) return this.onDouble(p);

    if (this.wiring?.mode === 'click') return this.wireClick(p);
    if (this.tool === 'wire') return this.startWire(this.snapPoint(p), 'drag', e);
    if (this.tool === 'probe') return this.placeProbe(p);

    // Messpunkt: Fähnchen hat Vorrang; der Punkt selbst erst nach den Anschlüssen (sonst ließe sich
    // an einem Anschluss mit Messpunkt keine Leitung mehr ziehen)
    const flagHit = this.probeAt(p);
    const pinHit = this.pinAt(p, 11 / this.view.z);
    const probeHit = flagHit?.part === 'flag' || !pinHit ? flagHit : null;
    if (probeHit) {
      if (multi) this.toggle(probeHit.probe.id);
      else if (!this.selection.has(probeHit.probe.id)) this.selection = new Set([probeHit.probe.id]);
      this.startMove(p);
      return this.changed();
    }
    if (pinHit && !multi) return this.startWire([pinHit.pin.x, pinHit.pin.y], 'drag', e);

    const comp = this.compAt(p);
    if (comp) {
      if (multi) this.toggle(comp.id);
      else if (!this.selection.has(comp.id)) this.selection = new Set([comp.id]);
      this.startMove(p);
      return this.changed();
    }
    const wireHit = this.wireAt(p, 7 / this.view.z);
    if (wireHit) {
      if (multi) {
        this.toggle(wireHit.wire.id);
        this.startMove(p);
      } else if (this.selection.size > 1 && this.selection.has(wireHit.wire.id)) {
        this.startMove(p);
      } else {
        this.selection = new Set([wireHit.wire.id]);
        this.drag = { type: 'segment', wire: wireHit.wire, seg: wireHit.seg, start: p, base: clone(wireHit.wire.pts), moved: false };
      }
      return this.changed();
    }
    if (!multi) this.selection = new Set();
    this.band = { x1: p[0], y1: p[1], x2: p[0], y2: p[1], multi };
    this.drag = { type: 'band' };
    this.changed();
  }

  toggle(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
  }

  startMove(p) {
    this.drag = {
      type: 'move', start: p, moved: false,
      base: { comps: clone(this.doc.comps), wires: clone(this.doc.wires), probes: clone(this.doc.probes) },
    };
  }

  placeProbe(p) {
    const spot = this.probeSpot(p);
    if (!spot) {
      this.status('Messpunkt bitte auf eine Leitung oder einen Anschluss setzen.');
      return;
    }
    const probe = this.doc.addProbe(...spot);
    this.doc.commit();
    this.selection = new Set([probe.id]);
    this.status(`Messpunkt ${probe.label} gesetzt – weitere Punkte anklicken, Esc beendet.`);
    this.changed();
  }

  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.gesture) return this.moveGesture();
    const p = this.view.toWorld(e.clientX, e.clientY);
    if (this.drag) return this.dragMove(e, p);
    if (this.wiring) {
      this.wiring.cur = this.snapPoint(p);
      if (this.wiring.mode === 'drag' && Math.hypot(e.clientX - this.wiring.sx, e.clientY - this.wiring.sy) > 5) this.wiring.moved = true;
      this.hoverPin = this.pinAt(p, 12 / this.view.z);
      return this.changed();
    }
    // Hover: Anschluss hervorheben, Hinweis zu Leitung/Bauteil, Mauszeiger anpassen
    const pinHit = this.pinAt(p, 11 / this.view.z);
    const before = this.hoverPin && `${this.hoverPin.comp.id}:${this.hoverPin.pin.name}`;
    const after = pinHit && `${pinHit.comp.id}:${pinHit.pin.name}`;
    this.hoverComp = this.compAt(p);
    const wireHit = !this.hoverComp && this.wireAt(p, 7 / this.view.z);
    const hover = this.hoverComp ? { kind: 'comp', comp: this.hoverComp, at: p }
      : wireHit ? { kind: 'wire', wire: wireHit.wire, at: p }
        : pinHit ? { kind: 'pin', comp: pinHit.comp, pin: pinHit.pin, at: p } : null;
    const hoverChanged = (hover?.comp?.id ?? hover?.wire?.id ?? null) !== (this.hover?.comp?.id ?? this.hover?.wire?.id ?? null);
    this.hover = hover;
    if (before !== after || hoverChanged || hover) {
      this.hoverPin = pinHit;
      this.changed();
    }
    if (pinHit) this.status(`${pinHit.comp.label || pinHit.comp.type} · Anschluss ${pinHit.pin.name}`);
    else if (before) this.status(); // Anschluss verlassen → wieder die Übersicht
    const operable = this.hoverComp && this.isLive?.() && SWITCH_TYPES.has(this.hoverComp.type);
    this.view.svg.style.cursor = pinHit || this.tool !== 'select' ? 'crosshair' : operable ? 'pointer'
      : this.hoverComp || this.probeAt(p) ? 'move' : 'default';
  }

  /** Taster drücken/loslassen: nur ein Zustand während der Bedienung, kein Rückgängig-Schritt. */
  setButton(comp, pressed) {
    comp.params = { ...comp.params, closed: pressed };
  }

  dragMove(e, p) {
    const d = this.drag;
    if (d.type === 'press') {
      // doch gezogen → Taster loslassen und wie gewohnt verschieben
      if (Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) * this.view.z < 6) return;
      if (d.comp.type === 'button') this.setButton(d.comp, false);
      this.selection = new Set([d.comp.id]);
      this.startMove(d.start);
      return this.dragMove(e, p);
    }
    if (d.type === 'pan') {
      this.view.x = d.vx + (e.clientX - d.sx);
      this.view.y = d.vy + (e.clientY - d.sy);
    } else if (d.type === 'band') {
      this.band.x2 = p[0];
      this.band.y2 = p[1];
    } else if (d.type === 'move') {
      const dx = snapValue(p[0] - d.start[0]);
      const dy = snapValue(p[1] - d.start[1]);
      if (dx || dy) d.moved = true;
      // vom Stand bei Beginn des Ziehens aus neu rechnen (sonst sammeln sich Knicke an)
      this.doc.comps = clone(d.base.comps);
      this.doc.wires = clone(d.base.wires);
      this.doc.probes = clone(d.base.probes);
      for (const w of this.doc.wires) if (this.selection.has(w.id)) w.pts = w.pts.map(([x, y]) => [x + dx, y + dy]);
      for (const pr of this.doc.probes) if (this.selection.has(pr.id)) Object.assign(pr, { x: pr.x + dx, y: pr.y + dy });
      this.doc.moveComponents([...this.selection].filter((id) => this.doc.getComp(id)), dx, dy);
    } else if (d.type === 'segment') {
      const base = clone(d.base);
      let i = d.seg;
      const horizontal = base[i][1] === base[i + 1][1];
      const delta = horizontal ? snapValue(p[1] - d.start[1]) : snapValue(p[0] - d.start[0]);
      if (delta) {
        d.moved = true;
        // Endstücke an Anschlüssen bleiben stehen: Zwischenpunkt einfügen
        if (i === 0) { base.unshift([...base[0]]); i++; }
        if (i + 1 === base.length - 1) base.push([...base.at(-1)]);
        const k = horizontal ? 1 : 0;
        base[i][k] += delta;
        base[i + 1][k] += delta;
      }
      d.wire.pts = base;
    }
    this.changed();
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    try { this.view.svg.releasePointerCapture(e.pointerId); } catch { /* ältere Browser */ }
    if (this.wiring?.mode === 'drag') {
      if (this.wiring.moved && !same(this.wiring.cur, this.wiring.pts.at(-1))) this.finishWire();
      else {
        this.wiring.mode = 'click';
        this.changed();
      }
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.type === 'press') {
      const { comp } = d;
      if (comp.type === 'button') this.setButton(comp, false);
      else if (comp.type === 'switch') this.doc.setParams(comp.id, { closed: !comp.params.closed });
      else this.doc.setParams(comp.id, { position: comp.params.position === 'a' ? 'b' : 'a' });
      if (comp.type !== 'button') this.doc.commit();
      return this.changed();
    }
    if (d.type === 'band') this.finishBand();
    if (d.type === 'segment') d.wire.pts = cleanPoints(d.wire.pts);
    if (d.type === 'move' && d.moved && [...this.selection].every((id) => this.doc.getProbe(id))) {
      // nur Messpunkte verschoben: auf die nächste Leitung bzw. den nächsten Anschluss einrasten
      for (const id of this.selection) {
        const pr = this.doc.getProbe(id);
        const spot = this.probeSpot([pr.x, pr.y]);
        if (spot) Object.assign(pr, { x: spot[0], y: spot[1] });
      }
    }
    if ((d.type === 'move' || d.type === 'segment') && d.moved) this.doc.commit();
    this.changed();
  }

  finishBand() {
    const b = this.band;
    this.band = null;
    const [x1, x2] = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)];
    const [y1, y2] = [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];
    if (x2 - x1 < 3 && y2 - y1 < 3) return;
    for (const c of this.doc.comps) {
      const [a1, b1, a2, b2] = worldBox(c);
      if (a2 >= x1 && a1 <= x2 && b2 >= y1 && b1 <= y2) this.selection.add(c.id);
    }
    for (const w of this.doc.wires) {
      const hit = w.pts.some((p, i) => i > 0 && Math.max(p[0], w.pts[i - 1][0]) >= x1 && Math.min(p[0], w.pts[i - 1][0]) <= x2 &&
        Math.max(p[1], w.pts[i - 1][1]) >= y1 && Math.min(p[1], w.pts[i - 1][1]) <= y2);
      if (hit) this.selection.add(w.id);
    }
    for (const pr of this.doc.probes) if (pr.x >= x1 && pr.x <= x2 && pr.y >= y1 && pr.y <= y2) this.selection.add(pr.id);
  }

  onDouble(p) {
    if (this.wiring?.mode === 'click') return this.finishWire();
    const comp = this.compAt(p);
    if (comp) {
      this.selection = new Set([comp.id]);
      this.changed();
      this.openProperties(comp);
    }
  }

  // ── Zoom und Gesten ──

  onWheel(e) {
    e.preventDefault();
    const px = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * px;
    const dy = e.deltaY * px;
    const mouseLike = e.deltaMode !== 0 || (dx === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (e.ctrlKey || mouseLike) {
      this.view.zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)));
    } else {
      // Trackpad: zwei Finger schieben
      this.view.x -= dx;
      this.view.y -= dy;
    }
    this.changed();
  }

  startGesture() {
    const [a, b] = [...this.pointers.values()];
    this.drag = null;
    this.band = null;
    this.gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    this.changed();
  }

  moveGesture() {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const g = this.gesture;
    this.view.x += mx - g.mx;
    this.view.y += my - g.my;
    if (g.dist > 10) this.view.zoomAt(mx, my, dist / g.dist);
    Object.assign(g, { dist, mx, my });
    this.changed();
  }

  // ── Befehle ──

  selectedComps() {
    return [...this.selection].filter((id) => this.doc.getComp(id));
  }

  rotate() {
    const ids = this.selectedComps();
    if (!ids.length) return;
    this.doc.rotateComponents(ids);
    this.doc.commit();
    this.changed();
  }

  mirror() {
    const ids = this.selectedComps();
    if (!ids.length) return;
    this.doc.mirrorComponents(ids);
    this.doc.commit();
    this.changed();
  }

  deleteSelection() {
    if (!this.selection.size) return;
    this.doc.delete([...this.selection]);
    this.selection = new Set();
    this.doc.commit();
    this.changed();
  }

  setTool(tool) {
    this.tool = tool;
    if (tool !== 'wire') this.wiring = null;
    this.changed();
  }

  /** Hilfsgrafik: Anschlusspunkte, Leitungsvorschau, Eckpunkte, Auswahlrahmen. */
  overlaySVG() {
    let s = '';
    const showAll = Boolean(this.wiring) || this.tool !== 'select';
    const hoverKey = this.hoverPin && `${this.hoverPin.comp.id}:${this.hoverPin.pin.name}`;
    for (const comp of this.doc.comps) {
      if (!(showAll || this.selection.has(comp.id) || this.hoverComp?.id === comp.id)) continue;
      for (const pin of this.doc.pins(comp)) {
        const hot = hoverKey === `${comp.id}:${pin.name}`;
        s += `<circle cx="${pin.x}" cy="${pin.y}" r="${hot ? 6 : 4}" fill="${hot ? INK_SELECTED : '#fff'}" stroke="${INK_SELECTED}" stroke-width="1.5"/>`;
      }
    }
    if (this.wiring) {
      const pts = this.wirePreview();
      if (pts.length >= 2) {
        s += `<polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${INK_SELECTED}" stroke-width="2" stroke-linejoin="round" opacity="0.85"/>`;
      }
      s += `<circle cx="${this.wiring.cur[0]}" cy="${this.wiring.cur[1]}" r="3.5" fill="${INK_SELECTED}"/>`;
    }
    const wires = [...this.selection].filter((id) => !this.doc.getComp(id));
    if (wires.length === 1 && !this.wiring) {
      const w = this.doc.wires.find((x) => x.id === wires[0]);
      w?.pts.forEach(([x, y]) => { s += `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#fff" stroke="${INK_SELECTED}" stroke-width="1.5"/>`; });
    }
    const lines = !this.drag && !this.wiring && this.hover ? this.describe?.(this.hover) : null;
    if (lines?.length) {
      // Hinweis neben dem Mauszeiger (feste Größe auf dem Bildschirm, unabhängig vom Zoom)
      const k = 1 / this.view.z;
      const w = (12 + Math.max(...lines.map((l) => l.length)) * 7) * k;
      const h = (8 + lines.length * 16) * k;
      const [x, y] = [this.hover.at[0] + 14 * k, this.hover.at[1] + 14 * k];
      s += `<g pointer-events="none"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${5 * k}" fill="#0f172a" opacity="0.88"/>`;
      lines.forEach((line, i) => {
        s += `<text x="${x + 6 * k}" y="${y + (17 + i * 16) * k}" font-size="${12 * k}" font-family="Helvetica, Arial, sans-serif" fill="#f8fafc">${esc(line)}</text>`;
      });
      s += '</g>';
    }
    if (this.band) {
      const { x1, y1, x2, y2 } = this.band;
      s += `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" ` +
        `fill="rgba(37,99,235,0.08)" stroke="${INK_SELECTED}" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    return s;
  }

  /** Tastatur (nur wenn kein Eingabefeld aktiv ist). Liefert true, wenn die Taste verwendet wurde. */
  onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ' && !mod) {
      if (this.wiring) { this.wiring.flip = !this.wiring.flip; this.changed(); } else this.spaceDown = true;
      return true;
    }
    if (e.key === 'Escape') { this.cancel(); this.setTool('select'); return true; }
    if (e.key === 'Enter' && this.wiring) { this.finishWire(); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelection(); return true; }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { this.doc.undo(); this.selection = new Set(); this.changed(); return true; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { this.doc.redo(); this.selection = new Set(); this.changed(); return true; }
    if (mod) return false;
    const k = e.key.toLowerCase();
    if (k === 'r') { this.rotate(); return true; }
    if (k === 'm') { this.mirror(); return true; }
    if (k === 'w') { this.setTool(this.tool === 'wire' ? 'select' : 'wire'); return true; }
    if (k === 'p') { this.setTool(this.tool === 'probe' ? 'select' : 'probe'); return true; }
    return false;
  }

  onKeyUp(e) {
    if (e.key === ' ') this.spaceDown = false;
  }
}
