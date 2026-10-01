/**
 * DYDTT — Choice dialog
 * A small confirm / multiple-choice dialog shown above everything else.
 *
 *   const choice = await choose({
 *     title:   'Delete repeating task',
 *     message: 'Which copies should be deleted?',
 *     options: [{ label: 'Just this one', value: 'this' }, …],
 *     danger:  false,           // red warning styling
 *   });
 *   // → the chosen option's value, or null if cancelled (Cancel / Esc / backdrop)
 */

import { createFocusTrap } from '../utils/a11y.js';

let counter = 0;

export function choose({ title, message = '', options = [], cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const id = `dlg-${++counter}`;

    const overlay = document.createElement('div');
    overlay.className = `dialog-overlay${danger ? ' dialog-overlay--danger' : ''}`;

    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', `${id}-title`);
    if (message) box.setAttribute('aria-describedby', `${id}-msg`);

    const h = document.createElement('h2');
    h.className = 'dialog__title';
    h.id = `${id}-title`;
    h.textContent = title;
    box.appendChild(h);

    if (message) {
      const p = document.createElement('p');
      p.className = 'dialog__message';
      p.id = `${id}-msg`;
      p.textContent = message;
      box.appendChild(p);
    }

    const actions = document.createElement('div');
    actions.className = 'dialog__actions';

    let trap;
    const finish = (value) => {
      trap.deactivate();
      overlay.remove();
      resolve(value);
    };

    options.forEach(({ label, value, variant = 'secondary', hint }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--${variant} dialog__option`;
      b.dataset.value = String(value);
      b.textContent = label;
      if (hint) {
        const small = document.createElement('span');
        small.className = 'dialog__hint';
        small.textContent = hint;
        b.appendChild(small);
      }
      b.addEventListener('click', () => finish(value));
      actions.appendChild(b);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost dialog__cancel';
    cancel.textContent = cancelLabel;
    cancel.addEventListener('click', () => finish(null));
    actions.appendChild(cancel);

    box.appendChild(actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    document.body.appendChild(overlay);

    trap = createFocusTrap(box, { onEscape: () => finish(null) });
    trap.activate();
    // Safer default focus: Cancel for dangerous questions, first option otherwise
    (danger ? cancel : actions.querySelector('.dialog__option') ?? cancel).focus();
  });
}
