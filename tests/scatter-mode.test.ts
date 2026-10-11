import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERFECT_BASE, GOOD_BASE, MAX_MISSES, COMBO_STEP,
  TARGET_RADIUS, TARGET_HIT_RADIUS_MULT,
  SCATTER_PERFECT_MS, SCATTER_GOOD_MS, SCATTER_AUTO_MISS_MS,
  WAVE_BASE_TARGETS, WAVE_MAX_TARGETS, WAVE_MIN_APPROACH_MS, WAVE_MIN_SPAWN_INTERVAL_MS,
  WAVE_BASE_APPROACH_MS,
  PINPOINT_STEP, PINPOINT_BONUS_PER_TIER, PINPOINT_MILESTONE_BONUS, PINPOINT_MAX_TIER,
  PU_STEADY_HAND_MS, PU_MAX_SHIELDS, PU_OVERCHARGE_PCT, PU_MOMENTUM_MIN_STEP,
  DRAFT_CHOICES,
} from '../src/config.js';
import { PinpointStreak } from '../src/gameplay/pinpoint-streak.js';
import { TargetField } from '../src/gameplay/target-field.js';
import type { TargetResolvedEvent, TimingRules } from '../src/gameplay/target-field.js';
import { getWaveParams } from '../src/gameplay/wave-progression.js';
import type { WaveParams } from '../src/gameplay/wave-progression.js';
import { computeModifiers, draftOffer, isEligible, getPowerUp, POWER_UPS } from '../src/gameplay/power-ups.js';
import type { PowerUpId } from '../src/gameplay/power-ups.js';
import { ScatterRun } from '../src/gameplay/scatter-run.js';

/** Deterministic LCG in [0,1). */
function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const BASE_RULES: TimingRules = {
  perfectMs: SCATTER_PERFECT_MS,
  goodMs: SCATTER_GOOD_MS,
  approachMult: 1,
  hitRadiusMult: 1,
};

const BOUNDS = { width: 800, height: 900 };

function wave(overrides: Partial<WaveParams> = {}): WaveParams {
  return {
    wave: 0, targetCount: 1, approachMs: 1000, spawnIntervalMs: 500,
    spawnJitter: 0, leadInMs: 0, ...overrides,
  };
}

/** Advance a field in fixed 1ms-resolution steps of `stepMs`. */
function advance(field: TargetField, ms: number, stepMs = 10): void {
  for (let t = 0; t < ms; t += stepMs) field.update(stepMs / 1000);
}

// ─── Wave progression ────────────────────────────────────────────────────────

describe('wave_progression', () => {
  it('test_wave_progression_wave0_uses_base_values', () => {
    const p = getWaveParams(0);
    expect(p.targetCount).toBe(WAVE_BASE_TARGETS);
    expect(p.approachMs).toBe(WAVE_BASE_APPROACH_MS);
  });

  it('test_wave_progression_late_waves_clamped_to_floors_and_caps', () => {
    const p = getWaveParams(500);
    expect(p.targetCount).toBe(WAVE_MAX_TARGETS);
    expect(p.approachMs).toBe(WAVE_MIN_APPROACH_MS);
    expect(p.spawnIntervalMs).toBe(WAVE_MIN_SPAWN_INTERVAL_MS);
  });

  it('test_wave_progression_difficulty_monotonic', () => {
    for (let w = 0; w < 30; w++) {
      const a = getWaveParams(w), b = getWaveParams(w + 1);
      expect(b.targetCount).toBeGreaterThanOrEqual(a.targetCount);
      expect(b.approachMs).toBeLessThanOrEqual(a.approachMs);
      expect(b.spawnIntervalMs).toBeLessThanOrEqual(a.spawnIntervalMs);
    }
  });

  it('test_wave_progression_negative_wave_treated_as_zero', () => {
    expect(getWaveParams(-3)).toEqual(getWaveParams(0));
  });
});

// ─── Target field ────────────────────────────────────────────────────────────

describe('target_field', () => {
  let field: TargetField;
  let events: TargetResolvedEvent[];
  let waveEnds: number;

  beforeEach(() => {
    field = new TargetField(BOUNDS, BASE_RULES, seeded(7));
    events = [];
    waveEnds = 0;
    field.onTargetResolved(e => events.push(e));
    field.onWaveEnd(() => waveEnds++);
  });

  it('test_target_field_grade_formula_boundaries', () => {
    expect(TargetField.gradeFor(0, BASE_RULES)).toBe('PERFECT');
    expect(TargetField.gradeFor(SCATTER_PERFECT_MS, BASE_RULES)).toBe('PERFECT');
    expect(TargetField.gradeFor(-SCATTER_PERFECT_MS - 1, BASE_RULES)).toBe('GOOD');
    expect(TargetField.gradeFor(SCATTER_GOOD_MS, BASE_RULES)).toBe('GOOD');
    expect(TargetField.gradeFor(SCATTER_GOOD_MS + 1, BASE_RULES)).toBe('MISS');
  });

  it('test_target_field_spawns_staggered_by_interval', () => {
    field.startWave(wave({ targetCount: 3, spawnIntervalMs: 400 }));
    field.update(0.001);
    expect(field.targets.length).toBe(1);
    advance(field, 400);
    expect(field.targets.length).toBe(2);
    advance(field, 400);
    expect(field.targets.length).toBe(3);
    expect(field.remainingToSpawn).toBe(0);
  });

  it('test_target_field_lead_in_delays_first_spawn', () => {
    field.startWave(wave({ leadInMs: 500 }));
    advance(field, 400);
    expect(field.targets.length).toBe(0);
    advance(field, 200);
    expect(field.targets.length).toBe(1);
  });

  it('test_target_field_targets_stay_inside_playfield_margins', () => {
    field.startWave(wave({ targetCount: 20, spawnIntervalMs: 10, approachMs: 5000 }));
    advance(field, 300);
    expect(field.targets.length).toBe(20);
    for (const t of field.targets) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(BOUNDS.width);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(BOUNDS.height);
    }
  });

  it('test_target_field_tap_at_hit_moment_is_perfect', () => {
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    advance(field, 1000);
    const t = field.targets[0]!;
    const e = field.tap(t.x, t.y);
    expect(e?.grade).toBe('PERFECT');
    expect(field.targets.length).toBe(0);
  });

  it('test_target_field_tap_slightly_early_is_good_with_positive_offset', () => {
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    advance(field, 1000 - (SCATTER_PERFECT_MS + 30));
    const t = field.targets[0]!;
    const e = field.tap(t.x, t.y);
    expect(e?.grade).toBe('GOOD');
    expect(e!.offsetMs).toBeGreaterThan(0);
  });

  it('test_target_field_tap_far_too_early_is_miss', () => {
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    const t = field.targets[0]!;
    expect(field.tap(t.x, t.y)?.grade).toBe('MISS');
  });

  it('test_target_field_tap_outside_hit_radius_is_ignored', () => {
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    advance(field, 1000);
    const t = field.targets[0]!;
    const r = TARGET_RADIUS * TARGET_HIT_RADIUS_MULT;
    expect(field.tap(t.x + r + 1, t.y)).toBeNull();
    expect(field.targets.length).toBe(1);
    expect(field.tap(t.x + r - 1, t.y)?.grade).toBe('PERFECT');
  });

  it('test_target_field_overlapping_tap_picks_target_nearest_hit_moment', () => {
    // Zero-size bounds forces both targets onto the same spot
    const f = new TargetField({ width: 0, height: 0 }, BASE_RULES, seeded(3));
    f.startWave(wave({ targetCount: 2, spawnIntervalMs: 300, approachMs: 1000 }));
    f.update(0);
    advance(f, 1000);
    const [first, second] = f.targets;
    expect(first!.x).toBe(second!.x);
    const e = f.tap(first!.x, first!.y);
    expect(e?.targetId).toBe(first!.id);
    expect(e?.grade).toBe('PERFECT');
  });

  it('test_target_field_unhit_target_auto_misses_after_grace', () => {
    field.startWave(wave({ approachMs: 500 }));
    field.update(0);
    advance(field, 500 + SCATTER_GOOD_MS + SCATTER_AUTO_MISS_MS + 20);
    expect(events.length).toBe(1);
    expect(events[0]!.grade).toBe('MISS');
    expect(events[0]!.auto).toBe(true);
  });

  it('test_target_field_wave_end_fires_once_after_all_resolved', () => {
    field.startWave(wave({ targetCount: 2, approachMs: 300, spawnIntervalMs: 100 }));
    advance(field, 2000);
    expect(events.length).toBe(2);
    expect(waveEnds).toBe(1);
    expect(field.state).toBe('IDLE');
  });

  it('test_target_field_tap_most_urgent_ignores_position', () => {
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    advance(field, 1000);
    expect(field.tapMostUrgent()?.grade).toBe('PERFECT');
  });

  it('test_target_field_taps_ignored_when_idle', () => {
    expect(field.tap(100, 100)).toBeNull();
    expect(field.tapMostUrgent()).toBeNull();
  });

  it('test_target_field_approach_mult_extends_approach', () => {
    field.setRules({ ...BASE_RULES, approachMult: 1.5 });
    field.startWave(wave({ approachMs: 1000 }));
    field.update(0);
    expect(field.targets[0]!.approachMs).toBe(1500);
  });

  it('test_target_field_long_frame_catches_up_spawns', () => {
    field.startWave(wave({ targetCount: 4, spawnIntervalMs: 100, approachMs: 5000 }));
    field.update(0.35);
    expect(field.targets.length).toBe(4);
    // Later spawns already have their overshoot subtracted
    const times = field.targets.map(t => t.timeToHit);
    expect(times[0]).toBeLessThan(times[3]!);
  });
});

// ─── Pinpoint streak ─────────────────────────────────────────────────────────

describe('pinpoint_streak', () => {
  let s: PinpointStreak;
  beforeEach(() => { s = new PinpointStreak(); });

  it('test_pinpoint_streak_no_bonus_below_first_tier', () => {
    for (let i = 1; i < PINPOINT_STEP; i++) {
      const r = s.apply('PERFECT');
      expect(r.hitBonus).toBe(0);
      expect(r.isMilestone).toBe(false);
    }
  });

  it('test_pinpoint_streak_milestone_at_each_step', () => {
    let r = s.apply('PERFECT');
    for (let i = 1; i < PINPOINT_STEP; i++) r = s.apply('PERFECT');
    expect(r.isMilestone).toBe(true);
    expect(r.tier).toBe(1);
    expect(r.milestoneBonus).toBe(PINPOINT_MILESTONE_BONUS);
    expect(r.hitBonus).toBe(PINPOINT_BONUS_PER_TIER);
  });

  it('test_pinpoint_streak_tier_caps_and_milestones_stop', () => {
    let milestones = 0;
    for (let i = 0; i < PINPOINT_STEP * (PINPOINT_MAX_TIER + 3); i++) {
      if (s.apply('PERFECT').isMilestone) milestones++;
    }
    expect(milestones).toBe(PINPOINT_MAX_TIER);
    expect(s.tier).toBe(PINPOINT_MAX_TIER);
  });

  it('test_pinpoint_streak_good_breaks_streak', () => {
    s.apply('PERFECT'); s.apply('PERFECT');
    const r = s.apply('GOOD');
    expect(r.broken).toBe(true);
    expect(s.streak).toBe(0);
    expect(s.best).toBe(2);
  });

  it('test_pinpoint_streak_guard_forgives_good_but_not_miss', () => {
    s.setGuards(1);
    s.apply('PERFECT'); s.apply('PERFECT');
    expect(s.apply('GOOD').guarded).toBe(true);
    expect(s.streak).toBe(2);
    expect(s.guards).toBe(0);
    s.setGuards(1);
    expect(s.apply('MISS').broken).toBe(true);
    expect(s.streak).toBe(0);
    expect(s.guards).toBe(1);
  });

  it('test_pinpoint_streak_guard_not_spent_without_active_streak', () => {
    s.setGuards(1);
    s.apply('GOOD');
    expect(s.guards).toBe(1);
  });
});

// ─── Power-ups ───────────────────────────────────────────────────────────────

describe('power_ups', () => {
  const emptyCtx = { stacks: new Map<PowerUpId, number>(), shields: 0, missesTaken: 0 };

  it('test_power_ups_base_modifiers_match_config', () => {
    const m = computeModifiers(new Map());
    expect(m.perfectMs).toBe(SCATTER_PERFECT_MS);
    expect(m.goodMs).toBe(SCATTER_GOOD_MS);
    expect(m.approachMult).toBe(1);
    expect(m.scoreMult).toBe(1);
    expect(m.comboStep).toBe(COMBO_STEP);
  });

  it('test_power_ups_good_window_always_wider_than_perfect', () => {
    const m = computeModifiers(new Map<PowerUpId, number>([['steady-hand', 50]]));
    expect(m.perfectMs).toBe(SCATTER_PERFECT_MS + 50 * PU_STEADY_HAND_MS);
    expect(m.goodMs).toBeGreaterThan(m.perfectMs);
  });

  it('test_power_ups_momentum_floor', () => {
    const m = computeModifiers(new Map<PowerUpId, number>([['momentum', 99]]));
    expect(m.comboStep).toBe(PU_MOMENTUM_MIN_STEP);
  });

  it('test_power_ups_draft_returns_distinct_cards', () => {
    const rng = seeded(11);
    for (let i = 0; i < 50; i++) {
      const offer = draftOffer(emptyCtx, rng);
      expect(offer.length).toBe(DRAFT_CHOICES);
      expect(new Set(offer.map(o => o.id)).size).toBe(offer.length);
    }
  });

  it('test_power_ups_second_wind_requires_lost_heart', () => {
    const def = getPowerUp('second-wind');
    expect(isEligible(def, emptyCtx)).toBe(false);
    expect(isEligible(def, { ...emptyCtx, missesTaken: 1 })).toBe(true);
  });

  it('test_power_ups_aegis_blocked_at_shield_cap', () => {
    expect(isEligible(getPowerUp('aegis'), { ...emptyCtx, shields: PU_MAX_SHIELDS })).toBe(false);
  });

  it('test_power_ups_maxed_passive_not_offered', () => {
    const def = getPowerUp('resonance');
    expect(isEligible(def, { ...emptyCtx, stacks: new Map([['resonance', def.maxStacks]]) })).toBe(false);
  });

  it('test_power_ups_draft_shrinks_when_pool_exhausted', () => {
    const stacks = new Map<PowerUpId, number>(POWER_UPS.map(p => [p.id, p.maxStacks]));
    expect(draftOffer({ stacks, shields: 0, missesTaken: 0 }, seeded(2))).toEqual([]);
  });
});

// ─── Scatter run ─────────────────────────────────────────────────────────────

describe('scatter_run', () => {
  let run: ScatterRun;
  beforeEach(() => { run = new ScatterRun(seeded(5)); });

  it('test_scatter_run_base_points_match_s2', () => {
    expect(run.resolve('PERFECT').points).toBe(PERFECT_BASE);
    expect(run.resolve('GOOD').points).toBe(GOOD_BASE);
  });

  it('test_scatter_run_pinpoint_milestone_adds_bonus', () => {
    let total = 0;
    for (let i = 0; i < PINPOINT_STEP; i++) total += run.resolve('PERFECT').points;
    // Combo mult at hit #5 is sampled at combo=4 → still tier 0 of MULTIPLIER_TABLE
    const expected = PERFECT_BASE * PINPOINT_STEP + PINPOINT_BONUS_PER_TIER + PINPOINT_MILESTONE_BONUS;
    expect(total).toBe(expected);
    expect(run.score).toBe(expected);
  });

  it('test_scatter_run_misses_end_run', () => {
    for (let i = 0; i < MAX_MISSES - 1; i++) expect(run.resolve('MISS').gameOver).toBe(false);
    expect(run.resolve('MISS').gameOver).toBe(true);
    expect(run.heartsRemaining).toBe(0);
  });

  it('test_scatter_run_shield_absorbs_miss_and_keeps_combo', () => {
    run.pick('aegis');
    run.resolve('PERFECT'); run.resolve('PERFECT');
    const out = run.resolve('MISS');
    expect(out.shieldUsed).toBe(true);
    expect(run.shields).toBe(0);
    expect(run.combo).toBe(2);
    expect(run.heartsRemaining).toBe(MAX_MISSES);
    expect(run.streak).toBe(0);
  });

  it('test_scatter_run_second_wind_restores_heart', () => {
    run.resolve('MISS');
    run.pick('second-wind');
    expect(run.heartsRemaining).toBe(MAX_MISSES);
  });

  it('test_scatter_run_overcharge_scales_points', () => {
    run.pick('overcharge');
    expect(run.resolve('PERFECT').points).toBe(Math.round(PERFECT_BASE * (1 + PU_OVERCHARGE_PCT)));
  });

  it('test_scatter_run_resonance_grants_shield_on_milestone', () => {
    run.pick('resonance');
    let gained = false;
    for (let i = 0; i < PINPOINT_STEP; i++) gained = run.resolve('PERFECT').shieldGained || gained;
    expect(gained).toBe(true);
    expect(run.shields).toBe(1);
  });

  it('test_scatter_run_streak_guard_refills_each_wave', () => {
    run.pick('streak-guard');
    run.beginWave();
    run.resolve('PERFECT');
    run.resolve('GOOD');
    expect(run.streak).toBe(1);
    expect(run.streakGuards).toBe(0);
    run.completeWave();
    run.beginWave();
    expect(run.streakGuards).toBe(1);
  });

  it('test_scatter_run_momentum_reaches_multiplier_sooner', () => {
    run.pick('momentum');
    const step = COMBO_STEP - 1;
    for (let i = 0; i < step; i++) run.resolve('GOOD');
    expect(run.multiplier).toBe(2);
  });

  it('test_scatter_run_steady_hand_widens_timing_rules', () => {
    run.pick('steady-hand');
    expect(run.timingRules.perfectMs).toBe(SCATTER_PERFECT_MS + PU_STEADY_HAND_MS);
  });

  it('test_scatter_run_reset_clears_everything', () => {
    run.pick('overcharge');
    run.resolve('PERFECT'); run.resolve('MISS');
    run.completeWave();
    run.reset();
    expect(run.score).toBe(0);
    expect(run.wave).toBe(0);
    expect(run.heartsRemaining).toBe(MAX_MISSES);
    expect(run.loadout.size).toBe(0);
  });

  it('test_scatter_run_full_wave_integration_with_field', () => {
    const field = new TargetField(BOUNDS, run.timingRules, seeded(9));
    let ended = false;
    field.onTargetResolved(e => run.resolve(e.grade));
    field.onWaveEnd(() => { ended = true; });
    const params = run.beginWave();
    field.startWave(params);
    // Perfect-tap every target at its hit moment
    for (let ms = 0; ms < 60_000 && !ended; ms += 5) {
      field.update(0.005);
      for (const t of [...field.targets]) {
        if (Math.abs(t.timeToHit) <= 5) field.tap(t.x, t.y);
      }
    }
    expect(ended).toBe(true);
    expect(run.combo).toBe(params.targetCount);
    expect(run.accuracy).toBe(1);
    expect(run.bestStreak).toBe(params.targetCount);
  });
});

describe('target_field_regression', () => {
  it('test_target_field_reset_inside_listener_stops_further_events', () => {
    // Arrange: two targets that will auto-miss on the same frame
    const field = new TargetField({ width: 0, height: 0 }, BASE_RULES, seeded(1));
    let resolved = 0;
    let waveEnds = 0;
    field.onTargetResolved(() => { resolved++; field.reset(); });
    field.onWaveEnd(() => waveEnds++);
    field.startWave(wave({ targetCount: 2, spawnIntervalMs: 0, approachMs: 100 }));
    field.update(0);

    // Act: one big frame pushes both past the auto-miss limit
    field.update(1);

    // Assert: the reset halted processing — no second miss, no spurious wave end
    expect(resolved).toBe(1);
    expect(waveEnds).toBe(0);
  });
});
