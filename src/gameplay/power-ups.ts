import {
  POWER_UP_TUNING, DRAFT_CHOICES, COMBO_STEP,
  SCATTER_PERFECT_MS, SCATTER_GOOD_MS,
  PU_STEADY_HAND_MS, PU_WIDE_LENS_MS, PU_TIME_DILATION_PCT,
  PU_OVERCHARGE_PCT, PU_MAGNET_PCT, PU_MAX_SHIELDS,
  PU_MOMENTUM_STEP_REDUCTION, PU_MOMENTUM_MIN_STEP,
} from '../config.js';

/**
 * Roguelite power-up catalog, draft offering, and derived modifiers.
 * Implements S10 Roguelite Power-Ups (design/gdd/scatter-mode.md).
 */

export type PowerUpId = keyof typeof POWER_UP_TUNING;

/** Passive power-ups stack and modify rules; instant ones apply once on pick. */
export type PowerUpKind = 'passive' | 'instant';

export interface PowerUpDef {
  readonly id: PowerUpId;
  readonly name: string;
  readonly description: string;
  readonly kind: PowerUpKind;
  readonly maxStacks: number;
  readonly weight: number;
}

/** Player-facing names and descriptions. Numbers are interpolated from config. */
const CATALOG_TEXT: Readonly<Record<PowerUpId, { name: string; description: string; kind: PowerUpKind }>> = {
  'steady-hand':   { kind: 'passive', name: 'STEADY HAND',   description: `Perfect window +${PU_STEADY_HAND_MS}ms` },
  'wide-lens':     { kind: 'passive', name: 'WIDE LENS',     description: `Good window +${PU_WIDE_LENS_MS}ms` },
  'time-dilation': { kind: 'passive', name: 'TIME DILATION', description: `Targets approach ${Math.round(PU_TIME_DILATION_PCT * 100)}% slower` },
  'overcharge':    { kind: 'passive', name: 'OVERCHARGE',    description: `+${Math.round(PU_OVERCHARGE_PCT * 100)}% score from every hit` },
  'magnet':        { kind: 'passive', name: 'MAGNET TOUCH',  description: `Target tap area +${Math.round(PU_MAGNET_PCT * 100)}%` },
  'aegis':         { kind: 'instant', name: 'AEGIS',         description: 'Gain a shield that absorbs one miss' },
  'second-wind':   { kind: 'instant', name: 'SECOND WIND',   description: 'Restore one heart' },
  'streak-guard':  { kind: 'passive', name: 'STREAK GUARD',  description: 'Each wave, one GOOD won’t break your Pinpoint streak' },
  'momentum':      { kind: 'passive', name: 'MOMENTUM',      description: `Combo tiers need ${PU_MOMENTUM_STEP_REDUCTION} fewer hits` },
  'resonance':     { kind: 'passive', name: 'RESONANCE',     description: 'Pinpoint milestones grant a shield' },
};

/** Full catalog, merged from presentation text and config tuning. */
export const POWER_UPS: readonly PowerUpDef[] = (Object.keys(POWER_UP_TUNING) as PowerUpId[]).map(id => ({
  id,
  ...CATALOG_TEXT[id],
  maxStacks: POWER_UP_TUNING[id].maxStacks,
  weight: POWER_UP_TUNING[id].weight,
}));

/** Lookup a catalog entry by id. */
export function getPowerUp(id: PowerUpId): PowerUpDef {
  const def = POWER_UPS.find(p => p.id === id);
  if (def === undefined) throw new Error(`Unknown power-up: ${id}`);
  return def;
}

/** Run state needed to decide which power-ups may be offered. */
export interface DraftContext {
  readonly stacks: ReadonlyMap<PowerUpId, number>;
  readonly shields: number;
  readonly missesTaken: number;
}

/** Rule modifiers derived from the current loadout. */
export interface Modifiers {
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly approachMult: number;
  readonly scoreMult: number;
  readonly hitRadiusMult: number;
  readonly comboStep: number;
  readonly streakGuardsPerWave: number;
  readonly shieldOnMilestone: boolean;
}

/** Whether a power-up can currently appear in a draft. */
export function isEligible(def: PowerUpDef, ctx: DraftContext): boolean {
  if ((ctx.stacks.get(def.id) ?? 0) >= def.maxStacks) return false;
  if (def.id === 'aegis') return ctx.shields < PU_MAX_SHIELDS;
  if (def.id === 'second-wind') return ctx.missesTaken > 0;
  if (def.id === 'momentum') {
    return computeModifiers(ctx.stacks).comboStep > PU_MOMENTUM_MIN_STEP;
  }
  return true;
}

/**
 * Pick up to `count` distinct eligible power-ups, weighted by draft weight.
 * @param rng Uniform [0,1) source — inject a seeded function for tests.
 */
export function draftOffer(
  ctx: DraftContext,
  rng: () => number,
  count: number = DRAFT_CHOICES,
): PowerUpDef[] {
  const pool = POWER_UPS.filter(def => isEligible(def, ctx));
  const picks: PowerUpDef[] = [];

  while (picks.length < count && pool.length > 0) {
    const total = pool.reduce((sum, def) => sum + def.weight, 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.weight;
      if (roll < 0) { index = i; break; }
    }
    picks.push(pool[index]!);
    pool.splice(index, 1);
  }

  return picks;
}

/** Derive gameplay modifiers from stack counts. Pure — safe to call every frame. */
export function computeModifiers(stacks: ReadonlyMap<PowerUpId, number>): Modifiers {
  const n = (id: PowerUpId): number => stacks.get(id) ?? 0;
  const perfectMs = SCATTER_PERFECT_MS + n('steady-hand') * PU_STEADY_HAND_MS;
  // Good window always stays strictly wider than Perfect
  const goodMs = Math.max(SCATTER_GOOD_MS + n('wide-lens') * PU_WIDE_LENS_MS, perfectMs + 1);
  return {
    perfectMs,
    goodMs,
    approachMult: 1 + n('time-dilation') * PU_TIME_DILATION_PCT,
    scoreMult: 1 + n('overcharge') * PU_OVERCHARGE_PCT,
    hitRadiusMult: 1 + n('magnet') * PU_MAGNET_PCT,
    comboStep: Math.max(COMBO_STEP - n('momentum') * PU_MOMENTUM_STEP_REDUCTION, PU_MOMENTUM_MIN_STEP),
    streakGuardsPerWave: n('streak-guard'),
    shieldOnMilestone: n('resonance') > 0,
  };
}
