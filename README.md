# SpiceLab

Schaltungssimulation für den Unterricht – Schwester von PAP-Editor und SchaltLab.
Schaltungen zeichnen und simulieren wie in LTspice, reduziert auf das, was im Gymnasium
in Baden-Württemberg gebraucht wird. Läuft im Browser und als Desktop-Programm (Tauri).

**Stand:** in Entwicklung, siehe [docs/PLAN.md](docs/PLAN.md).

## Entwickeln

```
npm test        # Tests von Simulationskern und Editor-Logik (Node 22 oder neuer, keine Abhängigkeiten)
npm run dev     # Web-App unter http://localhost:8080 starten
npm run uitest  # Bedienungstests im unsichtbaren Chrome (braucht Chrome; Pfad notfalls in CHROME)
npm run references  # Vergleichswerte mit ngspice neu erzeugen (braucht ngspice)
```

Einmal je Arbeitskopie den Git-Hook einschalten, der vor jedem Commit die Tests ausführt:

```
git config core.hooksPath .githooks
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
