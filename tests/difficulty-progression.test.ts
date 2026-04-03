import { describe, it, expect, beforeEach } from 'vitest';
import { DifficultyProgression } from '../src/gameplay/difficulty-progression.js';
import {
  ROUNDS_AT_LEVEL_ZERO,
  ROUNDS_PER_LEVEL,
  RING_COUNT_TABLE,
  LOOP_MIN_RING_COUNT,
  BASE_RING_SPEED,
  SPEED_INCREMENT,
  MAX_RING_SPEED,
  STAGGER_MS,
  INTER_ROUND_MS,
  INTER_ROUND_MS_LOOP,
} from '../src/config.js';

/** Advance dp to the round count at which getDifficultyState() first returns targetLevel. */
function advanceToLevel(dp: DifficultyProgression, targetLevel: number): void {
  const rounds = targetLevel === 0
    ? 0
    : ROUNDS_AT_LEVEL_ZERO + (targetLevel - 1) * ROUNDS_PER_LEVEL;
  while (dp.roundsPlayed < rounds) dp.onRoundEnd();
}

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
    expect(state.isLooping).toBe(false);
  });

  it('level 0 lasts ROUNDS_AT_LEVEL_ZERO rounds before advancing', () => {
    for (let i = 0; i < ROUNDS_AT_LEVEL_ZERO; i++) {
      expect(dp.getDifficultyState().level).toBe(0);
      dp.onRoundEnd();
    }
    expect(dp.getDifficultyState().level).toBe(1);
  });

  it('levels 1+ advance every ROUNDS_PER_LEVEL rounds', () => {
    advanceToLevel(dp, 1);
    for (let i = 0; i < ROUNDS_PER_LEVEL; i++) {
      expect(dp.getDifficultyState().level).toBe(1);
      dp.onRoundEnd();
    }
    expect(dp.getDifficultyState().level).toBe(2);
  });

  it('ringCount matches RING_COUNT_TABLE at every level', () => {
    for (let level = 0; level < RING_COUNT_TABLE.length; level++) {
      advanceToLevel(dp, level);
      expect(dp.getDifficultyState().ringCount).toBe(RING_COUNT_TABLE[level]);
    }
  });

  it('ringSpeed equals BASE_RING_SPEED + level * SPEED_INCREMENT', () => {
    for (let level = 0; level < 5; level++) {
      advanceToLevel(dp, level);
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
      advanceToLevel(dp, levelsToExceedCap);
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

  it('isLooping is false during first pass and true after table wrap', () => {
    advanceToLevel(dp, RING_COUNT_TABLE.length - 1);
    expect(dp.getDifficultyState().isLooping).toBe(false);

    advanceToLevel(dp, RING_COUNT_TABLE.length);
    expect(dp.getDifficultyState().isLooping).toBe(true);
  });

  it('ring count is clamped to LOOP_MIN_RING_COUNT on second pass', () => {
    // Advance to the first level that would wrap back to a low ring count
    advanceToLevel(dp, RING_COUNT_TABLE.length);
    const state = dp.getDifficultyState();
    expect(state.isLooping).toBe(true);
    expect(state.ringCount).toBeGreaterThanOrEqual(LOOP_MIN_RING_COUNT);
  });

  it('speed does not reset on table wrap', () => {
    const tableLen = RING_COUNT_TABLE.length;
    advanceToLevel(dp, tableLen);
    const wrappedState = dp.getDifficultyState();
    const expectedSpeed = Math.min(
      BASE_RING_SPEED + tableLen * SPEED_INCREMENT,
      MAX_RING_SPEED,
    );
    expect(wrappedState.ringSpeed).toBe(expectedSpeed);
  });

  it('interRoundMs is INTER_ROUND_MS on first pass', () => {
    expect(dp.getDifficultyState().interRoundMs).toBe(INTER_ROUND_MS);
  });

  it('interRoundMs is INTER_ROUND_MS_LOOP on second pass', () => {
    advanceToLevel(dp, RING_COUNT_TABLE.length);
    expect(dp.getDifficultyState().interRoundMs).toBe(INTER_ROUND_MS_LOOP);
  });

  it('auto-missed rounds still increment roundsPlayed', () => {
    dp.onRoundEnd();
    expect(dp.roundsPlayed).toBe(1);
  });

  it('reset() restores initial state', () => {
    advanceToLevel(dp, 3);
    dp.reset();
    expect(dp.roundsPlayed).toBe(0);
    const state = dp.getDifficultyState();
    expect(state.level).toBe(0);
    expect(state.ringCount).toBe(RING_COUNT_TABLE[0]);
    expect(state.ringSpeed).toBe(BASE_RING_SPEED);
    expect(state.isLooping).toBe(false);
  });

  it('DifficultyState includes all required fields', () => {
    const state = dp.getDifficultyState();
    expect(state).toHaveProperty('level');
    expect(state).toHaveProperty('ringCount');
    expect(state).toHaveProperty('ringSpeed');
    expect(state).toHaveProperty('ringSpeedVariance');
    expect(state).toHaveProperty('staggerMs');
    expect(state).toHaveProperty('isLooping');
    expect(state).toHaveProperty('interRoundMs');
  });
});
