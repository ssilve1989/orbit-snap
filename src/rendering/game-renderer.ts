/**
 * GameRenderer — draws orb, rings, hint circles, and grade flash each frame.
 * Implements the visual layer of the S1 Ring Tap mechanic.
 *
 * Call draw() once per ticker tick, passing the latest ring state snapshot
 * from RingTap.rings and the current OrbFlash (if any). Active rings leave
 * fading echoes behind them so their closing speed is easy to read.
 */

import * as PIXI from 'pixi.js';
import { ORB_RADIUS, RING_MAX_RADIUS, PERFECT_WINDOW, GOOD_WINDOW } from '../config.js';
import type { RingState } from '../gameplay/ring-tap.js';

// ─── Visual constants (presentation layer — not gameplay tuning knobs) ────────

/** Stroke width for rings and orb outline (px) */
const RING_STROKE_WIDTH = 4;

/** Alpha for hint circles at the PERFECT and GOOD thresholds */
const HINT_ALPHA_PERFECT = 0.09;
const HINT_ALPHA_GOOD = 0.045;

/** Color of a PENDING ring (waiting to spawn) */
const RING_COLOR_PENDING = 0xffffff;
/** Alpha of a PENDING ring — subtle anticipation cue */
const RING_ALPHA_PENDING = 0.18;

/** Resolved ring colors */
const RING_COLOR_HIT = 0x00ffc8;
const RING_COLOR_MISSED = 0xff3c3c;
/** Starting alpha for resolved rings; fades out at RING_FADE_RATE per second */
const RING_ALPHA_RESOLVED_START = 0.55;
const RING_FADE_RATE = 2.8;

/** Default orb alpha when not flashing */
const ORB_ALPHA_DEFAULT = 0.85;
/** Orb alpha range during flash: dims from full (1.0) toward ORB_ALPHA_FLASH_MIN */
const ORB_ALPHA_FLASH_MIN = 0.35;
/** Fill alpha for orb glow disc during flash */
const ORB_FILL_ALPHA_FLASH = 0.14;
/** Flash duration (ms) — matches orbFlash=280 from prototype */
const FLASH_DURATION_MS = 280;
/** Controls how quickly the flash alpha reaches full intensity (ms) */
const FLASH_RAMP_MS = 140;

/** Ring trail: echoes behind each closing ring, one per TRAIL_STEP_S of travel. */
const TRAIL_ECHOES = 3;
const TRAIL_STEP_S = 0.05;
/** Alpha of the nearest echo; echo k uses TRAIL_ALPHA / k. */
const TRAIL_ALPHA = 0.2;
/** Each echo is this fraction thinner than the one before. */
const TRAIL_WIDTH_FALLOFF = 0.2;
/** Clamp for the per-frame speed estimate (px/s). */
const TRAIL_MAX_SPEED = 600;
/** Blend factor toward each new speed sample (smooths frame-time jitter). */
const TRAIL_SPEED_SMOOTHING = 0.3;

// ─── Grade colors ─────────────────────────────────────────────────────────────

/** Hex color emitted by the orb for each resolution grade */
export const GRADE_COLOR: Readonly<Record<'PERFECT' | 'GOOD' | 'MISS', number>> = {
  PERFECT: 0x00ffcc,
  GOOD: 0x88ff44,
  MISS: 0xff4444,
};

// ─── OrbFlash state ───────────────────────────────────────────────────────────

/** Passed to draw() to drive the orb flash animation. */
export interface OrbFlash {
  /** Hex flash color (use GRADE_COLOR to create this). */
  readonly color: number;
  /** Time remaining in the flash, counting down from FLASH_DURATION_MS to 0. */
  readonly remainingMs: number;
}

export { FLASH_DURATION_MS };

// ─── ResolvedRingFade (renderer-internal) ─────────────────────────────────────

interface ResolvedRingFade {
  color: number;
  alpha: number;
}

/** Last seen radius and estimated closing speed of an active ring. */
interface RingMotion {
  radius: number;
  speed: number;
}

// ─── GameRenderer ─────────────────────────────────────────────────────────────

export class GameRenderer {
  readonly #graphics: PIXI.Graphics;
  readonly #cx: number;
  readonly #cy: number;

  /** Tracks fade-out animation for rings that have been resolved (HIT / MISSED). */
  readonly #resolvedFades = new Map<number, ResolvedRingFade>();

  /** Closing speed estimates for active rings, used to space the trail echoes. */
  readonly #ringMotion = new Map<number, RingMotion>();

  /**
   * @param parent  Container to add the graphics layer to (above backgrounds).
   * @param width   Canvas width in pixels.
   * @param height  Canvas height in pixels.
   */
  constructor(parent: PIXI.Container, width: number, height: number) {
    this.#cx = width / 2;
    this.#cy = height / 2;
    this.#graphics = new PIXI.Graphics();
    parent.addChild(this.#graphics);
  }

  /**
   * Redraw the game layer for the current frame.
   *
   * @param rings    Snapshot from RingTap.rings.
   * @param dt       Frame delta time in seconds (used for fade-out animation).
   * @param orbFlash Current orb flash state, or null when the orb is at rest.
   */
  draw(rings: readonly RingState[], dt: number, orbFlash: OrbFlash | null): void {
    this.#syncFades(rings, dt);
    this.#syncMotion(rings, dt);

    const g = this.#graphics;
    g.clear();

    this.#drawHintRings(g);
    this.#drawRings(g, rings);
    this.#drawOrb(g, orbFlash);
  }

  /** Clear all drawn content immediately (call when entering a menu phase). */
  clear(): void {
    this.#graphics.clear();
    this.#resolvedFades.clear();
    this.#ringMotion.clear();
  }

  /** Remove the graphics layer from the scene graph. */
  destroy(): void {
    this.#graphics.destroy();
  }

  // ─── Private drawing methods ────────────────────────────────────────────────

  #drawHintRings(g: PIXI.Graphics): void {
    const cx = this.#cx, cy = this.#cy;
    g.circle(cx, cy, ORB_RADIUS + GOOD_WINDOW)
      .stroke({ width: 1, color: 0xffffff, alpha: HINT_ALPHA_GOOD });
    g.circle(cx, cy, ORB_RADIUS + PERFECT_WINDOW)
      .stroke({ width: 1, color: 0xffffff, alpha: HINT_ALPHA_PERFECT });
  }

  #drawRings(g: PIXI.Graphics, rings: readonly RingState[]): void {
    const cx = this.#cx, cy = this.#cy;

    // Draw resolved (fading) rings first so they appear beneath active ones
    for (const [, fade] of this.#resolvedFades) {
      if (fade.alpha > 0) {
        g.circle(cx, cy, ORB_RADIUS)
          .stroke({ width: RING_STROKE_WIDTH, color: fade.color, alpha: fade.alpha });
      }
    }

    for (const ring of rings) {
      switch (ring.state) {
        case 'PENDING': {
          g.circle(cx, cy, ring.radius)
            .stroke({ width: RING_STROKE_WIDTH, color: RING_COLOR_PENDING, alpha: RING_ALPHA_PENDING });
          break;
        }
        case 'ACTIVE': {
          const color = this.#activeRingColor(ring.radius);
          const speed = this.#ringMotion.get(ring.id)?.speed ?? 0;
          for (let k = TRAIL_ECHOES; k >= 1 && speed > 0; k--) {
            g.circle(cx, cy, ring.radius + speed * TRAIL_STEP_S * k).stroke({
              width: RING_STROKE_WIDTH * (1 - k * TRAIL_WIDTH_FALLOFF),
              color,
              alpha: TRAIL_ALPHA / k,
            });
          }
          g.circle(cx, cy, ring.radius)
            .stroke({ width: RING_STROKE_WIDTH, color, alpha: 1 });
          break;
        }
        case 'HIT':
        case 'MISSED': {
          // Visual handled by the resolvedFades map (drawn above)
          break;
        }
      }
    }
  }

  #drawOrb(g: PIXI.Graphics, flash: OrbFlash | null): void {
    const cx = this.#cx, cy = this.#cy;
    const isFlashing = flash !== null && flash.remainingMs > 0;
    const color = isFlashing ? flash.color : 0xffffff;

    let strokeAlpha: number;
    if (isFlashing && flash !== null) {
      // Ramp: full intensity while remainingMs > FLASH_RAMP_MS, then fade to min
      strokeAlpha = ORB_ALPHA_FLASH_MIN +
        (1 - ORB_ALPHA_FLASH_MIN) * Math.min(1, flash.remainingMs / FLASH_RAMP_MS);
    } else {
      strokeAlpha = ORB_ALPHA_DEFAULT;
    }

    if (isFlashing) {
      g.circle(cx, cy, ORB_RADIUS).fill({ color, alpha: ORB_FILL_ALPHA_FLASH });
    }
    g.circle(cx, cy, ORB_RADIUS).stroke({ width: RING_STROKE_WIDTH, color, alpha: strokeAlpha });
  }

  // ─── Resolved ring fade management ──────────────────────────────────────────

  /**
   * Register newly resolved rings, advance fade timers, and prune stale entries.
   */
  #syncFades(rings: readonly RingState[], dt: number): void {
    // Advance existing fades
    for (const [id, fade] of this.#resolvedFades) {
      fade.alpha -= dt * RING_FADE_RATE;
      if (fade.alpha <= 0) this.#resolvedFades.delete(id);
    }

    // Register rings that just became resolved
    for (const ring of rings) {
      if (ring.state === 'HIT' && !this.#resolvedFades.has(ring.id)) {
        this.#resolvedFades.set(ring.id, { color: RING_COLOR_HIT, alpha: RING_ALPHA_RESOLVED_START });
      } else if (ring.state === 'MISSED' && !this.#resolvedFades.has(ring.id)) {
        this.#resolvedFades.set(ring.id, { color: RING_COLOR_MISSED, alpha: RING_ALPHA_RESOLVED_START });
      }
    }

    // Prune fades for rings that have left the state array (round restarted)
    for (const id of this.#resolvedFades.keys()) {
      if (!rings.some(r => r.id === id)) this.#resolvedFades.delete(id);
    }
  }

  /**
   * Update closing-speed estimates for active rings and drop the rest.
   * RingState carries no speed, so it is derived from the radius change.
   */
  #syncMotion(rings: readonly RingState[], dt: number): void {
    for (const ring of rings) {
      if (ring.state !== 'ACTIVE') {
        this.#ringMotion.delete(ring.id);
        continue;
      }
      const prev = this.#ringMotion.get(ring.id);
      if (prev === undefined) {
        this.#ringMotion.set(ring.id, { radius: ring.radius, speed: 0 });
        continue;
      }
      if (dt > 0) {
        const sample = Math.min(TRAIL_MAX_SPEED, Math.max(0, (prev.radius - ring.radius) / dt));
        prev.speed = prev.speed === 0 ? sample : prev.speed + (sample - prev.speed) * TRAIL_SPEED_SMOOTHING;
      }
      prev.radius = ring.radius;
    }
    for (const id of this.#ringMotion.keys()) {
      if (!rings.some(r => r.id === id)) this.#ringMotion.delete(id);
    }
  }

  /**
   * Interpolates ring color from white (far) to warm orange (near) as the ring
   * converges on the orb — matching the prototype visual.
   *
   * t=0 (radius=RING_MAX_RADIUS): 0xffffff (white)
   * t=1 (radius=ORB_RADIUS):      0xff7300 (warm orange)
   */
  #activeRingColor(radius: number): number {
    const t = 1 - Math.max(0, (radius - ORB_RADIUS) / (RING_MAX_RADIUS - ORB_RADIUS));
    const r = 255;
    const gVal = Math.round(255 * (1 - t * 0.55));
    const b = Math.round(255 * (1 - t));
    return (r << 16) | (gVal << 8) | b;
  }
}
