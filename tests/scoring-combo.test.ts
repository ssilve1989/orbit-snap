import { describe, it, expect, beforeEach } from 'vitest';
import { ScoringCombo } from '../src/gameplay/scoring-combo.js';
import {
  PERFECT_BASE, GOOD_BASE,
  COMBO_STEP, MULTIPLIER_TABLE, MULTIPLIER_CAP,
} from '../src/config.js';

describe('ScoringCombo — basic scoring', () => {
  let sc: ScoringCombo;

  beforeEach(() => { sc = new ScoringCombo(); });

  it('Perfect awards PERFECT_BASE × multiplier', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.score).toBe(PERFECT_BASE * 1);
  });

  it('Good awards GOOD_BASE × multiplier', () => {
    sc.onRingResolved({ grade: 'GOOD' });
    expect(sc.score).toBe(GOOD_BASE * 1);
  });

  it('Miss awards 0 points', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    const scoreBefore = sc.score;
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.score).toBe(scoreBefore);
  });

  it('score never decreases', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    sc.onRingResolved({ grade: 'MISS' });
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.score).toBeGreaterThan(0);
  });
});

describe('ScoringCombo — combo', () => {
  let sc: ScoringCombo;

  beforeEach(() => { sc = new ScoringCombo(); });

  it('combo increments on Perfect', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.combo).toBe(1);
  });

  it('combo increments on Good', () => {
    sc.onRingResolved({ grade: 'GOOD' });
    expect(sc.combo).toBe(1);
  });

  it('combo resets to 0 on Miss', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    sc.onRingResolved({ grade: 'PERFECT' });
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.combo).toBe(0);
  });

  it('combo stays 0 when Miss is the first hit', () => {
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.combo).toBe(0);
  });

  it('combo climbs again after a Miss', () => {
    sc.onRingResolved({ grade: 'MISS' });
    sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.combo).toBe(1);
  });
});

describe('ScoringCombo — maxCombo', () => {
  let sc: ScoringCombo;

  beforeEach(() => { sc = new ScoringCombo(); });

  it('maxCombo never decreases within a session', () => {
    for (let i = 0; i < 5; i++) sc.onRingResolved({ grade: 'PERFECT' });
    const peak = sc.maxCombo;
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.maxCombo).toBe(peak);
  });

  it('maxCombo tracks the highest combo reached', () => {
    for (let i = 0; i < 7; i++) sc.onRingResolved({ grade: 'PERFECT' });
    sc.onRingResolved({ grade: 'MISS' });
    for (let i = 0; i < 3; i++) sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.maxCombo).toBe(7);
  });
});

describe('ScoringCombo — multiplier table', () => {
  let sc: ScoringCombo;

  beforeEach(() => { sc = new ScoringCombo(); });

  it('multiplier matches MULTIPLIER_TABLE at every tier boundary', () => {
    MULTIPLIER_TABLE.forEach((expectedMult, index) => {
      const sc2 = new ScoringCombo();
      const hitsToReach = index * COMBO_STEP;
      for (let i = 0; i < hitsToReach; i++) sc2.onRingResolved({ grade: 'PERFECT' });
      expect(sc2.multiplier).toBe(expectedMult);
    });
  });

  it('multiplier caps at MULTIPLIER_CAP', () => {
    for (let i = 0; i < 1000; i++) sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.multiplier).toBe(MULTIPLIER_CAP);
  });

  it('multiplier returns to 1× after a Miss', () => {
    for (let i = 0; i < COMBO_STEP; i++) sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.multiplier).toBeGreaterThan(1);
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.multiplier).toBe(1);
  });

  it('multiplier is sampled before combo increments (GDD: 5×1 + 5×2 = 1500)', () => {
    // First hit: combo=0, mult=1, then combo→1
    sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.score).toBe(PERFECT_BASE * 1);
  });
});

describe('ScoringCombo — 20-round session', () => {
  it('score and maxCombo are correct across 20 Perfects', () => {
    const sc = new ScoringCombo();
    let expectedScore = 0;

    for (let i = 0; i < 20; i++) {
      // multiplier uses pre-increment combo (i = current combo before this hit)
      const mult = MULTIPLIER_TABLE[Math.min(
        Math.floor(i / COMBO_STEP),
        MULTIPLIER_TABLE.length - 1,
      )] ?? 1;
      expectedScore += PERFECT_BASE * mult;
      sc.onRingResolved({ grade: 'PERFECT' });
    }

    expect(sc.score).toBe(expectedScore);
    expect(sc.combo).toBe(20);
    expect(sc.maxCombo).toBe(20);
  });

  it('GDD example: 10-hit Perfect streak = 1500pts (5×100×1 + 5×100×2)', () => {
    const sc = new ScoringCombo();
    for (let i = 0; i < 10; i++) sc.onRingResolved({ grade: 'PERFECT' });
    expect(sc.score).toBe(1500);
  });

  it('all-Perfects run always outscores all-Goods run at same combo', () => {
    const perfects = new ScoringCombo();
    const goods = new ScoringCombo();
    for (let i = 0; i < 20; i++) {
      perfects.onRingResolved({ grade: 'PERFECT' });
      goods.onRingResolved({ grade: 'GOOD' });
    }
    expect(perfects.score).toBeGreaterThan(goods.score);
  });
});

describe('ScoringCombo — miss count', () => {
  let sc: ScoringCombo;
  beforeEach(() => { sc = new ScoringCombo(); });

  it('missCount starts at 0', () => {
    expect(sc.missCount).toBe(0);
  });

  it('missCount increments on each Miss', () => {
    sc.onRingResolved({ grade: 'MISS' });
    sc.onRingResolved({ grade: 'MISS' });
    expect(sc.missCount).toBe(2);
  });

  it('Perfect and Good do not increment missCount', () => {
    sc.onRingResolved({ grade: 'PERFECT' });
    sc.onRingResolved({ grade: 'GOOD' });
    expect(sc.missCount).toBe(0);
  });

  it('reset() clears missCount', () => {
    sc.onRingResolved({ grade: 'MISS' });
    sc.reset();
    expect(sc.missCount).toBe(0);
  });
});

describe('ScoringCombo — reset', () => {
  it('reset() clears score, combo, and maxCombo', () => {
    const sc = new ScoringCombo();
    for (let i = 0; i < 10; i++) sc.onRingResolved({ grade: 'PERFECT' });
    sc.reset();
    expect(sc.score).toBe(0);
    expect(sc.combo).toBe(0);
    expect(sc.maxCombo).toBe(0);
    expect(sc.multiplier).toBe(1);
  });
});
