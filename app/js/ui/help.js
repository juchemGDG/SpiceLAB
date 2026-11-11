// Hilfe & Bedienung (Inhalt als HTML, damit er leicht zu pflegen ist).

const HELP = `
<section>
  <h3>Bauteile</h3>
  <ul>
    <li>Bauteil aus der linken Leiste auf die Fläche <b>ziehen</b> – oder in der Leiste <b>doppelklicken</b>, dann erscheint es in der Mitte.</li>
    <li><b>Werte ändern</b> (z. B. Widerstand, LED-Farbe, Batterietyp): <b>Doppelklick</b> auf das Bauteil.</li>
    <li><b>Drehen:</b> <kbd>R</kbd> oder „Drehen“. <b>Spiegeln:</b> <kbd>M</kbd>. Angeschlossene Leitungen laufen mit.</li>
    <li><b>Löschen:</b> markieren, dann <kbd>Entf</kbd> oder „Löschen“.</li>
  </ul>
</section>
<section>
  <h3>Leitungen</h3>
  <ul>
    <li>An einem <b>Anschluss</b> (blauer Kreis) anfassen und zum Ziel ziehen – die Leitung wird rechtwinklig geführt.</li>
    <li>Oder Anschluss <b>antippen</b> und Eckpunkte nacheinander anklicken; ein Klick auf einen Anschluss oder eine Leitung beendet die Leitung, ebenso Doppelklick oder <kbd>Enter</kbd>. <kbd>Leertaste</kbd> wechselt die Knickrichtung, <kbd>Esc</kbd> bricht ab.</li>
    <li>Endet eine Leitung auf einer anderen, sind beide verbunden (dicker Punkt). <b>Leitungen, die sich nur kreuzen, sind nicht verbunden.</b></li>
    <li>Ein Leitungsstück lässt sich anfassen und seitlich verschieben.</li>
  </ul>
</section>
<section>
  <h3>Simulieren</h3>
  <ul>
    <li><b>▶ Simulieren</b> (oder <kbd>F5</kbd>) berechnet die Schaltung; LEDs und Lampen leuchten.</li>
    <li><b>Messen wie mit einer Prüfspitze:</b> „Messpunkt“ (<kbd>P</kbd>) wählen und auf eine Leitung oder einen Anschluss klicken. Das Fähnchen zeigt das <b>Potenzial gegen Masse</b>. Messpunkte lassen sich am Fähnchen verschieben und mit <kbd>Entf</kbd> löschen. Die Spannung an einem Bauteil ist der Unterschied der Potenziale an seinen Anschlüssen.</li>
    <li><b>Mit der Maus über eine Leitung</b> fahren zeigt ihr Potenzial, <b>über ein Bauteil</b> seine Spannung <span style="color:#2563eb"><b>U</b></span> und seinen Strom <span style="color:#ea580c"><b>I</b></span>.</li>
    <li><b>Alle Werte</b> blendet Spannung und Strom an allen Bauteilen ein (z. B. zur Kontrolle).</li>
    <li>Nach dem Simulieren wird bei jeder Änderung automatisch neu gerechnet – ändere z. B. einen Widerstand oder die Helligkeit am LDR und beobachte die Messpunkte.</li>
    <li><b>Schalter</b> und <b>Umschalter</b> schaltest du während der Simulation per Klick um. Ein <b>Taster</b> leitet nur, solange du ihn gedrückt hältst.</li>
    <li>Ohne <b>Masse</b>-Symbol nimmt SpiceLab den Minuspol der Quelle als Bezugspunkt (0 V). Teile ohne Spannungsquelle werden übersprungen.</li>
    <li>Rote Warnungen zeigen Überlastung (z. B. zu viel Strom durch eine LED) – in echt würde das Bauteil kaputtgehen.</li>
  </ul>
</section>
<section>
  <h3>Oszilloskop</h3>
  <ul>
    <li><b>〜 Oszilloskop</b> (oder <kbd>O</kbd>) öffnet unten einen Bildschirm. Jeder <b>Messpunkt</b> wird eine Kurve in seiner Farbe – setze also zuerst Messpunkte.</li>
    <li><b>Zeit</b> und <b>Spannung</b> stellst du wie am echten Gerät pro Kästchen (Div) ein; „Auto“ zeigt bei Wechsel- und Rechteckspannungen etwa drei Perioden, sonst 1 Sekunde.</li>
    <li><b>Zeitlupe:</b> Fahre mit der Maus über den Bildschirm (Tablet: tippen). Die Messpunkte zeigen dann die Werte zu diesem Zeitpunkt, und LEDs leuchten so, wie sie es in diesem Moment täten.</li>
    <li>„Kondensatoren zu Beginn entladen“ startet jede Messung mit leeren Kondensatoren – wie nach dem Zusammenstecken. Ohne Häkchen beginnt die Messung im eingeschwungenen Zustand.</li>
    <li>Änderst du die Schaltung, misst das Oszilloskop nach einem kurzen Moment neu.</li>
  </ul>
</section>
<section>
  <h3>Zahlen eingeben</h3>
  <ul>
    <li>Komma oder Punkt: <code>4,7</code> = <code>4.7</code>. Vorsätze: <code>p n µ (oder u) m k M G</code>, z. B. <code>4,7k</code>, <code>4k7</code>, <code>100n</code>, <code>2,2 mH</code>.</li>
    <li>Groß- und Kleinschreibung zählt: <b>M = Mega</b>, <b>m = Milli</b>.</li>
  </ul>
</section>
<section>
  <h3>Ansicht und Dateien</h3>
  <ul>
    <li><b>Zoomen:</b> Mausrad, Trackpad (zwei Finger spreizen), Tablet (zwei Finger) oder die Knöpfe unten rechts; <kbd>0</kbd> passt die Ansicht an.</li>
    <li><b>Verschieben:</b> <kbd>Leertaste</kbd>+Ziehen, mittlere Maustaste oder zwei Finger.</li>
    <li><b>Speichern</b> legt eine Datei <code>*.spicelab.json</code> an; <b>Laden</b> öffnet sie wieder. Klick auf den Namen oben benennt die Schaltung um.</li>
    <li><b>PNG</b> und <b>SVG</b> speichern die Zeichnung als Bild, z. B. für Arbeitsblätter (mit Messwerten, wenn simuliert wurde).</li>
    <li>Rückgängig <kbd>Strg/⌘</kbd>+<kbd>Z</kbd> · Wiederholen <kbd>Strg/⌘</kbd>+<kbd>Y</kbd> · Kopieren <kbd>Strg/⌘</kbd>+<kbd>C</kbd> · Einfügen <kbd>Strg/⌘</kbd>+<kbd>V</kbd> · Alles markieren <kbd>Strg/⌘</kbd>+<kbd>A</kbd></li>
  </ul>
</section>
<section>
  <h3>Wie genau ist die Simulation?</h3>
  <ul>
    <li>SpiceLab rechnet nach dem gleichen Verfahren wie der Profi-Simulator SPICE und wurde mit ngspice abgeglichen.</li>
    <li>Die Bauteile verhalten sich wie typische Exemplare laut Datenblatt. Echte Bauteile streuen – eine LED kann z. B. 1,9 V statt 2,0 V haben.</li>
    <li>Nicht nachgebildet sind u. a.: Erwärmung von Widerständen, Prellen von Schaltern, Entladung von Batterien über die Zeit.</li>
  </ul>
</section>`;

export function openHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div id="help-box" role="dialog" aria-labelledby="help-title">
    <div id="help-head"><h2 id="help-title">Hilfe &amp; Bedienung</h2><button id="help-close" title="Schließen (Esc)">✕</button></div>
    <div id="help-body">${HELP}</div></div>`;
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#help-close').addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
}
