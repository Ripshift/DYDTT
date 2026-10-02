/**
 * DYDTT — The cat's secret page: a little Tamagotchi (Android app).
 *
 * First found by tapping the top-bar cat 14 times; after that the small food
 * bowl next to him opens it.
 *
 * His room (gold, silver, grey and black on deep purple): scratcher, litter
 * box, food + water bowls, and floor space where his toys sit. Tap a toy to
 * play with it, the scratcher to let him scratch, him to pet him.
 * The burger opens the toy box: slots shaped like each toy, bought with the
 * gold coins earned by ticking off tasks.
 *
 * Closes with the X, Escape, or the phone's back button (which closes the toy
 * box first if it's open).
 */

import { createMascot, pixelSvg, HEART, HEART_PALETTE } from './Mascot.js';
import {
  ROOM, WINDOW, WINDOW_DAY, BOWL_FULL, BOWL_EMPTY, WATER_FULL, WATER_EMPTY, LITTER, POOP, POOP_SPOTS, SCRATCHER,
  MOUSE, COIN, SCOOP, ITEM_SPRITES, SILVER_FISH_PALETTE, silhouette, WATER_FULL_2, STINK, mirror,
} from '../pet/sprites.js';
import { markFound, getPet, subscribePet, refreshPet, doAction, buyItem } from '../pet/petStore.js';
import { mood, status, cleanliness, lostText, timeLeft, playBlocker, SHOP, SHOP_ORDER, TOYS } from '../pet/pet.js';
import { rewardFactor } from '../pet/trace.js';
import { createWandGame } from './WandGame.js';
import { BOWL_FULL_AT } from './PetBowl.js';

const REFRESH_MS = 60_000;
export const WINDOW_CHECK_MS = 60 * 60_000;   // day/night window: re-check hourly
export const PURR_EVERY_MS = 4000;            // tapping him: at most one "Purr" this often
const INTRO = 'Meet your cat! Keep him fed, loved, entertained and his litter box clean. '
            + 'Ticking off your tasks earns gold coins for treats and toys (☰).';
const SLOT_COLOUR = { '#': '#2C1A44' };
const ROOM_SCALE = 4;     // furniture + toys
const CAT_SCALE = 5;
const LITTER_SCALE = 5;   // the big hooded box

let page = null;
let cleanup = [];
let returnFocus = null;
let opening = null;
let menuApi = null;
let gameApi = null;          // the string-wand minigame, while it's open

export function isSecretOpen() {
  return Boolean(page);
}

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};
const button = (className, label) => {
  const b = el('button', className);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
};
const sprite = (grid, scale = ROOM_SCALE, cls = '') => pixelSvg(grid, ROOM, scale, cls);

/** The window shows daytime from 7am until 8pm (phone's local time). */
export const DAY_FROM_HOUR = 7;
export const NIGHT_FROM_HOUR = 20;
export function isDaytime(date = new Date()) {
  const h = date.getHours();
  return h >= DAY_FROM_HOUR && h < NIGHT_FROM_HOUR;
}

/** Stink lines show when the Clean meter is down to 2 bars or fewer. */
export const STINK_AT_BARS = 2;
export function isStinky(pet) {
  return Math.round(cleanliness(pet) / 10) <= STINK_AT_BARS;
}

/** Litter box with 0–3 poops, as one grid. */
export function litterGrid(poops) {
  const g = LITTER.map(r => r.split(''));
  POOP_SPOTS.slice(0, poops).forEach(([r, c]) => {
    POOP.forEach((row, i) => [...row].forEach((ch, j) => { if (ch !== '.') g[r + i][c + j] = ch; }));
  });
  return g.map(r => r.join(''));
}

function meter(label, kind = '') {
  const wrap = el('div', kind ? `pet-meter pet-meter--${kind}` : 'pet-meter');
  const name = el('span', 'pet-meter__label', label);
  const bar = el('div', 'pet-meter__bar');
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  const cells = [...Array(10)].map(() => bar.appendChild(el('span', 'pet-meter__cell')));
  wrap.append(name, bar);
  return {
    node: wrap,
    set(v) {
      const n = Math.round(v / 10);
      bar.setAttribute('aria-valuenow', String(Math.round(v)));
      bar.dataset.level = v < 20 ? 'low' : v < 45 ? 'mid' : 'high';
      cells.forEach((c, i) => c.classList.toggle('is-on', i < n));
    },
  };
}

function actionBtn(label, icon, action) {
  const b = button('pet-action');
  b.dataset.action = action;
  b.append(icon, el('span', 'pet-action__label', label));
  return b;
}

/** Back button: close the toy box if open, otherwise the page. */
export function secretBack() {
  if (gameApi) { gameApi.close(); return; }
  if (menuApi?.isOpen()) { menuApi.close(); return; }
  closeSecretPage();
}

export function openSecretPage() {
  if (page) return Promise.resolve(page);
  opening ??= buildPage().finally(() => { opening = null; });
  return opening;
}

async function buildPage() {
  returnFocus = document.activeElement;
  const firstVisit = !getPet()?.found;
  await markFound();
  await refreshPet();

  page = el('div', 'secret-page');
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-labelledby', 'secret-title');

  // ── Header: ☰ toy box · coins · title · × ─────────────────────────────
  const header = el('div', 'pet-header');
  const burger = button('pet-burger', 'Toy box');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-controls', 'pet-toybox');
  burger.append(el('span'), el('span'), el('span'));
  const coins = el('div', 'pet-coins');
  const coinCount = el('span', 'pet-coins__count');
  coins.append(sprite(COIN, 2), coinCount);
  const title = el('h2', 'secret-page__title', 'Your cat');
  title.id = 'secret-title';
  const close = button('secret-page__close', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closeSecretPage);
  const left = el('div', 'pet-header__left');
  left.append(burger, coins);
  header.append(left, title, close);

  // ── Room ─────────────────────────────────────────────────────────────
  const room = el('div', 'pet-room');
  const scratcher = button('pet-room__scratcher', 'Scratcher');
  scratcher.appendChild(sprite(SCRATCHER));
  scratcher.addEventListener('click', () => act('scratch'));
  const litter = el('div', 'pet-room__litter');
  const cat = createMascot({
    scale: CAT_SCALE, eyesOpen: 'open', secret: false, className: 'mascot--big',
    onTap: () => act('pet', undefined, { fromCat: true }),   // a heart every tap, like the top-bar cat
    naps: true,                                 // eyes shut for 3–15 s every 45–90 s
    bubbleMs: 3200,                             // his "Purr" stays twice as long
    fishPalette: SILVER_FISH_PALETTE,           // hearts stay red (love)
    facing: 'left',                             // in his room he looks left, towards the scratcher
  });
  const bowls = el('div', 'pet-room__bowls');
  const food = { full: sprite(BOWL_FULL, ROOM_SCALE, 'pet-room__food'), empty: sprite(BOWL_EMPTY, ROOM_SCALE, 'pet-room__food') };
  // Water ripples: two frames take turns
  const waterFull = el('span', 'pet-room__water');
  waterFull.append(sprite(WATER_FULL, ROOM_SCALE, 'pet-room__water-a'), sprite(WATER_FULL_2, ROOM_SCALE, 'pet-room__water-b'));
  const water = { full: waterFull, empty: sprite(WATER_EMPTY) };
  bowls.append(food.full, food.empty, water.full, water.empty);
  const toyEls = {};
  for (const k of TOYS.filter(t => SHOP[t].placed)) {
    const b = button(`pet-room__toy pet-room__toy--${k}`, `Play with the ${SHOP[k].name.toLowerCase()}`);
    b.dataset.toy = k;
    b.appendChild(sprite(ITEM_SPRITES[k]));
    b.addEventListener('click', () => act('play', k));
    toyEls[k] = b;
  }
  // Rod comes in from the right so the lure dangles in front of his (left-facing) face
  const wandSwing = sprite(mirror(ITEM_SPRITES.wand), 3, 'pet-room__wand');
  // Window: daytime sky 7am–8pm, night sky otherwise
  const win = el('div', 'pet-room__window');
  const winDay = sprite(WINDOW_DAY, 4, 'pet-room__window-day');
  const winNight = sprite(WINDOW, 4, 'pet-room__window-night');
  win.append(winDay, winNight);
  // Check the time when the page opens, then once an hour, and again whenever
  // the app comes back to the front. Day 7am–8pm, night otherwise.
  let windowTimer = null;
  const checkWindow = () => {
    const day = isDaytime(new Date());
    winDay.style.display = day ? '' : 'none';
    winNight.style.display = day ? 'none' : '';
    win.dataset.time = day ? 'day' : 'night';
    clearTimeout(windowTimer);
    windowTimer = setTimeout(checkWindow, WINDOW_CHECK_MS);
  };
  const onVisible = () => { if (!document.hidden) checkWindow(); };
  checkWindow();
  document.addEventListener('visibilitychange', onVisible);
  const stink = sprite(STINK, 3, 'pet-room__stink');
  const mice = el('div', 'pet-room__mice');
  room.append(win, litter, stink, scratcher, cat, bowls, ...Object.values(toyEls), wandSwing, mice);

  const say = el('p', 'pet-status');
  say.setAttribute('aria-live', 'polite');

  const meters = { hunger: meter('Food'), fun: meter('Fun'), love: meter('Love', 'love'), clean: meter('Clean') };
  const meterBox = el('div', 'pet-meters');
  Object.values(meters).forEach(m => meterBox.appendChild(m.node));

  const actions = el('div', 'pet-actions');
  const buttons = {
    feed:  actionBtn('Feed',  sprite(BOWL_FULL, 2), 'feed'),
    treat: actionBtn('Treat', sprite(ITEM_SPRITES.treats, 2), 'treat'),
    pet:   actionBtn('Pet',   pixelSvg(HEART, HEART_PALETTE, 2), 'pet'),
    play:  actionBtn('Play',  sprite(ITEM_SPRITES.wand, 2), 'play'),
    clean: actionBtn('Clean', sprite(SCOOP, 2), 'clean'),
  };
  Object.values(buttons).forEach(b => {
    b.addEventListener('click', () => (b.dataset.action === 'play' ? openWandGame() : act(b.dataset.action)));
    actions.appendChild(b);
  });

  // ── Toy box (burger menu) ────────────────────────────────────────────
  const box = el('div', 'pet-toybox');
  box.id = 'pet-toybox';
  box.hidden = true;
  const boxTitle = el('h3', 'pet-toybox__title', 'Toy box');
  const boxNote = el('p', 'pet-toybox__note', 'Tick off tasks to earn coins. Toys get lost or break after a while.');
  const boxSay = el('p', 'pet-toybox__say');
  boxSay.setAttribute('aria-live', 'polite');
  const grid = el('div', 'pet-toybox__grid');
  const slots = {};
  for (const k of SHOP_ORDER) {
    const item = SHOP[k];
    const slot = button('pet-slot');
    slot.dataset.item = k;
    const art = el('div', 'pet-slot__art');
    const filled = sprite(ITEM_SPRITES[k], 4, 'pet-slot__img');
    const empty = pixelSvg(silhouette(ITEM_SPRITES[k]), SLOT_COLOUR, 4, 'pet-slot__img pet-slot__img--empty');
    art.append(filled, empty);
    const name = el('span', 'pet-slot__name', item.name);
    const info = el('span', 'pet-slot__info');
    const price = el('span', 'pet-slot__price');
    price.append(sprite(COIN, 1), el('span', '', String(item.price)));
    slot.append(art, name, info, price);
    slot.addEventListener('click', () => { page.idle = buy(); });
    const buy = async () => {
      const res = await buyItem(k);
      boxSay.textContent = res.say;
      if (res.ok) {
        slot.classList.remove('is-new');
        void slot.offsetWidth;
        slot.classList.add('is-new');
      }
    };
    slots[k] = { slot, filled, empty, info };
    grid.appendChild(slot);
  }
  box.append(boxTitle, boxNote, grid, boxSay);

  const setMenu = (open) => {
    box.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.classList.toggle('is-open', open);
    close.hidden = open;                          // only one × on screen: the burger's
    if (open) { boxSay.textContent = ''; render(getPet()); slots[SHOP_ORDER[0]].slot.focus(); }
  };
  menuApi = { isOpen: () => !box.hidden, close: () => { setMenu(false); burger.focus(); } };
  burger.addEventListener('click', () => setMenu(box.hidden));

  page.append(header, box, room, say, meterBox, actions);

  // ── String wand minigame (Play) ───────────────────────────────────────
  function openWandGame() {
    if (gameApi) return;
    const blocked = playBlocker(getPet(), 'wand');
    if (blocked !== null) {                       // no wand / too hungry: say why
      if (blocked) { cat.say(blocked); say.textContent = blocked; }
      return;
    }
    if (menuApi?.isOpen()) menuApi.close();
    gameApi = createWandGame({
      onFinish: async (avg) => {
        const before = getPet().fun;
        const run = act('play', 'wand', { factor: rewardFactor(avg) });
        await run;
        const after = getPet()?.fun ?? before;
        return { fun: Math.max(0, after - before) };
      },
      onClose: () => {
        gameApi = null;
        page?.classList.remove('is-playing');
        buttons.play.focus();
      },
    });
    page.classList.add('is-playing');
    page.appendChild(gameApi.el);
    page.wandGame = gameApi;                      // tests
  }

  // ── Render ───────────────────────────────────────────────────────────
  let lastMice = -1;
  let lastPoops = -1;
  function render(pet) {
    if (!page || !pet) return;
    const now = Date.now();
    coinCount.textContent = String(pet.coins);
    coins.setAttribute('aria-label', `${pet.coins} coins`);

    const isFull = pet.hunger >= BOWL_FULL_AT;
    food.full.style.display = water.full.style.display = isFull ? '' : 'none';
    food.empty.style.display = water.empty.style.display = isFull ? 'none' : '';

    if (pet.poops !== lastPoops) {
      lastPoops = pet.poops;
      litter.replaceChildren(sprite(litterGrid(pet.poops), LITTER_SCALE));
    }
    if (pet.mice !== lastMice) {
      lastMice = pet.mice;
      mice.replaceChildren(...[...Array(pet.mice)].map((_, i) => {
        const m = button('pet-mouse', 'Get rid of the dead mouse');
        m.style.setProperty('--i', i);
        m.appendChild(sprite(MOUSE, 3));
        m.addEventListener('click', () => act('mouse'));
        return m;
      }));
    }
    for (const [k, b] of Object.entries(toyEls)) b.hidden = !pet.toys?.[k];

    cat.setRestingEyes(mood(pet) === 'grumpy' ? 'grumpy' : 'open');
    meters.hunger.set(pet.hunger);
    meters.fun.set(pet.fun);
    meters.love.set(pet.love);
    meters.clean.set(cleanliness(pet));
    stink.style.display = isStinky(pet) ? '' : 'none';
    buttons.treat.querySelector('.pet-action__label').textContent = `Treat (${pet.treats})`;
    buttons.treat.classList.toggle('is-empty', pet.treats === 0);
    buttons.play.classList.toggle('is-empty', !pet.toys?.wand);

    for (const k of SHOP_ORDER) {
      const s = slots[k];
      const item = SHOP[k];
      const owned = k === 'treats' ? pet.treats > 0 : Boolean(pet.toys?.[k]);
      s.filled.style.display = owned ? '' : 'none';
      s.empty.style.display = owned ? 'none' : '';
      s.slot.classList.toggle('is-owned', owned);
      const canBuy = k === 'treats' || !owned;
      s.slot.classList.toggle('is-affordable', canBuy && pet.coins >= item.price);
      if (k === 'treats') {
        s.info.textContent = `${pet.treats} left · ${item.pack} per bag`;
        s.slot.setAttribute('aria-label', `Treats: ${pet.treats} left. Buy ${item.pack} for ${item.price} coins`);
      } else if (owned) {
        s.info.textContent = timeLeft(pet.toys[k].until, now);
        s.slot.setAttribute('aria-label', `${item.name}: ${s.info.textContent}`);
      } else {
        s.info.textContent = item.ends === 'break' ? `Breaks after ~${item.days} days` : `Gets lost after ~${item.days} days`;
        s.slot.setAttribute('aria-label', `${item.name}: buy for ${item.price} coins`);
      }
    }
  }

  // ── Doing things ─────────────────────────────────────────────────────
  /** Every tap's work, so tests (and anything else) can wait for it: await page.idle */
  function act(action, toy, opts) {
    const run = doAct(action, toy, opts);
    if (page) page.idle = run;
    return run;
  }
  let lastPurr = 0;
  async function doAct(action, toy, { fromCat = false, factor } = {}) {
    const { ok, say: line } = await doAction(action, toy, factor != null ? { factor } : undefined);
    if (!page) return;
    // Tapping him: hearts every time, but he only purrs now and then
    const quiet = fromCat && Date.now() - lastPurr < PURR_EVERY_MS;
    if (line && !quiet) cat.say(line);
    if (fromCat && !quiet) lastPurr = Date.now();
    say.textContent = ok || !line ? status(getPet()) : line;
    if (!ok) return;
    if (action === 'pet') cat.float('heart');
    if (action === 'scratch') bounce(scratcher, 'is-scratching');
    if (action === 'play') {
      cat.excite();
      if (toy === 'wand') bounce(wandSwing, 'is-swinging');
      else bounce(toyEls[toy], 'is-playing');
    }
  }
  const bounce = (node, cls) => {
    node.classList.remove(cls);
    void node.getBoundingClientRect();
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), 1500);
  };

  render(getPet());
  say.textContent = firstVisit ? INTRO : status(getPet());

  cleanup = [
    subscribePet((pet, ev) => {
      render(pet);
      if (ev?.lost?.length) say.textContent = ev.lost.map(lostText).join(' ');
      if (ev?.earned) bounce(coins, 'is-bump');
    }),
    (() => { const t = setInterval(() => refreshPet(), REFRESH_MS); return () => clearInterval(t); })(),
    () => cat.stopMascot(),
    () => { clearTimeout(windowTimer); document.removeEventListener('visibilitychange', onVisible); },
  ];

  page.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    secretBack();
  });
  document.body.appendChild(page);
  requestAnimationFrame(() => page?.classList.add('secret-page--in'));
  close.focus();
  return page;
}

export function closeSecretPage() {
  if (!page) return;
  cleanup.forEach(fn => fn());
  cleanup = [];
  menuApi = null;
  gameApi?.close();
  gameApi = null;
  page.remove();
  page = null;
  if (returnFocus?.isConnected) returnFocus.focus?.();
  returnFocus = null;
}
