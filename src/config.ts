// ─── S1: Ring Tap ────────────────────────────────────────────────────────────

/** Fixed radius of the central target orb (px) */
export const ORB_RADIUS = 32;

/** Radius at which new rings spawn (px) */
export const RING_MAX_RADIUS = 265;

/** Distance-based acceleration constant for ring speed formula (px/s²) */
export const ACCEL = 0;

/** Half-width of Perfect grade window (px) */
export const PERFECT_WINDOW = 12;

/** Half-width of Good grade window (px) */
export const GOOD_WINDOW = 30;

/**
 * Display + touch latency compensation (ms). Taps are graded against where the ring
 * was this long ago — i.e. where the player saw it. Lower if taps grade early.
 */
export const TAP_LATENCY_MS = 60;

/** Grace distance past Good window before auto-miss fires (px) */
export const AUTO_MISS_BUFFER = 12;

/** Pause between rounds on the first pass (ms) */
export const INTER_ROUND_MS = 750;

/** Pause between rounds on second pass and beyond — tighter tempo at max speed (ms) */
export const INTER_ROUND_MS_LOOP = 400;

// ─── S2: Scoring & Combo ─────────────────────────────────────────────────────

/** Base points for a Perfect hit (before multiplier) */
export const PERFECT_BASE = 100;

/** Base points for a Good hit (before multiplier) */
export const GOOD_BASE = 50;

/** Hits required to advance to the next combo multiplier tier */
export const COMBO_STEP = 5;

/** Maximum combo multiplier cap */
export const MULTIPLIER_CAP = 4;

/**
 * Stepped multiplier table. Index = floor(combo / COMBO_STEP), capped at last entry.
 * Last entry must equal MULTIPLIER_CAP.
 */
export const MULTIPLIER_TABLE: readonly number[] = [1, 2, 3, 4];

// ─── S3: Difficulty Progression ──────────────────────────────────────────────

/** Rounds spent at level 0 before the normal ROUNDS_PER_LEVEL cadence begins. */
export const ROUNDS_AT_LEVEL_ZERO = 3;

/** Rounds played before advancing to the next difficulty level (levels 1+). */
export const ROUNDS_PER_LEVEL = 2;

/**
 * Simultaneous ring count per difficulty level.
 * Wraps via diffLevel % table.length for endless play.
 */
export const RING_COUNT_TABLE: readonly number[] = [1, 2, 2, 3, 3];

/** Ring convergence speed at level 0 (px/s) */
export const BASE_RING_SPEED = 115;

/** Speed added per difficulty level (px/s). */
export const SPEED_INCREMENT = 15;

/** Maximum ring speed — prevents timing window below human reaction floor (px/s) */
export const MAX_RING_SPEED = 175;

/** Minimum ring count enforced on second pass and beyond — prevents regression to 1-ring. */
export const LOOP_MIN_RING_COUNT = 2;

/** Time between staggered ring spawns in a multi-ring round (ms) */
export const STAGGER_MS = 550;

/** Per-ring speed randomisation range (px/s). Each ring gets baseSpeed ± this value. */
export const RING_SPEED_VARIANCE = 15;

// ─── S4: End Condition ────────────────────────────────────────────────────────

/** Number of misses that end the session. */
export const MAX_MISSES = 3;

// ─── S7: Scatter Mode — Target Field ──────────────────────────────────────────
// Design: design/gdd/scatter-mode.md

/** Radius of a scatter target's core disc (px). */
export const TARGET_RADIUS = 26;

/** Extra radius the approach ring starts at, beyond TARGET_RADIUS (px). */
export const TARGET_RING_START_OFFSET = 84;

/** Tap hit-test radius as a multiple of TARGET_RADIUS (generous for touch). */
export const TARGET_HIT_RADIUS_MULT = 1.7;

/** Half-width of the Perfect timing window around a target's hit moment (ms). */
export const SCATTER_PERFECT_MS = 70;

/** Half-width of the Good timing window around a target's hit moment (ms). */
export const SCATTER_GOOD_MS = 160;

/** Grace period past the Good window before a target auto-misses (ms). */
export const SCATTER_AUTO_MISS_MS = 90;

/** Minimum distance from screen edges when placing targets (px). */
export const TARGET_EDGE_MARGIN = 64;

/** Top band reserved for the HUD — targets never spawn above this (px). */
export const TARGET_TOP_MARGIN = 170;

/** Preferred minimum spacing between concurrently live targets (px). */
export const TARGET_MIN_SPACING = 120;

/** Placement attempts before accepting the best (most spaced) candidate. */
export const TARGET_PLACEMENT_ATTEMPTS = 24;

// ─── S8: Scatter Mode — Wave Progression ─────────────────────────────────────

/** Targets in wave 0. */
export const WAVE_BASE_TARGETS = 8;

/** Extra targets added per wave. */
export const WAVE_TARGETS_INCREMENT = 2;

/** Cap on targets per wave. */
export const WAVE_MAX_TARGETS = 24;

/** Approach duration (spawn → hit moment) in wave 0 (ms). */
export const WAVE_BASE_APPROACH_MS = 1500;

/** Approach duration reduction per wave (ms). */
export const WAVE_APPROACH_DECREMENT = 70;

/** Floor on approach duration — keeps reads humanly possible (ms). */
export const WAVE_MIN_APPROACH_MS = 820;

/** Mean time between target spawns in wave 0 (ms). */
export const WAVE_BASE_SPAWN_INTERVAL_MS = 950;

/** Spawn interval reduction per wave (ms). */
export const WAVE_SPAWN_INTERVAL_DECREMENT = 60;

/** Floor on mean spawn interval (ms). */
export const WAVE_MIN_SPAWN_INTERVAL_MS = 360;

/** Random ± fraction applied to each spawn interval (0.35 = ±35%). */
export const WAVE_SPAWN_JITTER = 0.35;

/** Pause before the first target of a wave spawns (ms). */
export const WAVE_LEAD_IN_MS = 900;

// ─── S9: Pinpoint Streak ──────────────────────────────────────────────────────

/** Consecutive Perfects required per streak tier. */
export const PINPOINT_STEP = 5;

/** Bonus points added to every Perfect, per streak tier (before multipliers). */
export const PINPOINT_BONUS_PER_TIER = 30;

/** One-off bonus awarded on reaching each tier, multiplied by the tier (pts). */
export const PINPOINT_MILESTONE_BONUS = 250;

/** Highest tier that keeps adding bonus (streak keeps counting past it). */
export const PINPOINT_MAX_TIER = 6;

// ─── S10: Roguelite Power-Ups ─────────────────────────────────────────────────

/** Cards offered in each between-wave draft. */
export const DRAFT_CHOICES = 3;

/** Steady Hand: Perfect window added per stack (ms). */
export const PU_STEADY_HAND_MS = 14;

/** Wide Lens: Good window added per stack (ms). */
export const PU_WIDE_LENS_MS = 30;

/** Time Dilation: approach duration multiplier added per stack (0.12 = +12%). */
export const PU_TIME_DILATION_PCT = 0.12;

/** Overcharge: score multiplier added per stack (0.25 = +25%). */
export const PU_OVERCHARGE_PCT = 0.25;

/** Magnet Touch: hit radius multiplier added per stack (0.3 = +30%). */
export const PU_MAGNET_PCT = 0.3;

/** Maximum shield charges a player can hold at once. */
export const PU_MAX_SHIELDS = 3;

/** Momentum: hits removed from COMBO_STEP per stack (floor of 2). */
export const PU_MOMENTUM_STEP_REDUCTION = 1;

/** Lowest combo step Momentum can reduce to. */
export const PU_MOMENTUM_MIN_STEP = 2;

/**
 * Draft tuning per power-up: max stacks a run can hold and relative draft weight.
 * Instant power-ups (aegis, second-wind) use maxStacks as "times offerable";
 * their eligibility is additionally gated by run state (see power-ups.ts).
 */
export const POWER_UP_TUNING = {
  'steady-hand':   { maxStacks: 3,  weight: 10 },
  'wide-lens':     { maxStacks: 3,  weight: 10 },
  'time-dilation': { maxStacks: 3,  weight: 8 },
  'overcharge':    { maxStacks: 4,  weight: 8 },
  'magnet':        { maxStacks: 2,  weight: 7 },
  'aegis':         { maxStacks: 99, weight: 7 },
  'second-wind':   { maxStacks: 99, weight: 6 },
  'streak-guard':  { maxStacks: 2,  weight: 5 },
  'momentum':      { maxStacks: 2,  weight: 4 },
  'resonance':     { maxStacks: 1,  weight: 3 },
} as const satisfies Record<string, { readonly maxStacks: number; readonly weight: number }>;
