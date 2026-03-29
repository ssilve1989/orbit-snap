// ─── S1: Ring Tap ────────────────────────────────────────────────────────────

/** Fixed radius of the central target orb (px) */
export const ORB_RADIUS = 32;

/** Radius at which new rings spawn (px) */
export const RING_MAX_RADIUS = 265;

/** Distance-based acceleration constant for ring speed formula (px/s²) */
export const ACCEL = 0;

/** Half-width of Perfect grade window (px) */
export const PERFECT_WINDOW = 9;

/** Half-width of Good grade window (px) */
export const GOOD_WINDOW = 22;

/** Grace distance past Good window before auto-miss fires (px) */
export const AUTO_MISS_BUFFER = 12;

/** Pause between rounds (ms) */
export const INTER_ROUND_MS = 750;

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

/** Rounds played before advancing to the next difficulty level */
export const ROUNDS_PER_LEVEL = 4;

/**
 * Simultaneous ring count per difficulty level.
 * Wraps via diffLevel % table.length for endless play.
 */
export const RING_COUNT_TABLE: readonly number[] = [1, 1, 2, 2, 3];

/** Ring convergence speed at level 0 (px/s) */
export const BASE_RING_SPEED = 115;

/** Speed added per difficulty level (px/s). */
export const SPEED_INCREMENT = 8;

/** Maximum ring speed — prevents timing window below human reaction floor (px/s) */
export const MAX_RING_SPEED = 175;

/** Time between staggered ring spawns in a multi-ring round (ms) */
export const STAGGER_MS = 550;

/** Per-ring speed randomisation range (px/s). Each ring gets baseSpeed ± this value. */
export const RING_SPEED_VARIANCE = 15;

// ─── S4: End Condition ────────────────────────────────────────────────────────

/** Number of misses that end the session. */
export const MAX_MISSES = 3;
