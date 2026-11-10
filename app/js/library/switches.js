// Bauteilbibliothek: Schalter und Taster.
// Im Simulationskern sind Schalter und Taster dasselbe Bauteil ('S'); der Unterschied liegt in der
// Bedienung: Ein Schalter bleibt in seiner Stellung, ein Taster springt beim Loslassen zurück.
// type: Bauteiltyp im Kern, closed: Ruhezustand.

export const SWITCHES = {
  toggle: { label: 'Kippschalter (Ein/Aus)', type: 'S', closed: false, momentary: false },
  pushNO: { label: 'Taster (Schließer)', type: 'S', closed: false, momentary: true },
  pushNC: { label: 'Taster (Öffner)', type: 'S', closed: true, momentary: true },
  changeover: { label: 'Umschalter', type: 'SPDT', position: 'a', momentary: false },
};
