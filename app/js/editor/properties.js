// Eigenschaften-Dialog eines Bauteils: Bezeichnung und die Einstellungen aus dem Katalog.

import { dialog } from '../ui/dialog.js';
import { parseValue, formatValue } from '../ui/units.js';
import { entryOf } from './view.js';

/** Eingabefeld für eine Zahl mit Einheit; liefert { element, read() }. */
function numberField(param, value) {
  const label = document.createElement('label');
  label.textContent = param.unit ? `${param.label} (${param.unit})` : param.label;
  const input = document.createElement('input');
  input.value = param.unit ? formatValue(value, param.unit, 6) : String(value).replace('.', ',');
  input.inputMode = 'decimal';
  label.append(input);
  const read = () => {
    const v = parseValue(input.value);
    const ok = Number.isFinite(v) && !(param.min !== undefined && v < param.min) && !(param.max !== undefined && v > param.max);
    input.classList.toggle('invalid', !ok);
    return ok ? v : undefined;
  };
  input.addEventListener('input', read);
  return { element: label, read };
}

function selectField(param, value) {
  const label = document.createElement('label');
  label.textContent = param.label;
  const select = document.createElement('select');
  for (const o of param.options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    opt.selected = o.value === value;
    select.append(opt);
  }
  label.append(select);
  return { element: label, read: () => select.value };
}

function boolField(param, value) {
  const label = document.createElement('label');
  label.className = 'chk';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = Boolean(value);
  label.append(box, document.createTextNode(param.label));
  return { element: label, read: () => box.checked };
}

/**
 * Öffnet den Dialog; bei „Übernehmen“ werden Bezeichnung und Einstellungen geändert.
 * @returns {Promise<boolean>} true, wenn etwas übernommen wurde
 */
export async function openProperties(doc, comp) {
  const entry = entryOf(comp);
  const form = document.createElement('div');
  form.className = 'dlg-form';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Bezeichnung';
  const nameInput = document.createElement('input');
  nameInput.value = comp.label;
  nameLabel.append(nameInput);
  if (entry.prefix) form.append(nameLabel);

  const fields = entry.params.map((param) => {
    const value = comp.params[param.key];
    const field = param.kind === 'select' ? selectField(param, value) : param.kind === 'bool' ? boolField(param, value) : numberField(param, value);
    form.append(field.element);
    return [param.key, field];
  });
  if (entry.params.some((p) => p.kind === 'number')) {
    const hint = document.createElement('div');
    hint.className = 'dlg-hint';
    hint.textContent = 'Zahlen wie 4,7k · 100 nF · 2µ · 1M (M = Mega, m = Milli).';
    form.append(hint);
  }

  const readAll = () => Object.fromEntries(fields.map(([key, f]) => [key, f.read()]));
  const result = await dialog({
    title: `${entry.name}${comp.label ? ` ${comp.label}` : ''}`,
    body: form,
    buttons: [{ label: 'Abbrechen', value: false }, { label: 'Übernehmen', value: true, primary: true }],
    validate: () => Object.values(readAll()).every((v) => v !== undefined),
  });
  if (!result) return false;
  const label = nameInput.value.trim();
  const duplicate = label && doc.comps.some((c) => c !== comp && c.label === label);
  doc.setParams(comp.id, readAll(), duplicate || !entry.prefix ? undefined : label || comp.label);
  return doc.commit();
}
