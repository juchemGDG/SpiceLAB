# Design-Tokens (aus dem PAP-Editor, pap.mint-checker.de)

Quelle: `pap-reference.css` (Stylesheet des PAP-Editors). Gleiche Werte wie bei SchaltLab und MINT-CAD,
damit die Programme als Familie erkennbar sind. Die Tokens werden in `app/css/tokens.css` als
CSS-Variablen übernommen (Phase 6).

| Token | Wert | Verwendung |
|---|---|---|
| bg-sidebar | #0f172a | Seitenleiste (dunkel) |
| surface | #1e293b | Bauteilkarten, Buttons in dunklen Bereichen |
| surface-hover | #2d3f55 | Hover/Active auf surface |
| border | #334155 | Rahmen dunkel |
| border-hover | #475569 | Rahmen Hover |
| text | #f8fafc | Text auf dunkel |
| text-muted | #94a3b8 | Nebentext, Abschnittsüberschriften |
| bg-main | #f8fafc | Arbeitsfläche (hell) |
| topbar | #e2e8f0 | Kopfleiste (hell) |
| topbar-border | #cbd5e1 | Trennlinien hell |
| text-dark | #0f172a | Text auf hell |
| text-dark-muted | #475569 | Statuszeile |
| accent | #2563eb | Primäre Aktion (z. B. „Simulieren“) |
| accent-hover | #4f46e5 | Hover primär |
| accent-active | #1d4ed8 | Pressed primär |
| danger | #dc2626 | Löschen, Fehlermeldungen |
| radius-card | 10px | Karten, Menüs |
| radius-btn | 6px | Buttons |
| radius-modal | 14px | Dialoge |
| font | Helvetica, Arial, sans-serif | Schrift |

Layout-Prinzip: dunkle Seitenleiste (252px) links mit Bauteilkarten,
helle Arbeitsfläche rechts, zweizeilige Kopfleiste (Titel + Status / Aktionen),
eine blaue Primär-Schaltfläche, runde Ecken, dezente Schatten.

## Ergänzungen für SpiceLab (Vorschlag)
- Messwerte am Bauteil: Spannung blau (#2563eb), Strom orange (#ea580c) – wie die übliche
  Farbgebung in Schulbüchern; Kanalfarben im Oszilloskop: Kanal 1 gelb (#ca8a04), Kanal 2 cyan (#0891b2)
  wie bei vielen Schuloszilloskopen.
