/**
 * Atmosphere — per-frame state that makes the backdrop react to play.
 *
 * Pure logic (no PixiJS): it eases combo heat, runs the heat-scaled animation
 * clocks, ages the Perfect/Good ripple and Miss decay, tracks the focus pull and
 * the parallax camera, and fades the living orb core in and out. BackgroundManager
 * copies `frame` into shader uniforms; AmbientDust reads it for parallax and the
 * ripple push.
 *
 * Usage:
 *   const atmosphere = new Atmosphere({ reducedMotion });
 *   ringTap.onRingResolved(e => atmosphere.onGrade(e.grade, 0.5, 0.5, GRADE_COLOR[e.grade]));
 *   app.ticker.add(() => {
 *     atmosphere.setCombo(combo);
 *     atmosphere.setFocus(focusFromRingDistance(nearestRingGap));
 *     atmosphere.update(dt);
 *     backgrounds.update(atmosphere.frame);
 *   });
 */

import { GOOD_WINDOW } from '../config.js';
import type { Grade } from '../gameplay/ring-tap.js';

// ─── Visual constants (presentation layer — not gameplay tuning knobs) ────────

/** Combo count at which heat saturates at 1.0. */
export const HEAT_FULL_COMBO = 16;
/** Exponential ease rate (1/s) while heat rises. */
const HEAT_RISE_RATE = 2.5;
/** Exponential ease rate (1/s) while heat falls — cools faster so a miss reads at once. */
const HEAT_FALL_RATE = 6;

/** At full heat the star twinkle clock runs (1 + gain)× faster. */
export const TWINKLE_HEAT_GAIN = 2.2;
/** At full heat the environment flow clock runs (1 + gain)× faster. */
export const FLOW_HEAT_GAIN = 2.0;

/** Lifetime of the Perfect/Good ripple (s). Also compiled into the shader. */
export const SHOCK_DURATION_S = 1.6;
/** Ripple front speed in screen heights per second. Also compiled into the shader. */
export const SHOCK_SPEED = 0.85;

/** Miss fringe/drain decay rate (amount per second, starting from 1). */
const MISS_DECAY_RATE = 2.2;

/** Distance past the Good window over which focus ramps from 0 to 1 (px, Classic). */
export const FOCUS_RAMP_PX = 70;
/** Time past the Good window over which focus ramps from 0 to 1 (ms, Scatter). */
export const FOCUS_RAMP_MS = 600;
/** Exponential ease rate (1/s) for focus. */
const FOCUS_EASE_RATE = 8;

/** Idle camera drift: amplitude (screen UV) and angular rate (rad/s) per axis. */
const CAMERA_DRIFT_AMP_X = 0.010;
const CAMERA_DRIFT_AMP_Y = 0.008;
const CAMERA_DRIFT_RATE_X = 0.11;
const CAMERA_DRIFT_RATE_Y = 0.083;
/** Exponential ease rate (1/s) toward the camera target. */
const CAMERA_EASE_RATE = 1.5;

/** Orb core flash length (s) — matches the orb stroke flash (FLASH_DURATION_MS). */
const ORB_FLASH_S = 0.28;
/** Rate (per second) at which the orb core fades in or out. */
const ORB_PRESENCE_RATE = 4;

/** Largest step update() will integrate, so a backgrounded tab doesn't jump. */
const MAX_STEP_S = 0.1;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Snapshot of everything the backdrop needs for one frame. */
export interface AtmosphereFrame {
  /** Seconds since start (orb breathing). */
  readonly time: number;
  /** Star twinkle clock (s); advances faster with heat. */
  readonly twinkle: number;
  /** Environment motion clock (s); advances faster with heat. */
  readonly flow: number;
  /** Eased combo heat, 0..1. */
  readonly heat: number;
  /** Ripple origin in screen UV (0..1, y down). */
  readonly shockX: number;
  readonly shockY: number;
  /** Seconds since the last ripple; idle once it reaches SHOCK_DURATION_S. */
  readonly shockAge: number;
  /** 0 = Perfect ripple, 1 = Good ripple (weaker, lime). */
  readonly shockGood: number;
  /** Miss fringe/drain amount, 1 on a miss decaying to 0. */
  readonly miss: number;
  /** Eased focus pull, 0..1. */
  readonly focus: number;
  /** Parallax camera offset in screen UV. */
  readonly camX: number;
  readonly camY: number;
  /** Living orb core visibility, 0..1. */
  readonly orbPresence: number;
  /** Orb core flash amount, 1 on a grade decaying to 0. */
  readonly orbFlash: number;
  /** Orb core flash colour, 0..1 per channel. */
  readonly flashR: number;
  readonly flashG: number;
  readonly flashB: number;
}

type MutableFrame = { -readonly [K in keyof AtmosphereFrame]: AtmosphereFrame[K] };

export interface AtmosphereOptions {
  /** When true the camera never drifts. */
  readonly reducedMotion: boolean;
}

// ─── Focus helpers ────────────────────────────────────────────────────────────

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Classic: focus from the gap (px) between the nearest active ring and the orb edge.
 * 1 inside the Good window, ramping to 0 at GOOD_WINDOW + FOCUS_RAMP_PX.
 */
export function focusFromRingDistance(gapPx: number): number {
  return clamp01(1 - (gapPx - GOOD_WINDOW) / FOCUS_RAMP_PX);
}

/**
 * Scatter: focus from the time (ms) until the most urgent target's hit moment.
 * 1 inside the Good window, ramping to 0 at goodMs + FOCUS_RAMP_MS.
 */
export function focusFromTimeToHit(timeToHitMs: number, goodMs: number): number {
  return clamp01(1 - (timeToHitMs - goodMs) / FOCUS_RAMP_MS);
}

/** Exponential ease factor for one step. */
const ease = (rate: number, dt: number): number => 1 - Math.exp(-dt * rate);

// ─── Atmosphere ───────────────────────────────────────────────────────────────

export class Atmosphere {
  readonly #reducedMotion: boolean;
  readonly #frame: MutableFrame = {
    time: 0, twinkle: 0, flow: 0, heat: 0,
    shockX: 0.5, shockY: 0.5, shockAge: SHOCK_DURATION_S, shockGood: 0,
    miss: 0, focus: 0, camX: 0, camY: 0,
    orbPresence: 0, orbFlash: 0, flashR: 1, flashG: 1, flashB: 1,
  };

  #combo = 0;
  #focusTarget = 0;
  #orbVisible = false;

  constructor(options: AtmosphereOptions) {
    this.#reducedMotion = options.reducedMotion;
  }

  /** Live values for the current frame. */
  get frame(): Readonly<AtmosphereFrame> {
    return this.#frame;
  }

  /** Current combo count; heat eases toward min(1, combo / HEAT_FULL_COMBO). */
  setCombo(combo: number): void {
    this.#combo = Math.max(0, combo);
  }

  /** Target focus 0..1 (see focusFromRingDistance / focusFromTimeToHit). */
  setFocus(focus: number): void {
    this.#focusTarget = clamp01(focus);
  }

  /** Whether the Classic orb is on screen; the plasma core fades to match. */
  setOrbVisible(visible: boolean): void {
    this.#orbVisible = visible;
  }

  /**
   * React to a resolved grade.
   * @param grade      Grade of the hit.
   * @param x          Hit position in screen UV (0..1).
   * @param y          Hit position in screen UV (0..1, y down).
   * @param flashColor Hex colour for the orb core flash (use GRADE_COLOR).
   */
  onGrade(grade: Grade, x: number, y: number, flashColor: number): void {
    const f = this.#frame;
    f.orbFlash = 1;
    f.flashR = ((flashColor >> 16) & 0xff) / 255;
    f.flashG = ((flashColor >> 8) & 0xff) / 255;
    f.flashB = (flashColor & 0xff) / 255;

    if (grade === 'MISS') {
      f.miss = 1;
      return;
    }
    f.shockX = x;
    f.shockY = y;
    f.shockAge = 0;
    f.shockGood = grade === 'GOOD' ? 1 : 0;
  }

  /** Advance all state by `dt` seconds. Call once per frame before reading `frame`. */
  update(dt: number): void {
    const step = Math.min(Math.max(dt, 0), MAX_STEP_S);
    const f = this.#frame;

    f.time += step;

    const heatTarget = Math.min(1, this.#combo / HEAT_FULL_COMBO);
    const heatRate = heatTarget < f.heat ? HEAT_FALL_RATE : HEAT_RISE_RATE;
    f.heat += (heatTarget - f.heat) * ease(heatRate, step);

    // Separate clocks: scaling a shared clock by heat would jump the animation phase
    f.twinkle += step * (1 + f.heat * TWINKLE_HEAT_GAIN);
    f.flow += step * (1 + f.heat * FLOW_HEAT_GAIN);

    f.shockAge = Math.min(SHOCK_DURATION_S, f.shockAge + step);
    f.miss = Math.max(0, f.miss - step * MISS_DECAY_RATE);
    f.orbFlash = Math.max(0, f.orbFlash - step / ORB_FLASH_S);

    f.focus += (this.#focusTarget - f.focus) * ease(FOCUS_EASE_RATE, step);

    const presenceTarget = this.#orbVisible ? 1 : 0;
    const presenceStep = step * ORB_PRESENCE_RATE;
    f.orbPresence = presenceTarget > f.orbPresence
      ? Math.min(presenceTarget, f.orbPresence + presenceStep)
      : Math.max(presenceTarget, f.orbPresence - presenceStep);

    let camTargetX = 0, camTargetY = 0;
    if (!this.#reducedMotion) {
      camTargetX = Math.sin(f.time * CAMERA_DRIFT_RATE_X) * CAMERA_DRIFT_AMP_X;
      camTargetY = Math.cos(f.time * CAMERA_DRIFT_RATE_Y) * CAMERA_DRIFT_AMP_Y;
    }
    const camEase = ease(CAMERA_EASE_RATE, step);
    f.camX += (camTargetX - f.camX) * camEase;
    f.camY += (camTargetY - f.camY) * camEase;
  }
}
