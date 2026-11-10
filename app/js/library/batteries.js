// Bauteilbibliothek: Batterien, Akkus, Netzgerät – typische Innenwiderstände frischer Zellen.
// Der Innenwiderstand steigt real mit dem Alter und bei Kälte; die Werte sind Richtwerte.

export const BATTERIES = {
  aaAlkali: { label: 'Mignon AA (Alkali) 1,5 V', voltage: 1.5, internalResistance: 0.15 },
  aaNimh: { label: 'Mignon-Akku AA (NiMH) 1,2 V', voltage: 1.2, internalResistance: 0.03 },
  flat4V5: { label: 'Flachbatterie 4,5 V', voltage: 4.5, internalResistance: 0.5 },
  block9V: { label: '9-V-Block (Alkali)', voltage: 9, internalResistance: 1.5 },
  liIon: { label: 'Li-Ionen-Akku 18650 3,7 V', voltage: 3.7, internalResistance: 0.05 },
  powerSupply: { label: 'Netzgerät (einstellbar)', voltage: 5, internalResistance: 0.01 },
};
