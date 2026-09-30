/**
 * DYDTT — Toast helper
 * Small, non-blocking messages at the bottom of the screen.
 */

export function getOrCreateToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    c.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(c);
  }
  return c;
}

/**
 * Show a toast.
 * @param {object}   opts
 * @param {string}   opts.message
 * @param {string}  [opts.title]     Optional bold first line
 * @param {'info'|'success'|'error'} [opts.variant]
 * @param {{label:string, primary?:boolean, onClick?:() => void}[]} [opts.actions]
 * @param {number}  [opts.timeout]   Auto-dismiss after ms (0 = stay until dismissed)
 * @returns {{ el: HTMLElement, dismiss: () => void }}
 */
export function showToast({ message, title, variant = 'info', actions = [], timeout = 0 }) {
  const container = getOrCreateToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${variant} toast--enter`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('div');
  text.className = 'toast__text';
  if (title) {
    const t = document.createElement('strong');
    t.className   = 'toast__title';
    t.textContent = title;
    text.appendChild(t);
  }
  const msg = document.createElement('span');
  msg.textContent = message;
  text.appendChild(msg);
  toast.appendChild(text);

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    if (!toast.isConnected) return;
    toast.classList.replace('toast--enter', 'toast--exit');
    setTimeout(() => toast.remove(), 300);
  };

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'toast__actions';
    actions.forEach(({ label, primary = false, onClick }) => {
      const b = document.createElement('button');
      b.className     = `btn ${primary ? 'btn--primary' : 'btn--ghost'}`;
      b.style.cssText = 'padding:6px 14px;font-size:0.75rem;min-height:32px;';
      b.textContent   = label;
      b.addEventListener('click', () => { onClick?.(); dismiss(); });
      row.appendChild(b);
    });
    toast.appendChild(row);
  }

  container.appendChild(toast);
  if (timeout > 0) timer = setTimeout(dismiss, timeout);
  return { el: toast, dismiss };
}
