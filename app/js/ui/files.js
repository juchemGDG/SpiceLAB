// Neu, Laden und Speichern (JSON-Datei). Im Browser über Download bzw. Dateiauswahl;
// die Desktop-Version (Tauri) nutzt die Dateidialoge des Betriebssystems zum Speichern.

import { dialog } from './dialog.js';
import { CATALOG_BY_ID } from '../editor/catalog.js';

export const FILE_SUFFIX = '.spicelab.json';

/**
 * Datei speichern. Im Browser als Download; in der Desktop-Version (Tauri) über den Dateidialog des
 * Betriebssystems, weil der WebView Downloads nicht wie ein Browser behandelt.
 * @param {string} name   Vorschlag für den Dateinamen
 * @param {string|Blob} data
 * @returns {Promise<boolean>} false, wenn die Person den Dialog abgebrochen hat
 */
export async function download(name, data, mime = 'application/json') {
  const tauri = window.__TAURI__;
  if (tauri?.dialog && tauri?.fs) {
    const extension = name.slice(name.lastIndexOf('.') + 1);
    const path = await tauri.dialog.save({ defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (!path) return false;
    const bytes = new Uint8Array(await new Blob([data], { type: mime }).arrayBuffer());
    await tauri.fs.writeFile(path, bytes);
    return true;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
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
