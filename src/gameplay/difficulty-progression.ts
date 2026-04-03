import {
  ROUNDS_AT_LEVEL_ZERO,
  ROUNDS_PER_LEVEL,
  RING_COUNT_TABLE,
  LOOP_MIN_RING_COUNT,
  BASE_RING_SPEED,
  SPEED_INCREMENT,
  MAX_RING_SPEED,
  STAGGER_MS,
  RING_SPEED_VARIANCE,
  INTER_ROUND_MS,
  INTER_ROUND_MS_LOOP,
} from '../config.js';

export interface DifficultyState {
  readonly level: number;
  readonly ringCount: number;
  readonly ringSpeed: number;
  /** ±px/s applied randomly per ring at spawn. 0 means no variance. */
  readonly ringSpeedVariance: number;
  readonly staggerMs: number;
  /** True once diffLevel has wrapped past the end of RING_COUNT_TABLE. */
  readonly isLooping: boolean;
  /** Inter-round pause duration for the upcoming round (ms). */
  readonly interRoundMs: number;
}

/**
 * Tracks rounds played and derives difficulty parameters for each round.
 * Implements S3 Difficulty Progression GDD.
 *
 * Level formula:
 *   - Level 0 lasts ROUNDS_AT_LEVEL_ZERO rounds.
 *   - Each subsequent level lasts ROUNDS_PER_LEVEL rounds.
 *   - On wrap (level >= table length), ring count is floored at LOOP_MIN_RING_COUNT
 *     and inter-round pause tightens to INTER_ROUND_MS_LOOP.
 */
export class DifficultyProgression {
  #roundsPlayed = 0;

  /**
   * Returns the DifficultyState for the current round.
   * Call at round start, before rings spawn.
   */
  getDifficultyState(): DifficultyState {
    const level = this.#roundsPlayed < ROUNDS_AT_LEVEL_ZERO
      ? 0
      : 1 + Math.floor((this.#roundsPlayed - ROUNDS_AT_LEVEL_ZERO) / ROUNDS_PER_LEVEL);

    const isLooping = level >= RING_COUNT_TABLE.length;
    const tableIndex = level % RING_COUNT_TABLE.length;
    const rawRingCount = RING_COUNT_TABLE[tableIndex] ?? 1;
    const ringCount = isLooping ? Math.max(rawRingCount, LOOP_MIN_RING_COUNT) : rawRingCount;
    const ringSpeed = Math.min(
      BASE_RING_SPEED + level * SPEED_INCREMENT,
      MAX_RING_SPEED,
    );
    const interRoundMs = isLooping ? INTER_ROUND_MS_LOOP : INTER_ROUND_MS;

    return { level, ringCount, ringSpeed, ringSpeedVariance: RING_SPEED_VARIANCE, staggerMs: STAGGER_MS, isLooping, interRoundMs };
  }

  /**
   * Advances the round counter. Call when all rings in a round are resolved,
   * regardless of player performance.
   */
  onRoundEnd(): void {
    this.#roundsPlayed++;
  }

  /** Resets all state for a new session. */
  reset(): void {
    this.#roundsPlayed = 0;
  }

  /** Total rounds played this session. */
  get roundsPlayed(): number {
    return this.#roundsPlayed;
  }
}
