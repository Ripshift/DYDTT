import { describe, it, expect, vi } from 'vitest';
import { generateCode, isValidCode, normaliseCode, CODE_ALPHABET } from '../src/social/codes.js';
import { squareCrop, checkImageFile, isSafePhoto, avatarEl, makeAvatar, MAX_INPUT_BYTES } from '../src/social/avatar.js';
import { SharedCalendar } from '../src/social/sharedCalendar.js';
import { normaliseRule, epochDay } from '../src/utils/recurrence.js';

describe('codes', () => {
  it('8 characters from the readable alphabet, mixed case + digits', () => {
    const codes = Array.from({ length: 200 }, () => generateCode());
    for (const c of codes) {
      expect(c).toHaveLength(8);
      expect([...c].every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(isValidCode(c)).toBe(true);
    }
    expect(new Set(codes).size).toBe(200);
    expect(/[a-z]/.test(codes.join('')) && /[A-Z]/.test(codes.join('')) && /[0-9]/.test(codes.join(''))).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[0O1lI]/);
  });

  it('rejects biased bytes (rejection sampling)', () => {
    let call = 0;
    const fake = () => (call++ === 0 ? new Uint8Array(16).fill(255) : new Uint8Array(16).fill(0));
    expect(generateCode(fake)).toBe('AAAAAAAA');
  });

  it('validation + cleanup', () => {
    expect(isValidCode('Ab3dE9xQ')).toBe(true);
    expect(isValidCode('Ab3dE9x')).toBe(false);
    expect(isValidCode('Ab3dE9x!')).toBe(false);
    expect(isValidCode(null)).toBe(false);
    expect(normaliseCode(' Ab3d-E9xQ ')).toBe('Ab3dE9xQ');
    expect(normaliseCode(undefined)).toBe('');
  });
});

describe('avatar', () => {
  it('square centre crop', () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
  });

  it('file checks', () => {
    expect(checkImageFile(null)).toMatch(/No file/);
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 })).toMatch(/JPEG, PNG/);
    expect(checkImageFile({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })).toMatch(/10 MB/);
    expect(checkImageFile({ type: 'image/jpeg', size: 5000 })).toBeNull();
  });

  it('only safe photo values are used', () => {
    expect(isSafePhoto('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isSafePhoto('https://lh3.googleusercontent.com/a/x=s96-c')).toBe(true);
    expect(isSafePhoto('http://x/y.png')).toBe(false);
    expect(isSafePhoto('javascript:alert(1)')).toBe(false);
    expect(isSafePhoto('https://x/a.png" onerror="x')).toBe(false);
    expect(isSafePhoto('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isSafePhoto('')).toBe(false);
    expect(isSafePhoto(5)).toBe(false);
  });

  it('avatarEl: photo or first letter', () => {
    expect(avatarEl({ name: 'zoe', photo: '' }, 40).textContent).toBe('Z');
    expect(avatarEl({ name: '', photo: '' }).textContent).toBe('?');
    const img = avatarEl({ name: 'A', photo: 'https://x/a.png' }, 24).querySelector('img');
    expect(img.getAttribute('src')).toBe('https://x/a.png');
    expect(img.width).toBe(24);
  });

  it('makeAvatar crops to 256 and lowers quality until it fits', async () => {
    const drawImage = vi.fn();
    const ctx = { drawImage, fillRect: vi.fn(), fillStyle: '', imageSmoothingQuality: '' };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      toDataURL: vi.fn((t, q) => 'data:image/jpeg;base64,' + 'A'.repeat(q > 0.7 ? 200_000 : 1000)) };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => tag === 'canvas' ? canvas : realCreate(tag));
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    const url = await makeAvatar({ type: 'image/png', size: 1000 });
    expect(canvas.width).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 256, 256);
    expect(canvas.toDataURL).toHaveBeenCalledTimes(3);           // 0.85, 0.75 too big → 0.65 fits
    expect(url.length).toBeLessThan(140_000);
    canvas.toDataURL.mockReturnValue('data:image/jpeg;base64,' + 'A'.repeat(200_000));
    await expect(makeAvatar({ type: 'image/png', size: 1000 })).rejects.toThrow(/small enough/);
    await expect(makeAvatar({ type: 'text/plain', size: 1 })).rejects.toThrow(/JPEG/);
    vi.restoreAllMocks();
  });
});

describe('SharedCalendar', () => {
  const TODAY = '2026-10-01';
  const series = (o = {}) => ({ id: 's1', title: 'Meds', notes: '', createdAt: 5, updatedAt: 1, private: false,
    rule: normaliseRule({ freq: 'daily', startDate: '2026-09-01' }), ...o });

  function make(level, adapter = {}) {
    let unsub = vi.fn();
    const a = {
      subscribeShared: vi.fn(() => unsub),
      setTaskDone: vi.fn(async () => {}),
      createTask:  vi.fn(async () => {}),
      ...adapter,
    };
    const onChange = vi.fn(), onError = vi.fn();
    const cal = new SharedCalendar({ ownerUid: 'alice', level, adapter: a, onChange, onError, today: () => TODAY }).start();
    return { cal, a, onChange, onError, unsub };
  }

  it('friend: subscribes with a day window and only shows yesterday..tomorrow', () => {
    const { cal, a } = make('friend');
    expect(a.subscribeShared).toHaveBeenCalledWith('alice',
      { level: 'friend', fromDay: epochDay('2026-09-30'), toDay: epochDay('2026-10-02') }, expect.any(Function), expect.any(Function));
    cal.apply('series', [series()]);
    expect(cal.tasksForDate('2026-09-30')).toHaveLength(1);
    expect(cal.tasksForDate('2026-10-02')).toHaveLength(1);
    expect(cal.tasksForDate('2026-10-03')).toEqual([]);
    expect(cal.inRange('2026-09-29')).toBe(false);
    expect(cal.canCheck).toBe(false);
  });

  it('family: every day; real docs override generated copies; private/deleted hidden', () => {
    const { cal, a } = make('family');
    expect(a.subscribeShared.mock.calls[0][1]).toEqual({ level: 'family', fromDay: null, toDay: null });
    cal.apply('series', [series(), series({ id: 's2', title: 'Diary', private: true })]);
    cal.apply('task', [
      { id: 's1_2026-12-25_0', seriesId: 's1', slot: 0, date: '2026-12-25', title: 'Meds', done: true, order: 5 },
      { id: 'one', date: '2026-12-25', title: 'Presents', done: false, order: 1 },
      { id: 'gone', date: '2026-12-25', title: 'Gone', deleted: true },
      { id: 'mine', date: '2026-12-25', title: 'Secret', private: true },
    ]);
    const day = cal.tasksForDate('2026-12-25');
    expect(day.map(t => [t.title, t.done])).toEqual([['Presents', false], ['Meds', true]]);
    cal.apply('task', [{ id: 'one', __removed: true }]);
    expect(cal.tasksForDate('2026-12-25').map(t => t.title)).toEqual(['Meds']);
    expect(cal.loaded).toBe(true);
  });

  it('family toggle: updates a real task, creates a repeat copy on first tick, undoes on error', async () => {
    const { cal, a, onChange, onError } = make('family');
    cal.apply('series', [series()]);
    cal.apply('task', [{ id: 't1', date: TODAY, title: 'Bins', done: false, order: 1 }]);

    expect(await cal.toggle('t1')).toBe(true);
    expect(a.setTaskDone).toHaveBeenCalledWith('alice', expect.objectContaining({ id: 't1' }), true);
    expect(cal.tasksForDate(TODAY).find(t => t.id === 't1').done).toBe(true);

    const occId = `s1_${TODAY}_0`;
    expect(await cal.toggle(occId)).toBe(true);
    expect(a.createTask).toHaveBeenCalledWith('alice', expect.objectContaining({ id: occId, done: true, seriesId: 's1', day: epochDay(TODAY) }));
    expect(a.createTask.mock.calls[0][1].generated).toBeUndefined();

    a.setTaskDone.mockRejectedValueOnce(new Error('offline'));
    expect(await cal.toggle('t1')).toBe(false);
    expect(cal.tasksForDate(TODAY).find(t => t.id === 't1').done).toBe(true);   // back to before the failed try
    expect(onError).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
    expect(await cal.toggle('nope')).toBe(false);
  });

  it('friend cannot toggle; stop unsubscribes', async () => {
    const { cal, a } = make('friend');
    cal.apply('task', [{ id: 't1', date: TODAY, title: 'Bins', done: false }]);
    expect(await cal.toggle('t1')).toBe(false);
    expect(a.setTaskDone).not.toHaveBeenCalled();
    cal.stop();
  });
});
