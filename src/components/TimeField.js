/**
 * DYDTT — <time-field> custom element
 *
 * A time picker that matches the app: hour + minute dropdowns and gold
 * AM / PM toggle buttons (the browser's own time picker can't be styled).
 *
 *   <time-field id="x" aria-label="Reminder time"></time-field>
 *   el.value            → '' (no time) or 'HH:MM' (24-hour)
 *   el.value = '21:30'  → shows 9 : 30 PM
 *   fires 'input' and 'change' when the user changes it
 */

const pad = (n) => String(n).padStart(2, '0');
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);   // 00, 05 … 55

export class TimeField extends HTMLElement {
  #hour; #minute; #am; #pm; #clear;
  #period = 'AM';
  #built  = false;

  connectedCallback() {
    if (this.#built) return;
    this.#built = true;
    this.classList.add('time-field');
    this.setAttribute('role', 'group');

    const label = this.getAttribute('aria-label') ?? 'Time';

    this.#hour = document.createElement('select');
    this.#hour.className = 'form-input time-field__hour';
    this.#hour.setAttribute('aria-label', `${label} — hour`);
    this.#hour.append(new Option('--', ''));
    for (let h = 1; h <= 12; h++) this.#hour.append(new Option(String(h), String(h)));

    const colon = document.createElement('span');
    colon.className = 'time-field__colon';
    colon.textContent = ':';
    colon.setAttribute('aria-hidden', 'true');

    this.#minute = document.createElement('select');
    this.#minute.className = 'form-input time-field__minute';
    this.#minute.setAttribute('aria-label', `${label} — minutes`);
    MINUTES.forEach(m => this.#minute.append(new Option(pad(m), pad(m))));

    const periods = document.createElement('div');
    periods.className = 'time-field__periods';
    this.#am = this.#periodButton('AM', label);
    this.#pm = this.#periodButton('PM', label);
    periods.append(this.#am, this.#pm);

    this.#clear = document.createElement('button');
    this.#clear.type = 'button';
    this.#clear.className = 'time-field__clear';
    this.#clear.textContent = '×';
    this.#clear.setAttribute('aria-label', `Clear ${label.toLowerCase()}`);
    this.#clear.addEventListener('click', () => { this.value = ''; this.#emit(); this.#hour.focus(); });

    this.#hour.addEventListener('change', () => {
      // First pick: default AM/PM to the current half of the day
      if (this.#hour.value && !this.dataset.touched) this.#period = new Date().getHours() >= 12 ? 'PM' : 'AM';
      this.dataset.touched = '1';
      this.#sync(); this.#emit();
    });
    this.#minute.addEventListener('change', () => {
      if (!this.#hour.value) this.#hour.value = '12';
      this.#sync(); this.#emit();
    });

    this.append(this.#hour, colon, this.#minute, periods, this.#clear);

    // Apply a value set before the element was attached
    if (this._pending !== undefined) { const v = this._pending; delete this._pending; this.value = v; }
    else this.#sync();
  }

  #periodButton(p, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'time-field__period';
    b.dataset.period = p;
    b.textContent = p;
    b.setAttribute('aria-label', `${label} — ${p}`);
    b.addEventListener('click', () => {
      if (!this.#hour.value) this.#hour.value = '12';
      this.#period = p;
      this.#sync(); this.#emit();
    });
    return b;
  }

  #sync() {
    const empty = !this.#hour.value;
    this.#am.setAttribute('aria-pressed', String(!empty && this.#period === 'AM'));
    this.#pm.setAttribute('aria-pressed', String(!empty && this.#period === 'PM'));
    this.#clear.hidden = empty;
    this.classList.toggle('time-field--empty', empty);
  }

  #emit() {
    this.dispatchEvent(new Event('input',  { bubbles: true }));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  get value() {
    if (!this.#built) return this._pending ?? '';
    if (!this.#hour.value) return '';
    let h = Number(this.#hour.value) % 12;
    if (this.#period === 'PM') h += 12;
    return `${pad(h)}:${this.#minute.value}`;
  }

  set value(v) {
    if (!this.#built) { this._pending = v ?? ''; return; }
    const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? '');
    if (!m) {
      this.#hour.value = '';
      this.#minute.value = '00';
      this.#period = 'AM';
      delete this.dataset.touched;
      this.#sync();
      return;
    }
    const h24 = Number(m[1]), min = m[2];
    this.#period = h24 >= 12 ? 'PM' : 'AM';
    this.#hour.value = String(h24 % 12 === 0 ? 12 : h24 % 12);
    // Keep an exact minute (e.g. 9:07) even though the list is in 5-minute steps
    if (![...this.#minute.options].some(o => o.value === min)) {
      const opts = [...this.#minute.options];
      const before = opts.find(o => o.value > min) ?? null;
      this.#minute.add(new Option(min, min), before);
    }
    this.#minute.value = min;
    this.dataset.touched = '1';
    this.#sync();
  }

  focus() { this.#hour?.focus(); }
}

if (!customElements.get('time-field')) customElements.define('time-field', TimeField);
