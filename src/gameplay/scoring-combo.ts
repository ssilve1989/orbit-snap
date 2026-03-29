import {
  PERFECT_BASE, GOOD_BASE,
  COMBO_STEP, MULTIPLIER_TABLE,
} from '../config.js';
import type { Grade } from './ring-tap.js';

/**
 * Tracks score, combo, and max combo for a session.
 * Implements S2 Scoring & Combo GDD.
 *
 * Receives RingResolved events from RingTap and exposes read-only state to HUD.
 */
export class ScoringCombo {
  #score = 0;
  #combo = 0;
  #maxCombo = 0;
  #missCount = 0;

  /** Process a resolved ring event. Multiplier is sampled before combo increments. */
  onRingResolved({ grade }: { grade: Grade }): void {
    if (grade === 'PERFECT') {
      const mult = this.multiplier;
      this.#combo++;
      this.#score += PERFECT_BASE * mult;
      this.#maxCombo = Math.max(this.#maxCombo, this.#combo);
    } else if (grade === 'GOOD') {
      const mult = this.multiplier;
      this.#combo++;
      this.#score += GOOD_BASE * mult;
      this.#maxCombo = Math.max(this.#maxCombo, this.#combo);
    } else {
      // grade === 'MISS': combo breaks, score unchanged
      this.#combo = 0;
      this.#missCount++;
    }
  }

  /** Reset all state for a new session. */
  reset(): void {
    this.#score = 0;
    this.#combo = 0;
    this.#maxCombo = 0;
    this.#missCount = 0;
  }

  /** Cumulative score — never decreases. */
  get score(): number { return this.#score; }

  /** Current consecutive hit streak — resets to 0 on Miss. */
  get combo(): number { return this.#combo; }

  /** Highest combo count reached this session — never decreases. */
  get maxCombo(): number { return this.#maxCombo; }

  /** Total misses this session — each auto-miss or bad tap increments this. */
  get missCount(): number { return this.#missCount; }

  /**
   * Current combo multiplier derived from the stepped table.
   * Index = floor(combo / COMBO_STEP), capped at the last table entry.
   * Evaluated with the current combo value (before any pending increment).
   */
  get multiplier(): number {
    const index = Math.min(
      Math.floor(this.#combo / COMBO_STEP),
      MULTIPLIER_TABLE.length - 1,
    );
    return MULTIPLIER_TABLE[index] ?? 1;
  }
}
