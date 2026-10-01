import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../src/components/TimeField.js';

let el;
const $ = (s) => el.querySelector(s);
const pick = (sel, v) => { const s = $(sel); s.value = v; s.dispatchEvent(new Event('change')); };
const pressed = () => [...el.querySelectorAll('.time-field__period')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.period);

beforeEach(() => {
  el = document.createElement('time-field');
  el.setAttribute('aria-label', 'Reminder time');
  document.getElementById('app').appendChild(el);
});

describe('<time-field>', () => {
  it('starts empty: no period selected, no clear button', () => {
    expect(el.value).toBe('');
    expect(pressed()).toEqual([]);
    expect($('.time-field__clear').hidden).toBe(true);
    expect(el.classList.contains('time-field--empty')).toBe(true);
    expect($('.time-field__hour').getAttribute('aria-label')).toBe('Reminder time — hour');
  });

  it('round-trips 24-hour values and highlights AM/PM', () => {
    el.value = '21:30';
    expect(el.value).toBe('21:30');
    expect($('.time-field__hour').value).toBe('9');
    expect(pressed()).toEqual(['PM']);
    el.value = '00:05';
    expect([$('.time-field__hour').value, el.value]).toEqual(['12', '00:05']);
    expect(pressed()).toEqual(['AM']);
    el.value = '12:00';
    expect(pressed()).toEqual(['PM']);
    el.value = 'nonsense';
    expect(el.value).toBe('');
  });

  it('keeps an exact minute that is not on the 5-minute list', () => {
    el.value = '09:07';
    expect(el.value).toBe('09:07');
    const mins = [...el.querySelectorAll('.time-field__minute option')].map(o => o.value);
    expect(mins.indexOf('07')).toBe(mins.indexOf('05') + 1);
  });

  it('user picks: hour defaults the period to the current half of the day; AM/PM toggles; events fire', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 1, 15, 0));
    const onInput = vi.fn();
    el.addEventListener('input', onInput);
    pick('.time-field__hour', '7');
    expect(el.value).toBe('19:00');
    expect(pressed()).toEqual(['PM']);
    el.querySelector('[data-period="AM"]').click();
    expect(el.value).toBe('07:00');
    pick('.time-field__minute', '45');
    expect(el.value).toBe('07:45');
    expect(onInput).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('choosing minutes or a period first fills in 12', () => {
    el.querySelector('[data-period="PM"]').click();
    expect(el.value).toBe('12:00');
    el.value = '';
    pick('.time-field__minute', '30');
    expect(el.value).toMatch(/^(00|12):30$/);
  });

  it('clear button empties it', () => {
    el.value = '08:15';
    expect($('.time-field__clear').hidden).toBe(false);
    $('.time-field__clear').click();
    expect(el.value).toBe('');
    expect(pressed()).toEqual([]);
  });

  it('a value set before the element is attached is applied', () => {
    const t = document.createElement('time-field');
    t.value = '18:20';
    expect(t.value).toBe('18:20');
    document.body.appendChild(t);
    expect(t.querySelector('.time-field__hour').value).toBe('6');
    expect(t.value).toBe('18:20');
    t.remove(); document.body.appendChild(t);       // re-attach doesn't rebuild
    expect(t.querySelectorAll('select')).toHaveLength(2);
  });
});
