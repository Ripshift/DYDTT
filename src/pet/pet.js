/**
 * DYDTT — Cat game: the rules (pure functions, no storage or DOM).
 *
 * Needs go from 100 (great) to 0 (needs you) on a relaxed clock: checking in a
 * couple of times a day keeps him happy; a day away leaves him needy.
 * He never dies. Neglected, he gets grumpy — and if he's been starving long
 * enough he starts fending for himself and brings you dead mice.
 *
 * Ticking off tasks earns gold coins (1 each). Coins buy treats and toys from
 * the toy box. Toys don't last forever: the mouse, feather, ball and spring get
 * lost, the string wand breaks, and treats run out.
 *
 *   state = {
 *     v: 2, found,
 *     hunger, fun, love,                 // 0–100
 *     poops, mice,                       // litter box 0–3, dead-mouse "presents" 0–3
 *     coins, treats,                     // wallet + treats left
 *     toys: { mouse: { until }, … },     // owned toys and when they'll be lost / break (ms)
 *     poopClock, starveClock,            // hours carried toward the next poop / mouse
 *     lastTick,                          // ms — needs are up to date as of this time
 *     updatedAt,                         // ms — last thing YOU did (sync: newest wins)
 *     awarded: [taskId, …],              // tasks that already paid a coin
 *   }
 */

export const VERSION = 2;
export const MAX = 100;
export const HOURS_TO_EMPTY = { hunger: 30, fun: 36, love: 48 };
export const POOP_EVERY_H = 8;
export const MAX_POOPS = 3;
export const MOUSE_EVERY_H = 8;           // starving this long → a mouse
export const MAX_MICE = 3;
export const MAX_COINS = 9999;
export const STARTING_COINS = 30;          // a new cat comes with enough for a first toy
export const MAX_TREATS = 99;
export const MAX_AWARDED = 500;
export const MAX_CATCHUP_H = 24 * 30;     // never simulate more than a month
const DAY = 86_400_000;
const H = 3_600_000;

/**
 * The toy box. Prices in coins; lifetimes in days.
 *   ends: 'lost' (wanders off) | 'break' | 'runOut' (treats: used up one by one)
 *   fun:  how much playing with it cheers him up
 */
export const SHOP = {
  treats:  { name: 'Treats',      price: 5,  pack: 5, ends: 'runOut' },
  mouse:   { name: 'Toy mouse',   price: 7,  days: 15, ends: 'lost',  fun: 15, placed: true },
  ball:    { name: 'Ball',        price: 14, days: 5,  ends: 'lost',  fun: 20, placed: true },
  feather: { name: 'Feather',     price: 25, days: 8,  ends: 'lost',  fun: 22, placed: true },
  spring:  { name: 'Spring',      price: 14, days: 23, ends: 'lost',  fun: 28, placed: true },
  wand:    { name: 'String wand', price: 30, days: 32, ends: 'break', fun: 40, placed: false },
};
export const SHOP_ORDER = ['feather', 'mouse', 'spring', 'wand', 'ball', 'treats'];
export const TOYS = SHOP_ORDER.filter(k => k !== 'treats');
export const SCRATCH_FUN = 8;             // the scratcher is always there, free

export const GAIN = {
  feed:  { hunger: 35 },
  treat: { hunger: 15, love: 15, fun: 10 },
  pet:   { love: 12, fun: 0 },   // fun set below: a tenth of a play
};
/** A standard play with a toy (the ball). Ten pets add up to one of these. */
export const PLAY_FUN = SHOP.ball.fun;
export const PETS_PER_PLAY = 10;
GAIN.pet.fun = PLAY_FUN / PETS_PER_PLAY;
export const PLAY_HUNGER_COST = 4;
export const FULL_AT = 90;                // won't eat kibble above this
export const TOO_HUNGRY_TO_PLAY = 15;

const clamp = (n) => Math.max(0, Math.min(MAX, n));

export function newPet(now = Date.now()) {
  return {
    v: VERSION,
    found: true,
    hunger: 80, fun: 80, love: 80,
    poops: 0, mice: 0,
    coins: STARTING_COINS, treats: 3,
    toys: {},
    poopClock: 0, starveClock: 0,
    lastTick: now,
    updatedAt: now,
    awarded: [],
  };
}

/** Bring an older save up to date (v1 had treats earned straight from tasks). */
export function migrate(s) {
  if (!s) return s;
  if (s.v === VERSION) return s;
  return {
    ...newPet(s.lastTick ?? Date.now()),
    ...s,
    v: VERSION,
    coins: s.coins ?? 0,
    treats: Math.min(MAX_TREATS, s.treats ?? 0),
    toys: s.toys ?? {},
    updatedAt: s.updatedAt ?? s.lastTick ?? Date.now(),
    awarded: s.awarded ?? [],
  };
}

/** Toys whose time is up at `now`. */
export function expiredToys(s, now = Date.now()) {
  return Object.entries(s.toys ?? {}).filter(([, t]) => t.until <= now).map(([k]) => k);
}

/** Bring the state up to `now`: needs drop, litter fills, mice arrive, toys go missing. */
export function tick(state, now = Date.now()) {
  const s = { ...state };
  const hours = Math.min(MAX_CATCHUP_H, Math.max(0, (now - (s.lastTick ?? now)) / H));
  s.lastTick = Math.max(now, s.lastTick ?? now);

  const gone = expiredToys(s, now);
  if (gone.length) {
    s.toys = { ...s.toys };
    gone.forEach(k => delete s.toys[k]);
  }
  if (hours === 0) return s;

  const hungerRate = MAX / HOURS_TO_EMPTY.hunger;
  const fedHours = Math.min(hours, s.hunger / hungerRate);    // hours before the bowl ran dry
  const starvingHours = hours - fedHours;

  s.hunger = clamp(s.hunger - hours * hungerRate);
  s.fun    = clamp(s.fun - hours * (MAX / HOURS_TO_EMPTY.fun));
  s.love   = clamp(s.love - hours * (MAX / HOURS_TO_EMPTY.love));

  // Litter box fills while he's eating
  s.poopClock += fedHours;
  const newPoops = Math.floor(s.poopClock / POOP_EVERY_H);
  s.poopClock -= newPoops * POOP_EVERY_H;
  s.poops = Math.min(MAX_POOPS, s.poops + newPoops);

  // Fending for himself
  if (starvingHours > 0) {
    s.starveClock += starvingHours;
    const newMice = Math.floor(s.starveClock / MOUSE_EVERY_H);
    s.starveClock -= newMice * MOUSE_EVERY_H;
    s.mice = Math.min(MAX_MICE, s.mice + newMice);
  }
  return s;
}

/** 0–100 overall wellbeing. */
export function wellbeing(s) {
  const avg = (s.hunger + s.fun + s.love) / 3;
  return clamp(Math.round(avg - s.poops * 12 - s.mice * 8));
}

/** 'happy' | 'ok' | 'grumpy' */
export function mood(s) {
  const w = wellbeing(s);
  if (w >= 65) return 'happy';
  if (w >= 35) return 'ok';
  return 'grumpy';
}

/** Cleanliness meter (litter + mice), 0–100. */
export function cleanliness(s) {
  return clamp(MAX - s.poops * 30 - s.mice * 10);
}

/** The most pressing thing, in words. */
export function status(s) {
  if (s.mice > 0) {
    return (s.mice === 1 ? 'He brought you a present…' : `He brought you ${s.mice} presents…`)
      + ' (tap to tidy up)';
  }
  if (s.hunger < 25) return 'He’s hungry.';
  if (s.poops >= 2)  return 'The litter box needs cleaning.';
  if (s.fun < 25)    return 'He’s bored.';
  if (s.love < 25)   return 'He wants some attention.';
  if (s.poops === 1) return 'Content. (The litter box could use a scoop.)';
  return mood(s) === 'happy' ? 'Happy and purring.' : 'Doing alright.';
}

/** Daily notification text. */
export function notificationText(s) {
  if (s.mice > 0)    return 'Your cat left you a present. You might want to check…';
  if (s.hunger < 25) return 'Your cat is hungry. Come fill his bowl!';
  if (s.poops >= 2)  return 'Your cat’s litter box needs cleaning.';
  if (s.fun < 25)    return 'Your cat is bored. Time to play?';
  if (s.love < 25)   return 'Your cat misses you.';
  return 'Your cat says hi. Purr.';
}

/** What happened to a toy, for messages. */
export function lostText(item) {
  const t = SHOP[item];
  if (!t) return '';
  if (t.ends === 'break') return `The ${t.name.toLowerCase()} broke.`;
  return `He lost the ${t.name.toLowerCase()}. Probably under the sofa.`;
}

/** "3 days left", "5 hours left", "Less than an hour left". */
export function timeLeft(until, now = Date.now()) {
  const ms = Math.max(0, until - now);
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days left`;
  if (ms >= DAY) return '1 day left';
  const h = Math.floor(ms / H);
  if (h >= 2) return `${h} hours left`;
  if (h === 1) return '1 hour left';
  return 'Less than an hour left';
}

const add = (s, gains) => {
  const out = { ...s };
  for (const [k, v] of Object.entries(gains)) out[k] = clamp(out[k] + v);
  return out;
};

/**
 * Do something with him.
 * @param {'feed'|'treat'|'pet'|'play'|'scratch'|'clean'|'mouse'} action
 * @param {string} [toy] for 'play': which toy
 * @param {number} [now]
 * @param {{ factor?: number }} [opts] for 'play': scales the fun (wand minigame score)
 * @returns {{ state, ok: boolean, say: string }}
 */
export function act(state, action, toy, now = Date.now(), { factor = 1 } = {}) {
  const s = state;
  const done = (next, say) => ({ state: { ...next, updatedAt: now }, ok: true, say });
  const no = (say) => ({ state: s, ok: false, say });
  switch (action) {
    case 'feed':
      if (s.hunger >= FULL_AT) return no('Full.');
      return done({ ...add(s, GAIN.feed), starveClock: 0 }, 'Nom nom');
    case 'treat':
      if (s.treats <= 0) return no('No treats left. Buy some in the toy box!');
      return done({ ...add(s, GAIN.treat), treats: s.treats - 1, starveClock: 0 }, 'Mrrrow!');
    case 'pet':
      return done(add(s, GAIN.pet), 'Purr');
    case 'scratch':
      return done(add(s, { fun: SCRATCH_FUN }), 'Scritch scratch');
    case 'play': {
      const t = SHOP[toy];
      const blocked = playBlocker(s, toy);
      if (blocked !== null) return no(blocked);
      return done(add(s, { fun: t.fun * factor, hunger: -PLAY_HUNGER_COST }), 'Mew!');
    }
    case 'clean':
      if (s.poops === 0) return no('Already clean.');
      return done({ ...s, poops: 0 }, 'Much better.');
    case 'mouse':
      if (s.mice === 0) return no('');
      return done({ ...s, mice: s.mice - 1 }, 'Hmph.');
    default:
      return no('');
  }
}

/** Why he can't play with this toy right now ('' / message), or null if he can. */
export function playBlocker(s, toy) {
  const t = SHOP[toy];
  if (!t || toy === 'treats') return '';
  if (!s.toys?.[toy]) {
    return toy === 'wand' ? 'No string wand. Get one from the toy box!' : `No ${t.name.toLowerCase()}.`;
  }
  if (s.hunger < TOO_HUNGRY_TO_PLAY) return 'Too hungry to play.';
  return null;
}

/**
 * Buy from the toy box.
 * @returns {{ state, ok: boolean, say: string }}
 */
export function buy(s, item, now = Date.now()) {
  const t = SHOP[item];
  if (!t) return { state: s, ok: false, say: '' };
  if (item !== 'treats' && s.toys?.[item]) return { state: s, ok: false, say: `He already has the ${t.name.toLowerCase()}.` };
  if (item === 'treats' && s.treats >= MAX_TREATS) return { state: s, ok: false, say: 'The treat jar is full.' };
  if (s.coins < t.price) {
    const need = t.price - s.coins;
    return { state: s, ok: false, say: `${need} more coin${need === 1 ? '' : 's'} needed. Tick off some tasks!` };
  }
  const next = { ...s, coins: s.coins - t.price, updatedAt: now };
  if (item === 'treats') {
    next.treats = Math.min(MAX_TREATS, s.treats + t.pack);
    return { state: next, ok: true, say: `+${t.pack} treats` };
  }
  next.toys = { ...s.toys, [item]: { until: now + t.days * DAY } };
  return { state: next, ok: true, say: `New ${t.name.toLowerCase()}!` };
}

/** A ticked-off task earns one gold coin (once per task). */
export function awardCoin(s, taskId, now = Date.now()) {
  if (!taskId || s.awarded.includes(taskId)) return { state: s, earned: false };
  const awarded = [...s.awarded, taskId].slice(-MAX_AWARDED);
  const coins = Math.min(MAX_COINS, s.coins + 1);
  return { state: { ...s, coins, awarded, updatedAt: now }, earned: coins > s.coins };
}

/**
 * Two devices' versions of the same cat → one.
 * The most recently cared-for version wins, but no coin earned on either device
 * is lost (each task pays once, whichever device saw it first).
 */
export function mergePets(a, b) {
  if (!a?.found) return b?.found ? migrate(b) : (a ?? b ?? null);
  if (!b?.found) return migrate(a);
  const A = migrate(a);
  const B = migrate(b);
  // A cat just found on this device (newHere) never replaces one that's already
  // in the account — that one comes back, plus any coins earned here meanwhile.
  const [base, other] = A.newHere && !B.newHere ? [B, A]
    : B.newHere && !A.newHere ? [A, B]
    : (B.updatedAt ?? 0) > (A.updatedAt ?? 0) ? [B, A] : [A, B];
  const seen = new Set(base.awarded);
  const extra = other.awarded.filter(id => !seen.has(id));
  const out = {
    ...base,
    coins: Math.min(MAX_COINS, base.coins + extra.length),
    awarded: [...base.awarded, ...extra].slice(-MAX_AWARDED),
  };
  delete out.newHere;
  return out;
}
