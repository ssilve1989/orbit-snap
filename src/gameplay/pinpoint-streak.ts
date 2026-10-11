import {
  PINPOINT_STEP, PINPOINT_BONUS_PER_TIER,
  PINPOINT_MILESTONE_BONUS, PINPOINT_MAX_TIER,
} from '../config.js';
import type { Grade } from './ring-tap.js';

/** Result of feeding one grade into the streak tracker. */
export interface PinpointResult {
  /** Streak length after this grade was applied. */
  readonly streak: number;
  /** Streak tier after this grade (floor(streak / PINPOINT_STEP), capped). */
  readonly tier: number;
  /** Per-hit bonus points earned by this grade (before score multipliers). */
  readonly hitBonus: number;
  /** One-off milestone bonus if this grade crossed into a new tier, else 0. */
  readonly milestoneBonus: number;
  /** True when this grade crossed a PINPOINT_STEP boundary. */
  readonly isMilestone: boolean;
  /** True when a non-Perfect grade was forgiven by a streak guard charge. */
  readonly guarded: boolean;
  /** True when this grade reset an active streak to zero. */
  readonly broken: boolean;
}

/**
 * Tracks consecutive Perfect grades and computes pinpoint-accuracy bonuses.
 * Implements S9 Pinpoint Streak (design/gdd/scatter-mode.md).
 *
 * Rules:
 *   - PERFECT increments the streak.
 *   - GOOD resets the streak unless a guard charge is available (consumes one).
 *   - MISS always resets the streak (guards do not apply).
 *   - Every Perfect at tier t earns PINPOINT_BONUS_PER_TIER × t.
 *   - Reaching a new tier boundary earns PINPOINT_MILESTONE_BONUS × t once.
 */
export class PinpointStreak {
  #streak = 0;
  #best = 0;
  #guards = 0;

  /** Apply a resolved grade and return the bonus breakdown. */
  apply(grade: Grade): PinpointResult {
    if (grade === 'PERFECT') {
      this.#streak++;
      this.#best = Math.max(this.#best, this.#streak);
      const tier = PinpointStreak.tierFor(this.#streak);
      // Milestones fire on each tier boundary up to and including the max tier
      const isMilestone = this.#streak % PINPOINT_STEP === 0
        && this.#streak / PINPOINT_STEP <= PINPOINT_MAX_TIER;
      return {
        streak: this.#streak,
        tier,
        hitBonus: PINPOINT_BONUS_PER_TIER * tier,
        milestoneBonus: isMilestone ? PINPOINT_MILESTONE_BONUS * tier : 0,
        isMilestone,
        guarded: false,
        broken: false,
      };
    }

    if (grade === 'GOOD' && this.#guards > 0 && this.#streak > 0) {
      this.#guards--;
      return this.#neutral(true, false);
    }

    const broken = this.#streak > 0;
    this.#streak = 0;
    return this.#neutral(false, broken);
  }

  /** Set the number of streak-guard charges available (refilled each wave). */
  setGuards(count: number): void {
    this.#guards = Math.max(0, count);
  }

  /** Reset all state for a new run. */
  reset(): void {
    this.#streak = 0;
    this.#best = 0;
    this.#guards = 0;
  }

  /** Current consecutive Perfect count. */
  get streak(): number { return this.#streak; }

  /** Longest streak this run. */
  get best(): number { return this.#best; }

  /** Remaining streak-guard charges. */
  get guards(): number { return this.#guards; }

  /** Current tier derived from the live streak. */
  get tier(): number { return PinpointStreak.tierFor(this.#streak); }

  /**
   * Tier formula: min(floor(streak / PINPOINT_STEP), PINPOINT_MAX_TIER).
   * Exposed as static for formula unit tests.
   */
  static tierFor(streak: number): number {
    return Math.min(Math.floor(streak / PINPOINT_STEP), PINPOINT_MAX_TIER);
  }

  #neutral(guarded: boolean, broken: boolean): PinpointResult {
    return {
      streak: this.#streak,
      tier: this.tier,
      hitBonus: 0,
      milestoneBonus: 0,
      isMilestone: false,
      guarded,
      broken,
    };
  }
}
