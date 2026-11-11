// Einfache modale Dialoge im Stil des PAP-Editors.

/**
 * Zeigt einen Dialog und wartet auf eine Schaltfläche.
 * @param {object} o
 * @param {string} o.title
 * @param {HTMLElement|string} [o.body]   Inhalt (Element oder Text)
 * @param {{label: string, value: any, primary?: boolean}[]} o.buttons
 * @param {(value: any) => boolean} [o.validate]  false verhindert das Schließen (z. B. bei Eingabefehlern)
 * @returns {Promise<any>} value der gedrückten Schaltfläche (Esc/Klick daneben: null)
 */
export function dialog({ title, body, buttons, validate }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const box = document.createElement('div');
    box.className = 'dlg';
    box.setAttribute('role', 'dialog');
    const h = document.createElement('h2');
    h.textContent = title;
    box.append(h);
    if (typeof body === 'string') {
      const p = document.createElement('div');
      p.className = 'dlg-text';
      p.textContent = body;
      box.append(p);
    } else if (body) {
      box.append(body);
    }
    const row = document.createElement('div');
    row.className = 'dlg-buttons';
    const close = (value) => {
      if (value !== null && validate && !validate(value)) return;
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `dlg-btn${b.primary ? ' primary' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => close(b.value));
      row.append(btn);
    }
    box.append(row);
    overlay.append(box);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(null); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const primary = buttons.find((b) => b.primary);
        if (primary) { e.preventDefault(); close(primary.value); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    (box.querySelector('input, select') ?? box.querySelector('.primary'))?.focus();
  });
}
