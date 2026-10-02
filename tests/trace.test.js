import { describe, it, expect } from 'vitest';
import {
  SHAPES, SHAPE_NAMES, SAMPLES, ROUNDS, REWARD_MIN, REWARD_MAX,
  resample, shapePoints, pickShapes, scoreTrace, stars, cheer, rewardFactor,
} from '../src/pet/trace.js';
import { act, newPet, playBlocker, SHOP } from '../src/pet/pet.js';

describe('wand minigame maths', () => {
  it('every shape fits the board and samples evenly', () => {
    expect(SHAPE_NAMES.length).toBeGreaterThanOrEqual(ROUNDS);
    for (const name of SHAPE_NAMES) {
      const pts = shapePoints(name);
      expect(pts).toHaveLength(SAMPLES);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
      expect(SHAPES[name].label).toBeTruthy();
    }
    expect(resample([[0, 0], [1, 0]], 3)).toEqual([[0, 0], [0.5, 0], [1, 0]]);
    expect(resample([[0.3, 0.3]], 5)).toEqual([[0.3, 0.3]]);
    expect(resample([[0.3, 0.3], [0.3, 0.3]], 5)).toEqual([[0.3, 0.3]]);
  });

  it('picks different shapes each round', () => {
    const picked = pickShapes(ROUNDS, () => 0);
    expect(new Set(picked).size).toBe(ROUNDS);
    expect(pickShapes(99).length).toBe(SHAPE_NAMES.length);
  });

  it('scores: on the line ≈ 1, half the shape ≈ cover × weight, way off ≈ 0', () => {
    const circle = shapePoints('circle');
    expect(scoreTrace(circle, circle).score).toBeCloseTo(1, 2);
    const half = scoreTrace(circle, circle.slice(0, SAMPLES / 2));
    expect(half.cover).toBeGreaterThan(0.45);
    expect(half.cover).toBeLessThan(0.6);
    expect(half.stay).toBeCloseTo(1, 1);
    expect(scoreTrace(circle, [[0, 0], [0.05, 0.02], [0.02, 0.06]]).score).toBeLessThan(0.05);
    expect(scoreTrace(circle, []).score).toBe(0);
    expect(scoreTrace(circle, null).score).toBe(0);
    // a little wobble is fine
    const wobbly = circle.map(([x, y], i) => [x + (i % 2 ? 0.03 : -0.03), y]);
    expect(stars(scoreTrace(circle, wobbly).score)).toBe(3);
  });

  it('stars, cheers and the reward', () => {
    expect([0, 0.3, 0.6, 0.85].map(stars)).toEqual([0, 1, 2, 3]);
    expect(cheer(1)).toBe('Purrfect!');
    expect(cheer(0)).toBe('Missed it!');
    expect(rewardFactor(0)).toBe(REWARD_MIN);
    expect(rewardFactor(1)).toBe(REWARD_MAX);
    expect(rewardFactor(2)).toBe(REWARD_MAX);
    expect(rewardFactor(undefined)).toBe(REWARD_MIN);
  });

  it('play with a score factor scales the fun; playBlocker explains why not', () => {
    const p = { ...newPet(0), fun: 0, hunger: 60, toys: { wand: { until: Date.now() + 1e9 } } };
    expect(act(p, 'play', 'wand', 1, { factor: 2 }).state.fun).toBe(Math.min(100, SHOP.wand.fun * 2));
    expect(act(p, 'play', 'wand', 1).state.fun).toBe(SHOP.wand.fun);
    expect(playBlocker(p, 'wand')).toBeNull();
    expect(playBlocker({ ...p, toys: {} }, 'wand')).toMatch(/string wand/);
    expect(playBlocker({ ...p, hunger: 5 }, 'wand')).toMatch(/hungry/);
    expect(playBlocker(p, 'treats')).toBe('');
  });
});
