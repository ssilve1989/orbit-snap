import {
  ROUNDS_PER_LEVEL,
  RING_COUNT_TABLE,
  BASE_RING_SPEED,
  SPEED_INCREMENT,
  MAX_RING_SPEED,
  STAGGER_MS,
  RING_SPEED_VARIANCE,
} from '../config.js';

export interface DifficultyState {
  readonly level: number;
  readonly ringCount: number;
  readonly ringSpeed: number;
  /** ±px/s applied randomly per ring at spawn. 0 means no variance. */
  readonly ringSpeedVariance: number;
  readonly staggerMs: number;
}

/**
 * Tracks rounds played and derives difficulty parameters for each round.
 * Implements S3 Difficulty Progression GDD.
 */
export class DifficultyProgression {
  #roundsPlayed = 0;

  /**
   * Returns the DifficultyState for the current round.
   * Call at round start, before rings spawn.
   */
  getDifficultyState(): DifficultyState {
    const level = Math.floor(this.#roundsPlayed / ROUNDS_PER_LEVEL);
    const ringCount = RING_COUNT_TABLE[level % RING_COUNT_TABLE.length] ?? 1;
    const ringSpeed = Math.min(
      BASE_RING_SPEED + level * SPEED_INCREMENT,
      MAX_RING_SPEED,
    );
    return { level, ringCount, ringSpeed, ringSpeedVariance: RING_SPEED_VARIANCE, staggerMs: STAGGER_MS };
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
