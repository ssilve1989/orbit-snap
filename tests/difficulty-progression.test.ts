import { describe, it, expect, beforeEach } from 'vitest';
import { DifficultyProgression } from '../src/gameplay/difficulty-progression.js';
import {
  ROUNDS_PER_LEVEL,
  RING_COUNT_TABLE,
  BASE_RING_SPEED,
  SPEED_INCREMENT,
  MAX_RING_SPEED,
  STAGGER_MS,
} from '../src/config.js';

describe('DifficultyProgression', () => {
  let dp: DifficultyProgression;

  beforeEach(() => {
    dp = new DifficultyProgression();
  });

  it('starts at level 0 with correct initial state', () => {
    const state = dp.getDifficultyState();
    expect(state.level).toBe(0);
    expect(state.ringCount).toBe(RING_COUNT_TABLE[0]);
    expect(state.ringSpeed).toBe(BASE_RING_SPEED);
    expect(state.staggerMs).toBe(STAGGER_MS);
  });

  it('advances level exactly every ROUNDS_PER_LEVEL rounds', () => {
    for (let i = 0; i < ROUNDS_PER_LEVEL; i++) {
      expect(dp.getDifficultyState().level).toBe(0);
      dp.onRoundEnd();
    }
    expect(dp.getDifficultyState().level).toBe(1);
  });

  it('ringCount matches RING_COUNT_TABLE at every level', () => {
    for (let level = 0; level < RING_COUNT_TABLE.length; level++) {
      while (Math.floor(dp.roundsPlayed / ROUNDS_PER_LEVEL) < level) {
        dp.onRoundEnd();
      }
      expect(dp.getDifficultyState().ringCount).toBe(RING_COUNT_TABLE[level]);
    }
  });

  it('ringSpeed equals BASE_RING_SPEED + level * SPEED_INCREMENT', () => {
    for (let level = 0; level < 5; level++) {
      while (Math.floor(dp.roundsPlayed / ROUNDS_PER_LEVEL) < level) {
        dp.onRoundEnd();
      }
      const expected = Math.min(
        BASE_RING_SPEED + level * SPEED_INCREMENT,
        MAX_RING_SPEED,
      );
      expect(dp.getDifficultyState().ringSpeed).toBe(expected);
    }
  });

  it('ringSpeed is capped at MAX_RING_SPEED', () => {
    if (SPEED_INCREMENT > 0) {
      const levelsToExceedCap =
        Math.ceil((MAX_RING_SPEED - BASE_RING_SPEED) / SPEED_INCREMENT) + 1;
      for (let i = 0; i < levelsToExceedCap * ROUNDS_PER_LEVEL; i++) {
        dp.onRoundEnd();
      }
      expect(dp.getDifficultyState().ringSpeed).toBeLessThanOrEqual(MAX_RING_SPEED);
    } else {
      for (let i = 0; i < 100; i++) dp.onRoundEnd();
      expect(dp.getDifficultyState().ringSpeed).toBe(BASE_RING_SPEED);
    }
  });

  it('difficulty does not advance mid-round — only on onRoundEnd()', () => {
    const levelBefore = dp.getDifficultyState().level;
    dp.getDifficultyState();
    dp.getDifficultyState();
    expect(dp.getDifficultyState().level).toBe(levelBefore);
  });

  it('table wraps seamlessly — ring count resets, speed does not', () => {
    const tableLen = RING_COUNT_TABLE.length;
    for (let i = 0; i < tableLen * ROUNDS_PER_LEVEL; i++) {
      dp.onRoundEnd();
    }
    const wrappedState = dp.getDifficultyState();
    expect(wrappedState.ringCount).toBe(RING_COUNT_TABLE[0]);
    const absoluteLevel = tableLen;
    const expectedSpeed = Math.min(
      BASE_RING_SPEED + absoluteLevel * SPEED_INCREMENT,
      MAX_RING_SPEED,
    );
    expect(wrappedState.ringSpeed).toBe(expectedSpeed);
  });

  it('auto-missed rounds still increment roundsPlayed', () => {
    dp.onRoundEnd();
    expect(dp.roundsPlayed).toBe(1);
  });

  it('reset() restores initial state', () => {
    for (let i = 0; i < ROUNDS_PER_LEVEL + 1; i++) dp.onRoundEnd();
    dp.reset();
    expect(dp.roundsPlayed).toBe(0);
    const state = dp.getDifficultyState();
    expect(state.level).toBe(0);
    expect(state.ringCount).toBe(RING_COUNT_TABLE[0]);
    expect(state.ringSpeed).toBe(BASE_RING_SPEED);
  });

  it('DifficultyState includes all required fields', () => {
    const state = dp.getDifficultyState();
    expect(state).toHaveProperty('level');
    expect(state).toHaveProperty('ringCount');
    expect(state).toHaveProperty('ringSpeed');
    expect(state).toHaveProperty('ringSpeedVariance');
    expect(state).toHaveProperty('staggerMs');
  });
});
