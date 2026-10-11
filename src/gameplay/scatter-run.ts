import {
  PERFECT_BASE, GOOD_BASE, MULTIPLIER_TABLE, MAX_MISSES, PU_MAX_SHIELDS,
} from '../config.js';
import type { Grade } from './ring-tap.js';
import { PinpointStreak } from './pinpoint-streak.js';
import type { PinpointResult } from './pinpoint-streak.js';
import { computeModifiers, draftOffer, getPowerUp } from './power-ups.js';
import type { Modifiers, PowerUpDef, PowerUpId } from './power-ups.js';
import { getWaveParams } from './wave-progression.js';
import type { WaveParams } from './wave-progression.js';
import type { TimingRules } from './target-field.js';

/** Everything the presentation layer needs to react to one resolved target. */
export interface HitOutcome {
  readonly grade: Grade;
  /** Points awarded for this hit, including pinpoint bonuses and multipliers. */
  readonly points: number;
  /** Portion of `points` that came from a pinpoint milestone. */
  readonly milestonePoints: number;
  readonly pinpoint: PinpointResult;
  /** True when a shield absorbed this miss (no heart lost, combo kept). */
  readonly shieldUsed: boolean;
  /** True when Resonance granted a shield on this hit. */
  readonly shieldGained: boolean;
  /** True when this outcome ended the run. */
  readonly gameOver: boolean;
}

/**
 * Run-level state for Scatter mode: score, combo, hearts, shields, wave counter,
 * pinpoint streak, and the roguelite power-up loadout.
 * Implements S7–S10 (design/gdd/scatter-mode.md). Presentation-free and RNG-injectable.
 *
 * Run lifecycle:
 *   reset() → beginWave() → [resolve()…] → completeWave() → offerDraft()/pick() → beginWave() …
 *   resolve() returning gameOver=true ends the run.
 */
export class ScatterRun {
  readonly #rng: () => number;
  readonly #streak = new PinpointStreak();
  #stacks = new Map<PowerUpId, number>();
  #score = 0;
  #combo = 0;
  #maxCombo = 0;
  #misses = 0;
  #shields = 0;
  #wave = 0;
  #perfects = 0;
  #goods = 0;

  /** @param rng Uniform [0,1) source used for drafts — inject for tests. */
  constructor(rng: () => number = Math.random) {
    this.#rng = rng;
  }

  /** Reset all run state. */
  reset(): void {
    this.#streak.reset();
    this.#stacks = new Map();
    this.#score = 0;
    this.#combo = 0;
    this.#maxCombo = 0;
    this.#misses = 0;
    this.#shields = 0;
    this.#wave = 0;
    this.#perfects = 0;
    this.#goods = 0;
  }

  /** Prepare the current wave: refills streak guards and returns spawn params. */
  beginWave(): WaveParams {
    this.#streak.setGuards(this.modifiers.streakGuardsPerWave);
    return getWaveParams(this.#wave);
  }

  /** Advance the wave counter after a wave clears. */
  completeWave(): void {
    this.#wave++;
  }

  /**
   * Apply one resolved target.
   *
   * Score formula (per hit):
   *   points = round((base × comboMult + pinpointHitBonus) × scoreMult)
   *          + round(pinpointMilestoneBonus × scoreMult)
   * comboMult is sampled before the combo increments (matches S2).
   */
  resolve(grade: Grade): HitOutcome {
    const mods = this.modifiers;
    const pinpoint = this.#streak.apply(grade);

    if (grade === 'MISS') {
      const shieldUsed = this.#shields > 0;
      if (shieldUsed) {
        this.#shields--;
      } else {
        this.#combo = 0;
        this.#misses++;
      }
      return {
        grade, points: 0, milestonePoints: 0, pinpoint,
        shieldUsed, shieldGained: false, gameOver: this.isOver,
      };
    }

    const base = grade === 'PERFECT' ? PERFECT_BASE : GOOD_BASE;
    const comboMult = ScatterRun.comboMultiplier(this.#combo, mods.comboStep);
    const hitPoints = Math.round((base * comboMult + pinpoint.hitBonus) * mods.scoreMult);
    const milestonePoints = Math.round(pinpoint.milestoneBonus * mods.scoreMult);

    this.#combo++;
    this.#maxCombo = Math.max(this.#maxCombo, this.#combo);
    this.#score += hitPoints + milestonePoints;
    if (grade === 'PERFECT') this.#perfects++;
    else this.#goods++;

    let shieldGained = false;
    if (pinpoint.isMilestone && mods.shieldOnMilestone && this.#shields < PU_MAX_SHIELDS) {
      this.#shields++;
      shieldGained = true;
    }

    return {
      grade, points: hitPoints + milestonePoints, milestonePoints, pinpoint,
      shieldUsed: false, shieldGained, gameOver: false,
    };
  }

  /** Roll a between-wave draft. May return fewer than DRAFT_CHOICES (or none). */
  offerDraft(): PowerUpDef[] {
    return draftOffer(
      { stacks: this.#stacks, shields: this.#shields, missesTaken: this.#misses },
      this.#rng,
    );
  }

  /** Apply a drafted power-up. */
  pick(id: PowerUpId): void {
    const def = getPowerUp(id);
    this.#stacks.set(id, (this.#stacks.get(id) ?? 0) + 1);
    if (def.id === 'aegis') this.#shields = Math.min(this.#shields + 1, PU_MAX_SHIELDS);
    if (def.id === 'second-wind') this.#misses = Math.max(0, this.#misses - 1);
  }

  /** Rule modifiers for the current loadout. */
  get modifiers(): Modifiers { return computeModifiers(this.#stacks); }

  /** Timing rules to feed into TargetField. */
  get timingRules(): TimingRules {
    const m = this.modifiers;
    return {
      perfectMs: m.perfectMs,
      goodMs: m.goodMs,
      approachMult: m.approachMult,
      hitRadiusMult: m.hitRadiusMult,
    };
  }

  get score(): number { return this.#score; }
  get combo(): number { return this.#combo; }
  get maxCombo(): number { return this.#maxCombo; }
  get multiplier(): number { return ScatterRun.comboMultiplier(this.#combo, this.modifiers.comboStep); }
  get heartsRemaining(): number { return Math.max(0, MAX_MISSES - this.#misses); }
  get shields(): number { return this.#shields; }
  /** Zero-based index of the current wave. */
  get wave(): number { return this.#wave; }
  get streak(): number { return this.#streak.streak; }
  get bestStreak(): number { return this.#streak.best; }
  get streakTier(): number { return this.#streak.tier; }
  get streakGuards(): number { return this.#streak.guards; }
  /** Fraction of hits graded Perfect (0 when nothing hit yet). */
  get accuracy(): number {
    const hits = this.#perfects + this.#goods;
    return hits === 0 ? 0 : this.#perfects / hits;
  }
  get isOver(): boolean { return this.#misses >= MAX_MISSES; }
  /** Stack count per drafted power-up, in the order first picked. */
  get loadout(): ReadonlyMap<PowerUpId, number> { return this.#stacks; }

  /**
   * Stepped combo multiplier: MULTIPLIER_TABLE[min(floor(combo / step), last)].
   * Same table as S2, with a step that Momentum can shorten.
   */
  static comboMultiplier(combo: number, step: number): number {
    const index = Math.min(Math.floor(combo / step), MULTIPLIER_TABLE.length - 1);
    return MULTIPLIER_TABLE[index] ?? 1;
  }
}
