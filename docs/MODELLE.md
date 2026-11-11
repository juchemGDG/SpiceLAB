# Bauteilmodelle in SpiceLab

Was jedes Modell abbildet, woher die Werte stammen, wie es geprüft ist und wo seine Grenzen liegen.
Stand: November 2026, Abgleich mit ngspice 47.

## Wie geprüft wird

1. **Lehrbuchformeln** – z. B. Aufladekurve, Schwingkreisfrequenz, Leistungsanpassung (`tests/*.test.js`).
2. **Datenblattwerte** – jedes Bibliotheksbauteil trifft die Werte, aus denen es entstanden ist
   (z. B. LED: 2,0 V bei 20 mA; Transistor: hFE im Datenblattbereich).
3. **Abgleich mit ngspice** – 22 Vergleichsschaltungen (`tests/reference/cases.js`) werden mit ngspice
   gerechnet und als Referenz gespeichert. Kennlinien stimmen auf 0,2 % überein, Zeitverläufe auf
   höchstens 0,06 % der Spannweite. Neu erzeugen: `npm run references` (braucht ngspice).
   Der Abgleich prüft die **Umsetzung** der Modelle, nicht die Bauteilwerte selbst.

Gegenprobe (Empfindlichkeit): Eine Änderung von BF oder KP um 1 % fällt im Abgleich auf.
Änderungen, die das Ergebnis um weniger als 0,2 % verschieben (z. B. IS um 1 %), bleiben darunter –
sie sind für den Unterricht ohne Bedeutung.

## Numerik

Wie ngspice: modifizierte Knotenanalyse, Newton-Raphson mit RELTOL 1e-3 / VNTOL 1 µV / ABSTOL 1 pA,
Spannungsbegrenzung an pn-Übergängen (pnjlim) und FETs (fetlim/limvds), Gmin- und Quellen-Stepping,
Trapezverfahren mit Fehlerschätzung (TRTOL 7), Haltepunkte an Pulsflanken und Schaltzeitpunkten.
Abweichung von ngspice: dichte Matrix (Schulschaltungen sind klein), nach jedem angenommenen
Euler-Schritt immer Wechsel auf Trapez.

## Modelle

| Bauteil | Modell | Werte aus | Geprüft durch | Grenzen |
|---|---|---|---|---|
| Widerstand, Poti | ohmsch; Poti mit 0,5 Ω Schleiferwiderstand | – | Lehrbuch | keine Erwärmung, keine Leistungsgrenze |
| Batterie, Akku, Netzgerät | Quellenspannung + Innenwiderstand | Richtwerte frischer Zellen | Lehrbuch | keine Entladung über die Zeit, keine Strombegrenzung des Netzgeräts |
| LDR | R10 · (E/10 lx)^−γ ∥ Dunkelwiderstand | Datenblatt (GL5528, GL5539) | Datenblatt | keine Trägheit (real Zehntelsekunden) |
| NTC | B-Parameter-Gleichung | Datenblatt (R25, B) | Datenblatt | keine Eigenerwärmung |
| Glühlampe | Wolframfaden R ~ T^1,2, Wärmebilanz (Strahlung + Leitung), thermische Trägheit | Aufdruck U_N/I_N, T_N = 2700 K, τ = 50 ms | Nennpunkt, Kaltwiderstand, Einschaltstrom | keine Lichtausbeute/Farbtemperatur; τ ist Richtwert |
| Diode, LED, Z-Diode | SPICE-Diodenmodell (IS, N, RS, BV, IBV, NBV, CJO, VJ, M, FC, TT) | 1N4148/1N4001: verbreitete SPICE-Modelle; LED und Z-Diode aus Datenblattpunkten berechnet | Datenblatt, ngspice | Sperrbereich ohne SPICE-Kubikformel (Unterschied < 1e-12 A); LED-Durchbruch nicht modelliert |
| Solarzelle | Ein-Dioden-Modell (Fotostrom, Diode, Rs, Rp) | Datenblatt: U_L, I_K, Zellenzahl | Datenblatt, MPP, ngspice | keine Temperaturabhängigkeit |
| Kondensator | ideal, Leckleitwert GMIN (1 pS) | – | Lehrbuch, ngspice | kein ESR, kein Leckstrom von Elkos |
| Spule | Induktivität + Wicklungswiderstand | – | Lehrbuch, ngspice | keine Sättigung des Kerns, keine Wicklungskapazität |
| Kopplung (Transformator) | Gegeninduktivität M = k·√(L1·L2) | – | Lehrbuch, ngspice | keine Kernverluste, keine Sättigung |
| Schalter, Taster, Umschalter | 10 mΩ / 1 GΩ, Schaltzeitpunkte als Haltepunkte | – | Lehrbuch | kein Prellen, kein Funke (Spitze der Induktionsspannung beim Abschalten ohne Freilaufdiode nur qualitativ) |
| Bipolartransistor | Gummel-Poon-Kern wie ngspice (IS, BF, NF, VAF, IKF, ISE, NE, BR, NR, VAR, IKR, ISC, NC, RB, RC, RE, CJE, VJE, MJE, CJC, VJC, MJC, FC, TF, TR) | BC547B/BC557B: Philips-Modelle der Schwestertypen BC546B/BC556B (TR auf 1 ns statt 1e-32 gesetzt); BC337, BD139: an Datenblatt angepasst | Datenblatt (hFE, U_BE, U_CE,sat), ngspice | ohne XTF/VTF/ITF, XCJC, Substrat, Temperatur; **kein Emitter-Basis-Durchbruch** (U_EBO ≈ 6 V) |
| MOSFET | Level 1 (Shichman-Hodges) + Kanallängenmodulation, RD/RS, CGS/CGD konstant, Bodydiode | aus Datenblattpunkten: U_th, R_DS(on) bei U_GS, Ciss, Crss | Datenblatt, ngspice | kein Unterschwellstrom (sperrt unter U_th schlagartig), Gate-Kapazitäten spannungsunabhängig (keine Miller-Plateau-Form wie im Datenblatt) |
| Operationsverstärker | Verhaltensmodell: A0, GBW (ein Pol), Anstiegsrate, Aussteuergrenzen, R_out, Strombegrenzung, Ruhestrom | typische Datenblattwerte | Lehrbuch (Verstärker, Komparator, GBW, Slew Rate) | einpolig; kein Gleichtaktbereich, keine Phasenumkehr, Offset 0, kein Eingangsruhestrom; **nicht** mit ngspice abgeglichen (kein Gegenstück) |
| Fototransistor | NPN ohne Basisanschluss + Fotostrom (∝ Beleuchtungsstärke) von Kollektor zu Basis; I_C ≈ (BF+1)·I_ph | **Richtwert:** 0,8 mA bei 1000 lx (SFH 300) – nicht aus dem Datenblatt abgeleitet | Linearität, Sättigung | Empfindlichkeit streut real um etwa den Faktor 2 (Gruppen -3/-4); keine Spektralabhängigkeit (Lichtart), keine Trägheit |
| Summer (aktiv) | Widerstand U_N/I_N; „tönt“ bei richtiger Polung ab 60 % U_N (Anzeige und optional Ton) | Richtwerte (5 V/30 mA, 12 V/20 mA) | Polung, Schwelle | Stromaufnahme real nicht konstant; kein Frequenz-/Lautstärkeverlauf |
| Gleichstrommotor | R, L, Gegenspannung k·ω, Trägheit, Haftreibung | Datenblatt: U_N, n_0, I_0, I_Anlauf | Leerlauf, Anlaufspannung, Last, Anlaufstrom | Last nur als konstantes Moment; keine Bürstenfunken |

## Messungen in der Oberfläche

- **Kennlinie:** Gleichstrom-Arbeitspunkte, Punkt für Punkt von der vorigen Lösung aus (wie `.dc` in SPICE).
- **Frequenzgang:** wird wie im Labor gemessen (Sinusquelle schrittweise auf Frequenzen stellen, einschwingen lassen,
  Amplitude und Phase aus ganzen Perioden bestimmen) und nicht über eine linearisierte AC-Analyse wie `.ac` in SPICE.
  Vorteil: gilt auch für nichtlineare Bauteile bei der gewählten Amplitude. Nachteil: bei sehr hoher Güte
  (Schwingkreis mit Q > 30) muss die Einschwingzeit länger gewählt werden. Geprüft gegen RC-Tief-/Hochpass
  (−3 dB, ±45°, −20 dB/Dekade) und Reihenschwingkreis (f₀, Güte).

## Offene Punkte

- OPV-Modell mit einem Hersteller-Makromodell (z. B. TI LM358) in ngspice vergleichen.
- BC547B/BC557B gegen die Original-Modelldateien prüfen, sobald sie verfügbar sind.
- Emitter-Basis-Durchbruch des Transistors (für Multivibratoren mit mehr als 6 V Betriebsspannung).
