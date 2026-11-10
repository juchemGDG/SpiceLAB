# Lehrplanbezug (Entwurf – bitte fachlich prüfen)

Grundlage: Bildungsplan 2016 Gymnasium Baden-Württemberg (Kursstufe in der Fassung V2 von 2023),
Beispielcurricula auf schule-bw.de, Material der Lehrerfortbildung (ZPG).
Die Zuordnung zu Klassenstufen ist ein Arbeitsstand; Stellen mit „?“ sind noch nicht am Plantext geprüft.

Daraus folgt der Umfang von SpiceLab: Was hier nicht auftaucht, kommt nicht in die Bauteilleiste.

| Fach / Stufe | Inhalte | Bauteile | Analysen / Anzeigen |
|---|---|---|---|
| Physik 7/8 | Stromkreis, Ladung, Stromstärke, Spannung, Potenzial, Reihen- und Parallelschaltung, Widerstand, Ohm'sches Gesetz, Kennlinien | Batterie, Netzgerät, Widerstand, Glühlampe, Schalter, Volt-/Amperemeter | Arbeitspunkt mit Messgeräten, Potenziale anzeigen, Kennlinienschreiber (U-I) |
| Physik 9/10 | Elektrische Energie und Leistung, Elektromagnetismus, Induktion; Elektronik je nach Schulcurriculum (?) | Diode, LED, Spule, Motor (?) | Leistung je Bauteil, Zeitverlauf |
| Physik Kursstufe | Kondensator (Kapazität, Auf-/Entladung, Zeitkonstante), Spule (Induktivität, Ein-/Ausschaltvorgänge), Schwingkreis (LF) | Kondensator, Elko, Spule, Umschalter | Zeitverlauf, Oszilloskop, Cursor für Zeitkonstante; Frequenzgang (?) |
| NwT 8–10 | Sensoren und Aktoren, Spannungsteiler, Transistor als Schalter, LED mit Vorwiderstand, Anbindung an Mikrocontroller (Pull-up/-down, Taster), Energieversorgung | Poti, LDR, NTC, Taster, NPN/PNP, MOSFET, Motor, Summer, Solarzelle (?) | Arbeitspunkt, DC-Sweep (z. B. Helligkeit/Temperatur als Parameter), Zeitverlauf |
| NwT Kursstufe (?) | Regelung, Signalverarbeitung (?) | OPV (Komparator, Verstärker) | Zeitverlauf, Frequenzgang |
| IMP 8–10 (?) | Physik-Anteil Elektronik/Sensorik (?) | wie NwT | wie NwT |

## Folgerungen für die Realitätsnähe
- Batterien und Netzgeräte haben Innenwiderstand (und optional Strombegrenzung beim Netzgerät).
- Messgeräte sind Bauteile mit Innenwiderstand (Voltmeter ca. 10 MΩ, Amperemeter Shunt je Messbereich).
- LEDs mit typischen Durchlassspannungen nach Farbe; Glühlampe mit kaltem/warmem Widerstand.
- Halbleiter mit Parametern aus Datenblättern realer Schultypen (BC547, BS170, LM358 …).
- OPV mit begrenzter Ausgangsspannung (LM358 kommt nicht an die obere Versorgung heran).
- LDR/NTC mit Kennlinie, die Helligkeit bzw. Temperatur ist ein einstellbarer Parameter.

## Quellen
- Bildungspläne: https://www.bildungsplaene-bw.de
- Beispielcurricula NwT 8–10 (Gymnasium): https://www.schule-bw.de/service-und-tools/bildungsplaene/allgemein-bildende-schulen/bildungsplan-2016/beispielcurricula/gymnasium/BP2016BW_ALLG_GYM_NWT_BC_8-10_BSP_1.pdf
- Beispielcurriculum Physik 7/8 (Gymnasium): https://www.schule-bw.de/service-und-tools/bildungsplaene/allgemein-bildende-schulen/bildungsplan-2016/beispielcurricula/gymnasium/BP2016BW_ALLG_GYM_PH_BC_7-8_BSP_1.pdf
- Beispielcurriculum Physik 9/10 (Gymnasium): https://www.schule-bw.de/service-und-tools/bildungsplaene/allgemein-bildende-schulen/bildungsplan-2016/beispielcurricula/gymnasium/BP2016BW_ALLG_GYM_PH_BC_9-10_BSP_2.pdf
- NwT-Glossar (ZPG): https://lehrerfortbildung-bw.de/u_matnatech/nwt/gym/bp2016/fb2/2_bildung/5_glossar/250_glossar.pdf
