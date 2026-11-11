// Neu, Laden und Speichern (JSON-Datei). Im Browser über Download bzw. Dateiauswahl;
// die Desktop-Version (Tauri) bekommt später echte Dateidialoge.

import { dialog } from './dialog.js';
import { CATALOG_BY_ID } from '../editor/catalog.js';

export const FILE_SUFFIX = '.spicelab.json';

/** Datei herunterladen lassen. */
export function download(name, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Datei auswählen und als Text lesen (null bei Abbruch). */
export function pickFile(input) {
  return new Promise((resolve) => {
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.click();
  });
}

/**
 * Prüft eine geladene Datei und liefert die Zeichnungsdaten.
 * @throws {Error} mit verständlicher Meldung
 */
export function parseSchematic(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine SpiceLab-Schaltung (kein gültiges JSON).');
  }
  if (data?.app !== 'SpiceLab' || !Array.isArray(data.comps) || !Array.isArray(data.wires)) {
    throw new Error('Die Datei ist keine SpiceLab-Schaltung.');
  }
  const unknown = data.comps.filter((c) => !CATALOG_BY_ID.has(c.type)).map((c) => c.type);
  if (unknown.length) throw new Error(`Unbekannte Bauteile in der Datei: ${[...new Set(unknown)].join(', ')}`);
  // fehlende Einstellungen (ältere Dateien) mit Voreinstellungen ergänzen
  for (const c of data.comps) {
    const entry = CATALOG_BY_ID.get(c.type);
    c.params = { ...Object.fromEntries(entry.params.map((p) => [p.key, p.default])), ...c.params };
  }
  return data;
}

/** Nachfrage, ob ungespeicherte Änderungen verworfen werden dürfen. */
export async function confirmDiscard(dirty) {
  if (!dirty) return true;
  return dialog({
    title: 'Änderungen verwerfen?',
    body: 'Die aktuelle Schaltung wurde seit dem letzten Speichern verändert.',
    buttons: [{ label: 'Abbrechen', value: false }, { label: 'Verwerfen', value: true, primary: true }],
  });
}
