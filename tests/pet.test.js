import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  newPet, tick, act, buy, awardCoin, migrate, mergePets, expiredToys, lostText, timeLeft,
  mood, wellbeing, cleanliness, status, notificationText,
  HOURS_TO_EMPTY, POOP_EVERY_H, MOUSE_EVERY_H, MAX_POOPS, MAX_MICE, MAX_TREATS, FULL_AT,
  SHOP, SHOP_ORDER, TOYS, SCRATCH_FUN, VERSION, PLAY_FUN, PETS_PER_PLAY, STARTING_COINS,
} from '../src/pet/pet.js';
import {
  initPet, getPet, isFound, markFound, refreshPet, doAction, buyItem, earnCoin, subscribePet,
  onRemote, uploadNow, UPLOAD_DELAY_MS, _resetPet, resumePetSync,
} from '../src/pet/petStore.js';
import { toCloud, PET_FIELDS } from '../src/pet/petCloud.js';
import { openSecretPage, closeSecretPage, isSecretOpen, secretBack, litterGrid, isStinky, isDaytime, WINDOW_CHECK_MS, PURR_EVERY_MS } from '../src/components/SecretPage.js';
import { createPetBowl } from '../src/components/PetBowl.js';
import * as S from '../src/pet/sprites.js';
import { db, openDb, getSetting, setSetting } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { todayStr } from '../src/utils/dateHelpers.js';

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 9, 1, 12);

// ── Rules ───────────────────────────────────────────────────────────────────

describe('pet rules', () => {
  it('needs drop on a relaxed clock', () => {
    const p = { ...newPet(T0), hunger: 100, fun: 100, love: 100 };
    const later = tick(p, T0 + 12 * H);
    expect(later.hunger).toBeCloseTo(100 - 12 * (100 / HOURS_TO_EMPTY.hunger));
    expect(later.fun).toBeGreaterThan(later.hunger);
    expect(later.love).toBeGreaterThan(later.fun);
    expect(later.lastTick).toBe(T0 + 12 * H);
    expect(tick(later, later.lastTick)).toEqual(later);
  });

  it('the litter box fills while he eats, up to 3', () => {
    const p = { ...newPet(T0), hunger: 100 };
    expect(tick(p, T0 + (POOP_EVERY_H - 0.1) * H).poops).toBe(0);
    expect(tick(p, T0 + POOP_EVERY_H * H).poops).toBe(1);
    expect(tick(p, T0 + 29 * H).poops).toBe(MAX_POOPS);
  });

  it('never dies: starving, he brings dead mice instead (max 3)', () => {
    const p = { ...newPet(T0), hunger: 0, fun: 0, love: 0 };
    expect(tick(p, T0 + (MOUSE_EVERY_H - 1) * H).mice).toBe(0);
    expect(tick(p, T0 + MOUSE_EVERY_H * H).mice).toBe(1);
    const month = tick(p, T0 + 60 * D);
    expect(month.mice).toBe(MAX_MICE);
    expect(mood(month)).toBe('grumpy');
    expect(status(month)).toMatch(/presents/);
    expect(tick({ ...newPet(T0), hunger: 10 }, T0 + (3 + MOUSE_EVERY_H) * H).mice).toBe(1);
  });

  it('feeding, treats, petting, scratching, cleaning and mice', () => {
    const p = { ...newPet(T0), hunger: 10, love: 50, fun: 50, treats: 1, poops: 2, mice: 2, starveClock: 5 };
    const fed = act(p, 'feed', null, T0 + 1);
    expect(fed.state).toMatchObject({ hunger: 45, starveClock: 0, updatedAt: T0 + 1 });
    expect(act({ ...p, hunger: FULL_AT }, 'feed').say).toBe('Full.');
    const treat = act(p, 'treat');
    expect(treat.state.treats).toBe(0);
    expect(act(treat.state, 'treat').say).toMatch(/toy box/);
    expect(act(p, 'pet').state.love).toBe(62);
    // ten pets = one play's worth of fun
    let q = { ...p, fun: 10 };
    for (let i = 0; i < PETS_PER_PLAY; i++) q = act(q, 'pet').state;
    expect(q.fun).toBeCloseTo(10 + PLAY_FUN);
    expect(PLAY_FUN).toBe(SHOP.ball.fun);
    expect(act(p, 'scratch').state.fun).toBe(50 + SCRATCH_FUN);
    expect(act(p, 'clean').state.poops).toBe(0);
    expect(act({ ...p, poops: 0 }, 'clean').ok).toBe(false);
    expect(act(p, 'mouse').state.mice).toBe(1);
    expect(act({ ...p, mice: 0 }, 'mouse').ok).toBe(false);
    expect(act(p, 'dance').ok).toBe(false);
  });

  it('playing needs that toy, and he must not be too hungry', () => {
    const p = { ...newPet(T0), fun: 20, hunger: 60, toys: { ball: { until: T0 + D } } };
    expect(act(p, 'play', 'ball').state).toMatchObject({ fun: 20 + SHOP.ball.fun, hunger: 56 });
    expect(act(p, 'play', 'wand').say).toMatch(/string wand/);
    expect(act(p, 'play', 'mouse').say).toMatch(/toy mouse/);
    expect(act(p, 'play', 'treats').ok).toBe(false);
    expect(act({ ...p, hunger: 5 }, 'play', 'ball').say).toMatch(/hungry/);
  });

  it('the shop: prices, lifetimes, coins pay', () => {
    expect(SHOP_ORDER).toEqual(['feather', 'mouse', 'spring', 'wand', 'ball', 'treats']);
    const price = Object.fromEntries(SHOP_ORDER.map(k => [k, SHOP[k].price]));
    expect(price).toEqual({ feather: 25, mouse: 7, spring: 14, wand: 30, ball: 14, treats: 5 });
    const days = Object.fromEntries(TOYS.map(k => [k, SHOP[k].days]));
    expect(days).toEqual({ feather: 8, mouse: 15, spring: 23, wand: 32, ball: 5 });
    expect(newPet(T0).coins).toBe(STARTING_COINS);
    expect(STARTING_COINS).toBe(30);
    expect(new Set(TOYS.map(k => SHOP[k].days)).size).toBe(TOYS.length);
    expect(SHOP.wand.ends).toBe('break');
    expect(SHOP.treats.ends).toBe('runOut');

    const poor = { ...newPet(T0), coins: 6 };
    expect(buy(poor, 'ball').say).toMatch(/8 more coins/);
    expect(buy({ ...poor, coins: 13 }, 'ball').say).toMatch(/1 more coin needed/);
    const r = buy({ ...poor, coins: 60 }, 'ball', T0);
    expect(r.state.coins).toBe(46);
    expect(r.state.toys.ball.until).toBe(T0 + SHOP.ball.days * D);
    expect(buy(r.state, 'ball').say).toMatch(/already/);
    const t = buy({ ...poor, coins: 5, treats: 2 }, 'treats');
    expect(t.state).toMatchObject({ coins: 0, treats: 2 + SHOP.treats.pack });
    expect(buy({ ...poor, coins: 99, treats: MAX_TREATS }, 'treats').say).toMatch(/full/);
    expect(buy(poor, 'rocket').ok).toBe(false);
  });

  it('toys get lost / break when their time is up', () => {
    const p = { ...newPet(T0), toys: { mouse: { until: T0 + 3 * D }, wand: { until: T0 + 7 * D } } };
    expect(expiredToys(p, T0 + 4 * D)).toEqual(['mouse']);
    const later = tick(p, T0 + 4 * D);
    expect(later.toys).toEqual({ wand: { until: T0 + 7 * D } });
    expect(lostText('mouse')).toMatch(/lost the toy mouse/);
    expect(lostText('wand')).toMatch(/broke/);
    expect(lostText('nope')).toBe('');
    expect(timeLeft(T0 + 3.5 * D, T0)).toBe('3 days left');
    expect(timeLeft(T0 + 30 * H, T0)).toBe('1 day left');
    expect(timeLeft(T0 + 5 * H, T0)).toBe('5 hours left');
    expect(timeLeft(T0 + 90 * 60_000, T0)).toBe('1 hour left');
    expect(timeLeft(T0 + 60_000, T0)).toBe('Less than an hour left');
  });

  it('each ticked-off task earns one coin, once', () => {
    let s = { ...newPet(T0), coins: 0 };
    const r = awardCoin(s, 't1', T0 + 5);
    expect(r).toMatchObject({ earned: true });
    expect(r.state).toMatchObject({ coins: 1, updatedAt: T0 + 5 });
    expect(awardCoin(r.state, 't1').earned).toBe(false);
    expect(awardCoin(r.state, null).earned).toBe(false);
    s = { ...r.state, coins: 9999 };
    expect(awardCoin(s, 't2').earned).toBe(false);
  });

  it('old saves (treats from tasks) move to coins', () => {
    const v1 = { found: true, hunger: 50, fun: 50, love: 50, poops: 0, mice: 0, treats: 7,
      poopClock: 0, starveClock: 0, lastTick: T0, awarded: ['a'] };
    const v2 = migrate(v1);
    expect(v2).toMatchObject({ v: VERSION, coins: 0, treats: 7, toys: {}, updatedAt: T0, awarded: ['a'] });
    expect(migrate(v2)).toBe(v2);
    expect(migrate(null)).toBeNull();
  });

  it('merging two devices: newest care wins, no coin is lost or doubled', () => {
    const base = { ...newPet(T0), coins: 5, awarded: ['a', 'b'] };
    const phone = { ...base, hunger: 90, coins: 6, awarded: ['a', 'b', 'c'], updatedAt: T0 + 10 };
    const tablet = { ...base, hunger: 40, coins: 7, awarded: ['a', 'b', 'd', 'e'], updatedAt: T0 + 5 };
    const m = mergePets(phone, tablet);
    expect(m.hunger).toBe(90);                                   // phone is newer
    expect(m.coins).toBe(8);                                     // + d, e
    expect(m.awarded).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mergePets(tablet, phone).coins).toBe(8);              // order doesn't matter
    expect(mergePets(null, phone)).toEqual(phone);
    expect(mergePets(phone, null)).toEqual(phone);
    expect(mergePets(null, null)).toBeNull();
    expect(mergePets({ found: false }, null)).toEqual({ found: false });
  });

  it('mood, wellbeing, cleanliness and messages', () => {
    const happy = { ...newPet(T0), hunger: 90, fun: 90, love: 90 };
    expect(mood(happy)).toBe('happy');
    expect(wellbeing(happy)).toBe(90);
    expect(status(happy)).toMatch(/Happy/);
    expect(mood({ ...happy, hunger: 40, fun: 40, love: 40 })).toBe('ok');
    expect(cleanliness({ ...happy, poops: 2, mice: 1 })).toBe(30);
    expect(status({ ...happy, hunger: 10 })).toMatch(/hungry/);
    expect(status({ ...happy, poops: 2 })).toMatch(/litter/);
    expect(status({ ...happy, poops: 1 })).toMatch(/scoop/);
    expect(status({ ...happy, fun: 10 })).toMatch(/bored/);
    expect(status({ ...happy, love: 10 })).toMatch(/attention/);
    expect(status({ ...happy, mice: 1 })).toMatch(/a present/);
    expect(status({ ...happy, hunger: 50, fun: 50, love: 50 })).toMatch(/alright/);
    expect(notificationText({ ...happy, mice: 1 })).toMatch(/present/);
    expect(notificationText({ ...happy, hunger: 10 })).toMatch(/hungry/);
    expect(notificationText({ ...happy, poops: 3 })).toMatch(/litter/);
    expect(notificationText({ ...happy, fun: 10 })).toMatch(/bored/);
    expect(notificationText({ ...happy, love: 10 })).toMatch(/misses/);
    expect(notificationText(happy)).toMatch(/says hi/);
  });
});

describe('sprites', () => {
  it('every grid is rectangular and uses only the room colours', () => {
    const grids = [S.BOWL_FULL, S.BOWL_EMPTY, S.WATER_FULL, S.WATER_EMPTY, S.LITTER, S.SCRATCHER, S.WINDOW, S.WINDOW_DAY, S.WATER_FULL_2, S.STINK,
      S.MOUSE, S.COIN, S.SCOOP, ...Object.values(S.ITEM_SPRITES)];
    for (const g of grids) {
      expect(new Set(g.map(r => r.length)).size).toBe(1);
      for (const ch of g.join('')) expect(ch === '.' || ch in S.ROOM).toBe(true);
    }
    // gold, silver, grey and black — plus blue water, pink tails and grey-green stink
    expect(Object.keys(S.ROOM).sort()).toEqual(['B', 'L', 'S', 'Y', 'b', 'd', 'g', 'k', 'm', 'p', 's', 'y']);
    expect(S.WATER_FULL.join('')).toMatch(/b/);
    expect(S.WATER_FULL[0] + S.WATER_FULL_2[0]).not.toMatch(/S/);    // no white glints above the bowl
    // only one row of water shows at the top of the bowl
    for (const g of [S.WATER_FULL, S.WATER_FULL_2]) expect(g.filter(r => /[bB]/.test(r))).toHaveLength(1);
    expect(S.TOY_MOUSE.join('')).toMatch(/p/);
    expect(S.MOUSE.join('')).toMatch(/p/);
    expect(S.STINK.join('').replace(/[.m]/g, '')).toBe('');
    expect(S.mirror(['ab.'])).toEqual(['.ba']);
    expect(Object.keys(S.ITEM_SPRITES).sort()).toEqual([...SHOP_ORDER].sort());
  });
  it('litter box shows 0–3 poops; silhouettes keep the shape', () => {
    expect(litterGrid(0)).toEqual(S.LITTER);
    expect(litterGrid(3).join('')).not.toEqual(S.LITTER.join(''));
    const sil = S.silhouette(S.BALL);
    expect(sil.map(r => r.replace(/#/g, 'x'))).toEqual(S.BALL.map(r => r.replace(/[^.]/g, 'x')));
  });
  it('cloud copy keeps only allowed fields', () => {
    const c = toCloud({ ...newPet(T0), junk: 1 });
    expect(Object.keys(c).every(k => PET_FIELDS.includes(k))).toBe(true);
    expect(c.junk).toBeUndefined();
  });
});

// ── Store + sync ────────────────────────────────────────────────────────────

const fakeCloud = () => {
  const c = {
    docs: {}, cb: null,
    put: vi.fn(async (uid, pet) => { c.docs[uid] = JSON.parse(JSON.stringify(pet)); }),
    listen: vi.fn((uid, cb, onErr) => { c.cb = cb; c.onErr = onErr; return () => { c.cb = null; }; }),
    get: vi.fn(async (uid) => c.docs[uid] ?? null),
  };
  return c;
};

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.settings.clear()]);
  _resetPet();
  await store.dispatch('AUTH_SET', { user: null });
});
afterEach(async () => {
  closeSecretPage();
  vi.useRealTimers();
});

describe('pet store', () => {
  it('nothing exists until the secret page is found', async () => {
    expect(await initPet({ cloud: fakeCloud() })).toBeNull();
    expect(isFound()).toBe(false);
    expect(await refreshPet()).toBeNull();
    expect(await doAction('feed')).toEqual({ ok: false, say: '' });
    expect(await buyItem('ball')).toEqual({ ok: false, say: '' });
    expect(await earnCoin('t1')).toBe(false);
    expect(await getSetting('pet')).toBeNull();
  });

  it('found → saved, survives a reload, catches up, and says which toys went missing', async () => {
    await initPet({ cloud: fakeCloud() });
    const p = await markFound();
    expect(await markFound()).toBe(p);
    expect(await getSetting('petHelloDay')).toBe(todayStr());
    await setSetting('pet', { ...p, lastTick: Date.now() - D, toys: { mouse: { until: Date.now() - 1 } } });
    _resetPet();
    const events = [];
    subscribePet((_, ev) => events.push(ev));
    const back = await initPet({ cloud: fakeCloud() });
    expect(back.hunger).toBeLessThan(p.hunger);
    expect(back.toys).toEqual({});
    expect(events).toContainEqual({ lost: ['mouse'] });
  });

  it('ticking off one of my tasks earns a coin (once found, once per task)', async () => {
    await initPet({ cloud: fakeCloud() });
    await store.dispatch('TASK_UPSERT', { date: todayStr(), title: 'Early', done: true, id: 'early' });
    expect(getPet()).toBeNull();
    await markFound();
    const events = [];
    subscribePet((_, ev) => events.push(ev));
    await store.dispatch('TASK_UPSERT', { date: todayStr(), title: 'Walk', done: true, id: 'walk' });
    await vi.waitFor(() => expect(getPet().coins).toBe(STARTING_COINS + 1));
    expect(events).toContainEqual({ earned: true });
    await store.dispatch('TASK_UPSERT', { id: 'walk', done: false });
    await store.dispatch('TASK_UPSERT', { id: 'walk', done: true });
    await new Promise(r => setTimeout(r, 20));
    expect(getPet().coins).toBe(STARTING_COINS + 1);
  });

  it('buying and doing things saves and reports', async () => {
    await initPet({ cloud: fakeCloud() });
    await markFound();
    await setSetting('pet', { ...getPet(), coins: 30 });
    _resetPet();
    await initPet({ cloud: fakeCloud() });
    expect(await buyItem('mouse')).toEqual({ ok: true, say: 'New toy mouse!' });
    expect((await getSetting('pet')).coins).toBe(30 - SHOP.mouse.price);
    expect(await buyItem('wand')).toMatchObject({ ok: false });       // 23 < 30
    expect(await doAction('play', 'mouse')).toEqual({ ok: true, say: 'Mew!' });
    expect(await doAction('clean')).toEqual({ ok: false, say: 'Already clean.' });
  });

  it('signed in: the cat lives in your account and comes to your other devices', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const cloud = fakeCloud();
    await initPet({ cloud });
    expect(cloud.listen).not.toHaveBeenCalled();                  // signed out: local only
    await store.dispatch('AUTH_SET', { user: { uid: 'u1' } });
    expect(cloud.listen).toHaveBeenCalledWith('u1', expect.any(Function), expect.any(Function));

    // This phone has never seen him, and neither has the account: nothing happens
    await onRemote(null);
    expect(cloud.put).not.toHaveBeenCalled();

    // Found on another phone → arrives here, bowl and all
    const events = [];
    subscribePet((_, ev) => events.push(ev));
    const other = { ...newPet(Date.now()), coins: 9, awarded: ['x'] };
    await onRemote(other);
    expect(isFound()).toBe(true);
    expect(getPet().coins).toBe(9);
    expect(events.at(-1)).toMatchObject({ synced: true, found: true });
    expect((await getSetting('pet')).coins).toBe(9);

    // Doing something here uploads (after a short pause)
    await doAction('pet');
    expect(cloud.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UPLOAD_DELAY_MS);
    expect(cloud.put).toHaveBeenCalledTimes(1);
    expect(cloud.docs.u1.love).toBe(getPet().love);

    // A coin earned on the other phone while this one also earned one: both kept
    await earnCoin('here');
    await onRemote({ ...cloud.docs.u1, coins: 10, awarded: ['x', 'there'], updatedAt: Date.now() + 1000 });
    expect(getPet().coins).toBe(11);
    expect(getPet().awarded.sort()).toEqual(['here', 'there', 'x']);
    await vi.advanceTimersByTimeAsync(UPLOAD_DELAY_MS);
    expect(cloud.docs.u1.coins).toBe(11);                         // account catches up

    // Sign out: stop syncing
    await store.dispatch('AUTH_SET', { user: null });
    expect(cloud.cb).toBeNull();
  });

  it('first device to find him puts him in the account; upload errors are not fatal', async () => {
    const cloud = fakeCloud();
    await initPet({ cloud });
    await markFound();
    await store.dispatch('AUTH_SET', { user: { uid: 'u2' } });
    await onRemote(null);
    expect(cloud.docs.u2.found).toBe(true);
    cloud.put.mockRejectedValueOnce(new Error('offline'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(uploadNow()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('cat sync safety', () => {
  it('"no cat" from the phone\'s own memory is ignored; nothing uploads until the account has been heard', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const cloud = fakeCloud();
    await initPet({ cloud });
    await markFound();                                              // found while signed out
    await store.dispatch('AUTH_SET', { user: { uid: 'u3' } });
    await onRemote(null, { fromCache: true });                      // offline / not loaded yet
    await doAction('pet');
    await vi.advanceTimersByTimeAsync(UPLOAD_DELAY_MS * 2);
    expect(cloud.put).not.toHaveBeenCalled();                       // might have overwritten the account's cat
    await onRemote(null);                                           // the server: really no cat yet
    expect(cloud.put).toHaveBeenCalledTimes(1);
    expect(cloud.docs.u3.found).toBe(true);
    expect(cloud.docs.u3.newHere).toBeUndefined();
  });

  it('a cat found on a new phone (or after reinstalling) never replaces the one in your account', async () => {
    const cloud = fakeCloud();
    const mine = { ...newPet(Date.now() - D), coins: 57, treats: 4, toys: { wand: { until: Date.now() + 9 * D } }, awarded: ['a', 'b'], updatedAt: Date.now() - H };
    cloud.docs.u4 = mine;
    await initPet({ cloud });
    await store.dispatch('AUTH_SET', { user: { uid: 'u4' } });
    const p = await markFound();                                    // 14 taps on the new phone
    expect(cloud.get).toHaveBeenCalledWith('u4');
    expect(p.coins).toBe(57);                                       // he's back, coins, toys and all
    expect(p.toys.wand).toBeTruthy();
    expect(p.newHere).toBeUndefined();
  });

  it('if the account could not be checked, the new cat still loses to the account one when it arrives', async () => {
    const cloud = fakeCloud();
    cloud.get.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await initPet({ cloud });
    await store.dispatch('AUTH_SET', { user: { uid: 'u5' } });
    await markFound();
    expect(getPet().newHere).toBe(true);
    await doAction('feed');                                         // newer care, but still a stranger
    await earnCoin('here');
    await onRemote({ ...newPet(Date.now() - D), coins: 40, awarded: ['old'], updatedAt: Date.now() - D });
    expect(getPet().coins).toBe(41);                                // account's cat + the coin earned here
    expect(getPet().newHere).toBeUndefined();
    warn.mockRestore();
  });

  it('if syncing failed (e.g. no permission), it tries again when the app comes back', async () => {
    const cloud = fakeCloud();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await initPet({ cloud });
    await store.dispatch('AUTH_SET', { user: { uid: 'u6' } });
    expect(cloud.listen).toHaveBeenCalledTimes(1);
    resumePetSync();
    expect(cloud.listen).toHaveBeenCalledTimes(1);                  // fine: nothing to do
    cloud.onErr(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    expect(document.querySelector('.toast')?.textContent).toMatch(/couldn't sync/);
    resumePetSync();
    expect(cloud.listen).toHaveBeenCalledTimes(2);
    err.mockRestore();
    document.querySelectorAll('.toast').forEach(t => t.remove());
  });

  it('merge: newHere side loses whichever is newer', () => {
    const acct = { ...newPet(T0), coins: 50, awarded: ['a'], updatedAt: T0 };
    const fresh = { ...newPet(T0 + D), newHere: true, awarded: ['b'] };
    for (const m of [mergePets(fresh, acct), mergePets(acct, fresh)]) {
      expect(m.coins).toBe(51);
      expect(m.newHere).toBeUndefined();
    }
  });
});

// ── Page + bowl ─────────────────────────────────────────────────────────────

async function petWith(over) {
  await initPet({ cloud: fakeCloud() });
  await markFound();
  await setSetting('pet', { ...getPet(), ...over });
  _resetPet();
  await initPet({ cloud: fakeCloud() });
}
/** Wait for whatever the last tap on the cat page set going. */
const tick0 = async () => { await document.querySelector('.secret-page')?.idle; };

describe('secret page (cat game)', () => {
  it('first visit: the game begins, with an intro; one page at a time', async () => {
    await initPet({ cloud: fakeCloud() });
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    const [a, b] = await Promise.all([openSecretPage(), openSecretPage()]);
    expect(a).toBe(b);
    expect(document.querySelectorAll('.secret-page')).toHaveLength(1);
    expect(isFound()).toBe(true);
    expect(a.querySelector('.pet-status').textContent).toMatch(/Meet your cat/);
    expect(a.querySelector('.mascot--big').dataset.eyes).toBe('open');
    expect(a.querySelector('.pet-room__scratcher')).not.toBeNull();
    expect(a.querySelectorAll('.pet-room__bowls svg')).toHaveLength(5);   // food full/empty, water 2 ripple frames + empty
    expect(a.querySelectorAll('.pet-meter__bar[role="meter"]')).toHaveLength(4);
    expect(a.querySelectorAll('.pet-action')).toHaveLength(5);
    expect(a.querySelector('.pet-coins__count').textContent).toBe(String(STARTING_COINS));   // a new cat comes with coins
    expect(await openSecretPage()).toBe(a);
    a.querySelector('.secret-page__close').click();
    expect(isSecretOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);
    btn.remove();
  });

  it('toy box: empty silhouettes, buying fills the slot and puts the toy in his room', async () => {
    await petWith({ coins: 20, treats: 0 });
    const page = await openSecretPage();
    const burger = page.querySelector('.pet-burger');
    const box = page.querySelector('.pet-toybox');
    expect(box.hidden).toBe(true);
    burger.click();
    expect(box.hidden).toBe(false);
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.secret-page__close').hidden).toBe(true);   // only one × at a time
    const slot = (k) => page.querySelector(`.pet-slot[data-item="${k}"]`);
    expect(page.querySelectorAll('.pet-slot')).toHaveLength(6);
    expect(slot('mouse').classList.contains('is-owned')).toBe(false);
    expect(slot('mouse').classList.contains('is-affordable')).toBe(true);
    expect(slot('wand').classList.contains('is-affordable')).toBe(false);
    expect(page.querySelector('.pet-room__toy--mouse').hidden).toBe(true);

    slot('mouse').click();
    await vi.waitFor(() => expect(slot('mouse').classList.contains('is-owned')).toBe(true));
    expect(slot('mouse').querySelector('.pet-slot__info').textContent).toMatch(/days left/);
    expect(page.querySelector('.pet-room__toy--mouse').hidden).toBe(false);
    expect(page.querySelector('.pet-coins__count').textContent).toBe('13');

    slot('wand').click();
    await vi.waitFor(() => expect(page.querySelector('.pet-toybox__say').textContent).toMatch(/17 more coins/));

    slot('treats').click();
    await vi.waitFor(() => expect(page.querySelector('[data-action="treat"] .pet-action__label').textContent).toBe('Treat (5)'));

    // Back closes the toy box first, then the page
    secretBack();
    expect(box.hidden).toBe(true);
    expect(page.querySelector('.secret-page__close').hidden).toBe(false);
    expect(isSecretOpen()).toBe(true);
    secretBack();
    expect(isSecretOpen()).toBe(false);
  });

  it('playing: tap a toy in the room, the scratcher, or Play with the wand', async () => {
    await petWith({ fun: 10, hunger: 60, toys: { ball: { until: Date.now() + D }, wand: { until: Date.now() + D } } });
    const page = await openSecretPage();
    const fun = () => getPet().fun;
    const before = fun();
    page.querySelector('.pet-room__toy--ball').click();
    await tick0();
    expect(fun()).toBeGreaterThan(before);
    expect(page.querySelector('.pet-room__toy--ball').classList.contains('is-playing')).toBe(true);
    const f2 = fun();
    page.querySelector('.pet-room__scratcher').click();
    await tick0();
    expect(fun()).toBeCloseTo(Math.min(100, f2 + SCRATCH_FUN), 2);
  });

  it('Play opens the string-wand game: 3 traced rounds, better score = more fun', async () => {
    const { shapePoints, ROUNDS, rewardFactor } = await import('../src/pet/trace.js');
    await petWith({ fun: 10, hunger: 60, toys: { wand: { until: Date.now() + D } } });
    const page = await openSecretPage();
    page.querySelector('[data-action="play"]').click();
    const game = page.wandGame;
    expect(page.querySelector('.wand-game')).not.toBeNull();
    expect(page.querySelector('.wand-game__guide').getAttribute('d')).toMatch(/^M/);
    expect(new Set(game.shapes).size).toBe(ROUNDS);               // three different shapes
    page.querySelector('[data-action="play"]').click();           // can't open twice
    expect(page.querySelectorAll('.wand-game')).toHaveLength(1);

    // Round 1 perfect, round 2 a scribble, round 3 perfect
    expect(game.trace(shapePoints(game.current().name))).toBeCloseTo(1, 1);
    game.next();
    expect(page.querySelector('.wand-game').dataset.round).toBe('2');
    expect(game.trace([[0.02, 0.02], [0.05, 0.03]])).toBeLessThan(0.1);
    game.next();
    game.trace(shapePoints(game.current().name));
    const before = getPet().fun;
    await game.next();                                             // finish: reward applied
    const avg = game.scores.reduce((a, b) => a + b, 0) / 3;
    expect(getPet().fun).toBeCloseTo(Math.min(100, before + SHOP.wand.fun * rewardFactor(avg)), 0);
    expect(page.querySelector('.wand-game__big').textContent).toMatch(/of 9/);
    expect(page.querySelector('.wand-game__sub').textContent).toMatch(/\+\d+ fun/);
    page.querySelector('.wand-game__done').click();
    expect(page.querySelector('.wand-game')).toBeNull();
  });

  it('wand game: back / Escape stop it without a reward; too hungry → no game', async () => {
    await petWith({ fun: 10, hunger: 60, toys: { wand: { until: Date.now() + D } } });
    const page = await openSecretPage();
    page.querySelector('[data-action="play"]').click();
    const fun = getPet().fun;
    secretBack();
    expect(page.querySelector('.wand-game')).toBeNull();
    expect(isSecretOpen()).toBe(true);
    expect(getPet().fun).toBe(fun);
    closeSecretPage();
    await petWith({ hunger: 5, toys: { wand: { until: Date.now() + D } } });
    const p2 = await openSecretPage();
    p2.querySelector('[data-action="play"]').click();
    expect(p2.querySelector('.wand-game')).toBeNull();
    expect(p2.querySelector('.pet-status').textContent).toMatch(/hungry/);
  });

  it('no wand: Play explains; treats, petting, feeding, cleaning', async () => {
    await petWith({ hunger: 20, poops: 2, treats: 1 });
    const page = await openSecretPage();
    const click = async (a) => { page.querySelector(`[data-action="${a}"]`).click(); await tick0(); };
    await click('play');
    await vi.waitFor(() => expect(page.querySelector('.pet-status').textContent).toMatch(/string wand/));
    expect(page.querySelector('[data-action="play"]').classList.contains('is-empty')).toBe(true);
    await click('feed');
    expect([...page.querySelectorAll('.mascot__bubble')].at(-1).textContent).toBe('Nom nom');
    await click('treat');
    expect(page.querySelector('.mascot__fish')).toBeNull();          // no fish for treats
    expect(getPet().treats).toBe(0);
    await click('pet');
    expect(page.querySelector('.mascot__heart')).not.toBeNull();
    await click('clean');
    expect(getPet().poops).toBe(0);
  });

  it('a neglected cat is grumpy and leaves mice you can tap away; lost toys are announced', async () => {
    await petWith({ hunger: 0, fun: 0, love: 0, mice: 2 });
    const page = await openSecretPage();
    expect(page.querySelector('.mascot--big').dataset.eyes).toBe('grumpy');
    const mice = page.querySelectorAll('.pet-mouse');
    expect(mice).toHaveLength(2);
    mice[0].click();
    await vi.waitFor(() => expect(page.querySelectorAll('.pet-mouse')).toHaveLength(1));
    page.querySelector('.mascot--big').click();
    await vi.waitFor(() => expect(getPet().love).toBeGreaterThan(0));
    // A toy's time runs out while the page is open
    await setSetting('pet', getPet());
    getPet().toys = { feather: { until: Date.now() - 1 } };
    await refreshPet();
    expect(page.querySelector('.pet-status').textContent).toMatch(/lost the feather/);
  });

  it('stink lines rise from the litter box at 2 Clean bars or fewer; water ripples', async () => {
    expect(isStinky({ ...newPet(T0), poops: 2 })).toBe(false);          // 40 → 4 bars
    expect(isStinky({ ...newPet(T0), poops: 2, mice: 2 })).toBe(true);  // 20 → 2 bars
    expect(isStinky({ ...newPet(T0), poops: 3 })).toBe(true);           // 10 → 1 bar
    await petWith({ poops: 3 });
    const page = await openSecretPage();
    const stink = page.querySelector('.pet-room__stink');
    expect(stink.style.display).toBe('');
    expect(page.querySelector('.pet-room__water .pet-room__water-b')).not.toBeNull();
    expect(page.querySelector('.pet-meter--love')).not.toBeNull();
    page.querySelector('[data-action="clean"]').click();
    await vi.waitFor(() => expect(stink.style.display).toBe('none'));
  });

  it('window: daytime sky from 7am until 8pm, night sky otherwise', async () => {
    const at = (h, m = 0) => new Date(2026, 9, 2, h, m);
    expect(isDaytime(at(6, 59))).toBe(false);
    expect(isDaytime(at(7))).toBe(true);
    expect(isDaytime(at(19, 59))).toBe(true);
    expect(isDaytime(at(20))).toBe(false);
    expect(S.WINDOW_DAY.length).toBe(S.WINDOW.length);
    expect(S.WINDOW_DAY[0].length).toBe(S.WINDOW[0].length);
    await petWith({});
    const page = await openSecretPage();
    const win = page.querySelector('.pet-room__window');
    const expected = isDaytime() ? 'day' : 'night';
    expect(win.dataset.time).toBe(expected);
    expect(win.querySelector(`.pet-room__window-${expected}`).style.display).toBe('');
  });

  it('window: checked on open, then hourly or when the app comes back — not every minute', async () => {
    await petWith({});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 19, 30));            // 7:30pm: day
    const page = await openSecretPage();
    const win = page.querySelector('.pet-room__window');
    expect(win.dataset.time).toBe('day');
    vi.setSystemTime(new Date(2026, 9, 2, 20, 10));            // past 8pm, but no re-check yet
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(win.dataset.time).toBe('day');
    await vi.advanceTimersByTimeAsync(WINDOW_CHECK_MS);       // the hourly check
    expect(win.dataset.time).toBe('night');
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0));              // next morning, app reopened
    document.dispatchEvent(new Event('visibilitychange'));
    expect(win.dataset.time).toBe('day');
    closeSecretPage();
  });

  it('tapping him: a heart every time, but only the odd "Purr"', async () => {
    await petWith({ love: 10 });
    const page = await openSecretPage();
    const cat = page.querySelector('.mascot--big');
    for (let i = 0; i < 3; i++) { cat.click(); await tick0(); }
    expect(page.querySelectorAll('.mascot__heart').length).toBe(3);
    expect(page.querySelectorAll('.mascot__bubble').length).toBe(1);
    expect(PURR_EVERY_MS).toBeGreaterThan(1000);
  });

  it('closes with Escape', async () => {
    await initPet({ cloud: fakeCloud() });
    const page = await openSecretPage();
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isSecretOpen()).toBe(false);
    closeSecretPage();
  });
});

describe('top-bar food bowl', () => {
  it('hidden until found; full/empty with his hunger; a coin pops out when one is earned', async () => {
    await initPet({ cloud: fakeCloud() });
    const onOpen = vi.fn();
    const bowl = createPetBowl({ onOpen });
    expect(bowl.hidden).toBe(true);
    await markFound();
    expect(bowl.hidden).toBe(false);
    expect(bowl.dataset.full).toBe('true');
    await setSetting('pet', { ...getPet(), hunger: 10 });
    _resetPet();
    const bowl2 = createPetBowl({ onOpen });
    await initPet({ cloud: fakeCloud() });
    expect(bowl2.dataset.full).toBe('false');
    await earnCoin('task-1');
    expect(bowl2.querySelector('.pet-bowl__coin')).not.toBeNull();
    bowl2.click();
    expect(onOpen).toHaveBeenCalled();
    bowl.stopBowl();
    bowl2.stopBowl();
  });
});
