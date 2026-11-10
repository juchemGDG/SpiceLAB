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

## Bauteile (vom Nutzer bestätigt, 10.11.2026)
Pflicht: Widerstand, LED, Diode, Z-Diode, Transistor (NPN/PNP), MOSFET, Schalter, Taster, Akku,
Solarzelle, Operationsverstärker, Kondensator, Spule, induktive Kopplung zweier Spulen (Transformator).
Die Bibliothek bleibt erweiterbar: ein neues Bauteil = ein Modell in `engine/elements/` + Kennwerte in `library/`.

## Numerik wie ngspice
Der Kern soll technisch so sauber arbeiten wie ngspice, nur ohne dessen Umfang. Übernommen werden:
- Newton-Raphson mit den Konvergenzkriterien von ngspice (RELTOL 1e-3, VNTOL 1 µV, ABSTOL 1 pA,
  ITL1 100), zusätzlich Strom-Konvergenzprüfung je Bauteil
- Spannungsbegrenzung an pn-Übergängen (pnjlim) und Startwert Vcrit, GMIN parallel zu jedem Übergang
- Konvergenzhilfen für den Arbeitspunkt: Gmin-Stepping, dann Quellen-Stepping
- Zeitbereich: Trapezverfahren (Start mit Euler rückwärts), Schrittweite über den lokalen
  Abschneidefehler (LTE), Haltepunkte an Flanken von Quellen und Schaltzeitpunkten
- Bauteilmodelle mit SPICE-Parametern (Diode: IS, N, RS, BV, IBV, CJO, TT; Transistor: Gummel-Poon-Kern;
  MOSFET: Level 1 mit Kanallängenmodulation; gekoppelte Spulen: Koppelfaktor k)
- Bahnwiderstände als innere Knoten wie in ngspice

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
0. Vorbereitung: Repo, Plan, Lehrplanbezug, Design-Tokens, Testgerüst      <- erledigt
1. Simulationskern linear (DC): Gleichungslöser, MNA, Widerstand, Spannungs- und Stromquelle, Arbeitspunkt   <- erledigt
   offen: nicht angeschlossene Bauteile im Editor herausfiltern statt „hängt in der Luft“ zu melden (Phase 6)
2. Nichtlinear: Newton-Raphson mit Konvergenzhilfen (Dämpfung, Gmin, Quellenrampe);
   Diode, LED (nach Farbe), Z-Diode, Glühlampe (temperaturabhängiger Widerstand)
   <- erledigt: Newton mit ngspice-Kriterien, pnjlim, Gmin-/Quellen-Stepping,
      Diode (IS, N, RS, BV, IBV, NBV), Bibliothek 1N4148/1N4001, LEDs 5 Farben, Z-Dioden 3,3–12 V,
      Glühlampe (Wolfram-Faden, Wärmebilanz) mit Bibliothek
3. Zeitverlauf (Transient): Kondensator, Spule, gekoppelte Spulen (Transformator), Trapez-/Euler-Verfahren,
   Schrittweitensteuerung; Quellen Sinus/Rechteck/Puls, zeitgesteuerte Schalter
   <- erledigt: Sinus/Puls mit Haltepunkten, ChargeHistory + LTE (CKTterr), Kondensator, Spule mit
      Wicklungswiderstand, Kopplung K, transient.js (DCtran-Ablauf), Schalter, Glühlampe mit thermischer
      Trägheit, Diode mit CJO/TT. Für den Editor merken: Zeitanalyse standardmäßig „Kondensatoren
      entladen“ starten (Anfangsbedingungen), sonst sind Kondensatoren hinter offenen Schaltern
      schon geladen (Arbeitspunkt = unendlich lange Zeit).
   offen: Spitze der Induktionsspannung beim Abschalten ohne Freilaufdiode ist nur qualitativ
      (Wicklungskapazität/Funke nicht modelliert)
4. Bauteilbibliothek: Akku/Batterie/Netzgerät mit Innenwiderstand, Solarzelle, Schalter, Taster, Poti, LDR, NTC,
   NPN/PNP (BC547, BC557, BC337, BD139), MOSFET (BS170, IRLZ44N), OPV (LM358, TL072), Motor, Summer
   <- erledigt bis auf Summer: Batterie, Poti, LDR/NTC, Solarzelle (Ein-Dioden-Modell), Transistor
      (Gummel-Poon-Kern + Ladungen), MOSFET Level 1 (Bodydiode, Gate-Kapazitäten), OPV-Verhaltensmodell
      (A0/GBW/SR/Aussteuergrenzen/Strombegrenzung), Umschalter, Gleichstrommotor; Bibliothek: Batterien,
      Sensoren, Solar, BC547B/BC557B/BC337/BD139, BS170/IRLZ44N/IRF540N/IRF9540N, LM358/TL072/MCP6002,
      Schalter/Taster, Motoren; Tests mit Schulschaltungen (Dämmerungsschalter, Wechselblinker, …).
   Modellgrenzen (bekannt, dokumentiert im Code):
      Transistor ohne Emitter-Basis-Durchbruch (U_EBO), ohne XTF/ITF/XCJC/Substrat;
      MOSFET ohne Unterschwellstrom; OPV einpolig, ohne Gleichtaktbereich/Phasenumkehr, Offset 0;
      LDR ohne Trägheit, NTC ohne Eigenerwärmung; Motorlast nur als konstantes Moment.
   Herkunft: BC547B/BC557B-Parameter aus dem Gedächtnis (NXP-Modelle) – in Phase 5 prüfen.
   offen: Summer (aktiver Piezosummer)
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
