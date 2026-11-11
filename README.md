# SpiceLab

Schaltungssimulation für den Unterricht – Schwester von PAP-Editor und SchaltLab.
Schaltungen zeichnen und simulieren wie in LTspice, reduziert auf das, was im Gymnasium
in Baden-Württemberg gebraucht wird (Physik, NwT, IMP). Läuft im Browser; Desktop-Version (Tauri) geplant.

**Stand:** Arbeitsstand 0.1 – Editor, Simulation (Gleichstrom und Zeitverlauf), Oszilloskop,
Messgeräte, Beispiele. Siehe [docs/PLAN.md](docs/PLAN.md).

## Ausprobieren

```
npm run dev     # Web-App unter http://localhost:8080 starten
```

Dann „Beispiele“ öffnen, z. B. *Dämmerungsschalter* oder *Wechselblinker*.
(Voraussetzung: Node 22 oder neuer; die App selbst braucht keine Pakete.)

## Was geht

- **Bauteile:** Widerstand, Poti, LDR, NTC, Kondensator, Elko, Spule, Transformator, Glühlampe, Motor,
  Diode, LED, Z-Diode, NPN/PNP, N-/P-MOSFET, Operationsverstärker, Batterie/Netzgerät,
  Wechsel-/Rechteckquelle, Solarzelle, Schalter, Taster, Umschalter, Spannungs- und Strommesser,
  Potential- und GND-Schiene – mit Datenblattwerten typischer Schulbauteile.
- **Messen:** Messpunkte (Prüfspitzen) zeigen Potenziale; Hinweis beim Überfahren; Oszilloskop mit Zeitlupe.
- **Bedienen:** Schalter und Taster während der Simulation; Werte live ändern.
- **Dateien:** Speichern/Laden (`.spicelab.json`), SchaltLab-Dateien öffnen, PNG/SVG-Export.
- **Genauigkeit:** Rechenverfahren wie ngspice (abgeglichen, siehe [docs/MODELLE.md](docs/MODELLE.md)).

## Entwickeln

```
npm test            # Tests von Simulationskern und Editor-Logik (keine Abhängigkeiten)
npm run uitest      # Bedienungstests im unsichtbaren Chrome (Pfad notfalls in CHROME)
npm run references  # Vergleichswerte mit ngspice neu erzeugen (braucht ngspice)
git config core.hooksPath .githooks   # einmal: Tests vor jedem Commit
```

Code ohne Framework und ohne Build-Schritt: `app/js/engine` (Simulation), `app/js/library` (Bauteilwerte),
`app/js/editor` (Zeichnen), `app/js/ui` (Oberfläche).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
