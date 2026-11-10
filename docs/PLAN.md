# SpiceLab – Schaltungssimulation für den Unterricht

Schwester von PAP-Editor und SchaltLab: Schaltungen zeichnen und simulieren wie in LTspice,
aber reduziert auf das, was im Gymnasium in Baden-Württemberg (Physik, NwT, IMP) gebraucht wird.
Läuft im Browser und als Desktop-Programm (Tauri 2). Lehrplanbezug: `docs/LEHRPLAN.md`.

## Ziele
1. **Realitätsnah:** Ergebnisse sollen zu einem Aufbau mit echten Bauteilen passen
   (Datenblattwerte, Innenwiderstände von Quellen und Messgeräten, Kennlinien statt Idealbauteilen).
2. **Einfach:** wenige, echte Bauteiltypen aus dem Schulsortiment statt riesiger Bibliotheken;
   keine SPICE-Direktiven, keine Netzlisten, keine Solver-Einstellungen in der Oberfläche.
3. **Transparent:** kleiner, kommentierter Code ohne Framework; jeder Schritt ein eigener Commit.

## Entscheidungen
- **Eigener Simulationskern in JavaScript** nach dem SPICE-Verfahren (modifizierte Knotenanalyse, MNA)
  statt ngspice als WebAssembly. Grund: nachvollziehbar, klein, offline, keine Fremdlizenz im Kern.
  Realitätsnähe kommt aus den Bauteilmodellen und -parametern, nicht aus dem Solver.
  ngspice dient nur auf dem Entwicklungsrechner als Referenz (Vergleichswerte in den Tests).
- **Vanilla JavaScript mit ES-Modulen**, kein Framework, kein Bundler. Die Web-App ist der Ordner `app/`
  und wird unverändert ausgeliefert. ES-Module laden nicht über `file://`, deshalb lokal `npm run dev`.
- **Simulationskern ohne DOM** (`app/js/engine/`): läuft im Browser, in einem Web Worker und in Node (Tests).
- **Tests mit `node --test`**, keine Abhängigkeiten.
- **Desktop mit Tauri 2** (nicht Electron wie SchaltLab): lädt `app/` unverändert; Rust nur für Fenster
  und Dateidialoge. Kleines Installationspaket.
- **Design wie PAP-Editor** (`docs/design/tokens.md`): dunkle Seitenleiste mit Bauteilkarten, helle Arbeitsfläche.
- **Zahlen deutsch** (Komma) mit SI-Vorsätzen: `4,7k`, `100n`, `2µ`, `1M`.
- **Code-Bezeichner englisch, Kommentare und Oberfläche deutsch.**
- **Vorzeichen im Kern:** Spannung `U = φ(Anschluss 1) − φ(Anschluss 2)`, Strom `I` fließt im Bauteil
  von Anschluss 1 nach Anschluss 2 (wie SPICE). Die Oberfläche zeigt später Beträge mit Pfeilen.

## Ordner
```
app/                 Web-App (wird 1:1 ausgeliefert und von Tauri geladen)
  js/engine/         Simulationskern (Gleichungslöser, MNA, Analysen)
  js/engine/elements/  ein Bauteilmodell je Datei
  js/library/        Bauteilbibliothek mit Datenblattwerten (Phase 4)
  js/editor/         Schaltplan-Editor (Phase 6)
  js/ui/             Messgeräte, Oszilloskop, Diagramme (Phase 7)
src-tauri/           Desktop-Hülle (Phase 9)
tests/               node --test
tools/               Hilfsskripte (Entwicklungsserver, Referenzwerte)
docs/                Plan, Lehrplanbezug, Design
```

## Phasen
0. Vorbereitung: Repo, Plan, Lehrplanbezug, Design-Tokens, Testgerüst
1. Simulationskern linear (DC): Gleichungslöser, MNA, Widerstand, Spannungs- und Stromquelle, Arbeitspunkt
2. Nichtlinear: Newton-Raphson mit Konvergenzhilfen (Dämpfung, Gmin, Quellenrampe);
   Diode, LED (nach Farbe), Z-Diode, Glühlampe (temperaturabhängiger Widerstand)
3. Zeitverlauf (Transient): Kondensator, Spule, Trapez-/Euler-Verfahren, Schrittweitensteuerung;
   Quellen Sinus/Rechteck/Puls, zeitgesteuerte Schalter
4. Bauteilbibliothek: Batterie/Netzgerät mit Innenwiderstand, Poti, LDR, NTC, Taster/Schalter,
   NPN/PNP (BC547, BC557, BC337, BD139), MOSFET (BS170, IRLZ44N), OPV (LM358, TL072), Motor, Summer
5. Referenztests gegen ngspice, Dokumentation der Modellgrenzen
6. Editor im SchaltLab-/PAP-Stil: Bauteilkarten, Raster, Leitungen, Drehen/Spiegeln, Eigenschaften,
   Rückgängig, Speichern/Laden (JSON), Bildexport
7. Messen und Anzeigen: Volt-/Amperemeter als Bauteile (mit Innenwiderstand), Werte am Bauteil,
   Stromrichtung, Oszilloskop (2 Kanäle), Kennlinienschreiber (DC-Sweep), Frequenzgang (Kursstufe)
8. Unterrichtshilfen: Beispielschaltungen je Klassenstufe, Hilfe & Bedienung, Fehlermeldungen in Schülersprache
9. Desktop (Tauri 2), Paketierung macOS/Windows/Linux, GitHub-Workflow, Web-Auslieferung,
   Einbettung `?embed=1` (Protokoll wie PAP-Editor/SchaltLab)
10. Test mit Schülern

## Commit-Konventionen
`docs:`, `build:`, `feat:`, `fix:`, `test:`, `style:`, `chore:` – ein Thema pro Commit,
Tests laufen vor jedem Commit grün (`npm test`).
