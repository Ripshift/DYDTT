/**
 * DYDTT — Cat game pixel art. Same character-grid format as Mascot.js.
 * The room and everything in it use only gold, silver, grey and black
 * (on a deep purple background); the cat himself stays orange.
 * '.' = transparent.
 */

/** One palette for the whole room. */
export const ROOM = {
  k: '#0B0710',   // black (outlines)
  d: '#3A3442',   // dark grey
  g: '#7A7F88',   // grey
  s: '#C0C6CF',   // silver
  S: '#EEF1F5',   // bright silver (shine, water)
  y: '#8A6E24',   // dark gold
  Y: '#C9A84C',   // gold
  L: '#F0DC8C',   // light gold
  b: '#3F7FD0',   // water blue
  B: '#8FC3F2',   // water highlight
  p: '#E98A93',   // pink (mouse tails)
  m: '#7C8F6A',   // grey-green (stink)
};

/** Room colours for CSS. */
export const ROOM_BG = '#150A22';      // deep, deep purple
export const ROOM_FLOOR = '#1E0F31';

// Kept as named palettes so callers can stay explicit
export const BOWL_PALETTE = ROOM;
export const LITTER_PALETTE = ROOM;
export const MOUSE_PALETTE = ROOM;
export const SCOOP_PALETTE = ROOM;

// ── Bowls ──────────────────────────────────────────────────────────────────

export const BOWL_FULL = [
  '...yYyYy...',
  '.kyYyyYyyk.',
  'kLLLLLLLLLk',
  '.kYYYYYYyk.',
  '..kyYYYyk..',
  '...kkkkk...',
];
export const BOWL_EMPTY = [
  '...........',
  '.kkkkkkkkk.',
  'kLdddddddLk',
  '.kYYYYYYyk.',
  '..kyYYYyk..',
  '...kkkkk...',
];
export const WATER_FULL = [
  '...........',
  '.kkkkkkkkk.',
  'kYbBbbbBbYk',
  'kYYYYYYYYyk',
  '.kYYYYYYyk.',
  '..kyYYYyk..',
  '...kkkkk...',
];
export const WATER_EMPTY = [
  '...........',
  '.kkkkkkkkk.',
  'kYdddddddYk',
  'kYYYYYYYYyk',
  '.kYYYYYYyk.',
  '..kyYYYyk..',
  '...kkkkk...',
];
/** Second water frame — the two alternate so the water ripples and glints. */
export const WATER_FULL_2 = [
  '...........',
  '.kkkkkkkkk.',
  'kYbbBbBbbYk',
  'kYYYYYYYYyk',
  '.kYYYYYYyk.',
  '..kyYYYyk..',
  '...kkkkk...',
];

// ── Window (fills the wall). Night: silver moon and stars. Day: sun and clouds ──

export const WINDOW = [
  'kkkkkkkkkkkkkkkkkkkkkkk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kYkkkkkkkkkYkkkkkkkkkYk',
  'kYk.......kYk.......kYk',
  'kYk..S....kYk.....S.kYk',
  'kYk.......kYk...SS..kYk',
  'kYk.......kYk..SSs..kYk',
  'kYk.....S.kYk..S....kYk',
  'kYk.......kYk..S....kYk',
  'kYk.......kYk..SSs..kYk',
  'kYk.S.....kYk...SS..kYk',
  'kYk.......kYk.......kYk',
  'kYkkkkkkkkkkkkkkkkkkkYk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kYkkkkkkkkkkkkkkkkkkkYk',
  'kYk.......kYk......SkYk',
  'kYk...S...kYk.......kYk',
  'kYk.......kYk..S....kYk',
  'kYk.......kYk.......kYk',
  'kYk......SkYk.......kYk',
  'kYk.......kYk.....S.kYk',
  'kYk.S.....kYk.......kYk',
  'kYkkkkkkkkkYkkkkkkkkkYk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kyyyyyyyyyyyyyyyyyyyyyk',
  'kkkkkkkkkkkkkkkkkkkkkkk',
];

/** The same window by day: blue sky, gold sun, white clouds. */
export const WINDOW_DAY = [
  'kkkkkkkkkkkkkkkkkkkkkkk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kYkkkkkkkkkYkkkkkkkkkYk',
  'kYkBBBBBBBkYkBBBBBBBkYk',
  'kYkBBBBBBBkYkBBYYYBBkYk',
  'kYkBBSSBBBkYkBYLLLYBkYk',
  'kYkSSSSSSBkYkYLLLLLYkYk',
  'kYksssssBBkYkYLLLLLYkYk',
  'kYkBBBBBBBkYkYLLLLLYkYk',
  'kYkBBBBBBBkYkBYLLLYBkYk',
  'kYkBBBBBBBkYkBBYYYBBkYk',
  'kYkBBBBBBBkYkBBBBBBBkYk',
  'kYkkkkkkkkkkkkkkkkkkkYk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kYkkkkkkkkkkkkkkkkkkkYk',
  'kYkBBBBBBBkYkBBBBBBBkYk',
  'kYkBBSSSBBkYkBBBBBBBkYk',
  'kYkBSSSSSSkYkBBBBBBBkYk',
  'kYkBsssssskYkBBBBBBBkYk',
  'kYkBBBBBBBkYkBBSSBBBkYk',
  'kYkBBBBBBBkYkSSSSSSBkYk',
  'kYkBBBBBBBkYkBssssBBkYk',
  'kYkkkkkkkkkYkkkkkkkkkYk',
  'kYYYYYYYYYYYYYYYYYYYYYk',
  'kyyyyyyyyyyyyyyyyyyyyyk',
  'kkkkkkkkkkkkkkkkkkkkkkk',
];

// ── Litter box ─────────────────────────────────────────────────────────────
// Big hooded box, drawn as its RIGHT half only: it sits against the room's left
// edge so it looks like it carries on out of view. Poops show on the sand in
// the doorway; stink lines rise from the hood when it's dirty.

export const LITTER = [
  'kkkk..............',
  'YYYk..............',
  'kkkkkkkk..........',
  'sSSSsggkkkk.......',
  'sSSsssssggkkk.....',
  'kkksssssssggkk....',
  'dddkkssssssggkk...',
  'dddddkssssssggkk..',
  'ddddddkssssssggkk.',
  'ddddddksssssssggk.',
  'ddddddksssssssggk.',
  'ddddddksssssssggk.',
  'ddddddksssssssggk.',
  'ddddddksssssssggk.',
  'ddddddkYYYYYYYYYYk',
  'ddddddksssssssggk.',
  'ggggggksssssssggk.',
  'ggggggksssssssggk.',
  'kkkkkkksssssssggk.',
  'ssssssssssssssggk.',
  'ssssssssssssssggk.',
  'kkkkkkkkkkkkkkkkk.',
];
export const POOP = [
  '.k.',
  'kdk',
];
/** Wavy stink lines that rise off the hood when the box is dirty. */
export const STINK = [
  '.m...m...m.',
  'm...m...m..',
  '.m...m...m.',
  '..m...m...m',
  '.m...m...m.',
  'm...m...m..',
  '.m...m...m.',
];

export const POOP_SPOTS = [[16, 0], [16, 3], [15, 1]];   // [row, col] — on the sand inside the doorway

// ── Scratcher (always there, free) ────────────────────────────────────────

/** Scratching post: wide gold rope post, silver top and base. */
export const SCRATCHER = [
  '.kkkkkkkkkkk.',
  'kSsssssssssgk',
  '.kkkkkkkkkkk.',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '...kyYyYyk...',
  '...kYyYyYk...',
  '.kkkkkkkkkkk.',
  'kSsssssssssgk',
  '.kkkkkkkkkkk.',
];

// ── The dead mouse he brings when he has to fend for himself ──────────────

/** On his back, feet up, X for an eye. Cartoon, not gory. */
export const MOUSE = [
  '........d..d.....',
  '.kk.....k..k.....',
  'kssk.kkkkkkkk....',
  'kskgkggggggggk...',
  'dggkggggggggggkpp',
  '.kkgkgdddddddk..p',
  '..kkkkkkkkkkkk...',
];

// ── Toy box ────────────────────────────────────────────────────────────────

/** Toy mouse: side view, round ear, nose to the left, tail curling down. */
export const TOY_MOUSE = [
  '.....kk.........',
  '....kddk........',
  '...kdgdkkkkk....',
  '..kssgksssssk...',
  '.kskssssssssgk..',
  'kssssssssssssgk.',
  '.kkssssssssssgk.',
  '...kkkkkkkkkkkpp',
  '..............kp',
];
export const FEATHER = [
  '.....kkk.',
  '....kLLYk',
  '...kLLsYk',
  '..kLLsYk.',
  '..kLsYYk.',
  '.kLsYYk..',
  '.kLsYyk..',
  '.ksYyk...',
  '.ksyk....',
  'ks.k.....',
  'k........',
];
export const BALL = [
  '..kkkk..',
  '.kSssgk.',
  'kSsssggk',
  'kYYYYYyk',
  'kssssggk',
  'kgsssgdk',
  '.kggddk.',
  '..kkkk..',
];
/** Big coil spring lying on its side — three loops. */
export const SPRING = [
  '...kkkkkkkkk.',
  '..kggkggkgggk',
  '.kg.kgkkgk.gk',
  '.kS.kSkkSk.gk',
  'kS.kSkkSk.gk.',
  'kS.kSkkSk.gk.',
  'kS.kS.kS.sk..',
  'kSSkSSkSSk...',
  '.kk.kk.kk....',
];
/** String wand, like a little fishing rod: gold handle, reel, line and a feather lure. */
export const WAND = [
  '.............gss.',
  '............gk.s.',
  '...........gk..s.',
  '..........gk...s.',
  '.........gk....s.',
  '........gk.....s.',
  '......kgk......s.',
  '.....ksk.......s.',
  '....ksSk.......s.',
  '....Yk.........s.',
  '...Yy..........s.',
  '..Yy..........kSk',
  '.Yy...........YLY',
  'Yy............yYy',
  'k..............y.',
  '.................',
];
/** A pile of kibble treats (dark gold). */
export const TREATS = [
  '......kk......',
  '.....kYyk.....',
  '.....kyyk.....',
  '...kk.kk.kk...',
  '..kYykYykYyk..',
  '..kyykyykyyk..',
  '.kkkkkkkkkkkk.',
  'kYykYykYykkYyk',
  'kyykyykyykkyyk',
  '.kk.kk.kk..kk.',
];
export const COIN = [
  '..kkk..',
  '.kLLYk.',
  'kLYYYyk',
  'kLYyYyk',
  'kLYYYyk',
  '.kYyyk.',
  '..kkk..',
];

/** The wand's feather lure (minigame): silver bead on top, gold tuft. */
export const LURE = [
  '..kk..',
  '.kSSk.',
  '.kYYk.',
  'kYLLYk',
  'kYLLYk',
  'kyYYyk',
  '.kyyk.',
  '..kk..',
];

/** Each shop item's picture. */
export const ITEM_SPRITES = {
  treats: TREATS, mouse: TOY_MOUSE, ball: BALL, feather: FEATHER, spring: SPRING, wand: WAND,
};

/** Gold heart / silver fish for things floating up from him in the room. */
export const GOLD_HEART_PALETTE = { r: '#0B0710', H: '#C9A84C', h: '#8A6E24', W: '#F0DC8C' };
export const SILVER_FISH_PALETTE = { r: '#0B0710', B: '#C0C6CF', D: '#7A7F88', W: '#EEF1F5', w: '#EEF1F5', K: '#0B0710' };

/** Left–right mirror of a grid. */
export function mirror(grid) {
  return grid.map(row => [...row].reverse().join(''));
}

/** Same shape, one flat colour — the empty slot in the toy box. */
export function silhouette(grid, ch = '#') {
  return grid.map(row => row.replace(/[^.]/g, ch));
}

// Clean button
export const SCOOP = [
  '.kkkk....',
  'ksgsgk...',
  'kssssk...',
  'kgsgskk..',
  '.kkkkkYk.',
  '......kYk',
  '.......kY',
];
