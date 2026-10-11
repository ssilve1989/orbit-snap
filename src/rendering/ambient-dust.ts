/**
 * AmbientDust — faint motes at three depths that swirl around the screen centre.
 *
 * In Classic play they spiral into the orb (faster as they fall) and fade out as
 * they are absorbed; elsewhere they just drift. They shift with the parallax
 * camera by depth, and the Perfect/Good ripple pushes them away from the hit.
 * Drawn on one Graphics layer between the background and the gameplay layers.
 *
 * Usage:
 *   const dust = new AmbientDust(shakeLayer, W, H);   // after BackgroundManager
 *   app.ticker.add(() => dust.update(dt, atmosphere.frame, inflow));
 */

import * as PIXI from 'pixi.js';
import { ORB_RADIUS, RING_MAX_RADIUS } from '../config.js';
import { SHOCK_SPEED, type AtmosphereFrame } from './atmosphere.js';

// ─── Visual constants (presentation layer — not gameplay tuning knobs) ────────

/** Screen area per mote (px²); count is clamped to [DUST_MIN, DUST_MAX]. */
const DUST_AREA_PER_MOTE = 8000;
const DUST_MIN = 40;
const DUST_MAX = 140;
/** Depth layers (far → near); each mote gets one with ±15% jitter. */
const DEPTH_LAYERS = [0.35, 0.6, 1.0] as const;
/** Spawn radius as a fraction of the screen diagonal. */
const SPAWN_RADIUS_FRAC = 0.55;

/** Angular speed (rad/s) at RING_MAX_RADIUS; scales with sqrt(R / r). */
const SWIRL_RATE = 0.07;
/** Constant inward drift (px/s) while flowing into the orb. */
const INFLOW_BASE = 5;
/** Extra inward speed (px/s) at 3× the core radius, falling off as 1/r. */
const INFLOW_PULL = 26;
/** At full heat swirl and inflow run (1 + gain)× faster. */
const SWIRL_HEAT_GAIN = 0.6;
const INFLOW_HEAT_GAIN = 0.5;

/** Peak outward acceleration from the ripple front (px/s²). */
const SHOCK_PUSH_ACCEL = 1320;
/** Ripple push lasts this long (s) and fades linearly. */
const SHOCK_PUSH_WINDOW_S = 1.2;
/** Width of the push band around the ripple front, as a fraction of screen height. */
const SHOCK_PUSH_WIDTH_FRAC = 0.08;
/** Good ripples push at this fraction of a Perfect. */
const SHOCK_GOOD_STRENGTH = 0.55;
/** Exponential damping (1/s) of push velocity. */
const PUSH_DAMPING = 2.5;

/** Motes inside this many core radii are absorbed (inflow only). */
const ABSORB_RADIUS = 1.05;
/** Motes fade out over this many core radii as they approach the core. */
const ABSORB_FADE_SPAN = 2.2;
/** Fade-in rate (per second) for newly spawned motes. */
const FADE_IN_RATE = 0.8;

/** Screen-space parallax per unit of camera offset, scaled by depth. */
const PARALLAX_GAIN = 1.6;
/** Mote alpha = BASE + DEPTH × depth. */
const ALPHA_BASE = 0.05;
const ALPHA_DEPTH = 0.26;
/** Mote radius (px) = BASE + DEPTH × depth. */
const SIZE_BASE = 0.5;
const SIZE_DEPTH = 1.1;
const COLOR_COOL = 0xdfe6ff;
/** Motes about to fall into the orb glow warm. */
const COLOR_WARM = 0xffb070;
const WARM_THRESHOLD = 0.6;

/** Largest step update() will integrate. */
const MAX_STEP_S = 0.1;

// ─── Simulation ───────────────────────────────────────────────────────────────

/** One mote, positioned relative to the screen centre. */
export interface Mote {
  x: number;
  y: number;
  /** Ripple push velocity (px/s). */
  vx: number;
  vy: number;
  /** Depth 0.3..1.15; nearer motes are larger, brighter and shift more. */
  depth: number;
  /** Fade-in progress 0..1. */
  fade: number;
}

/** Ripple acting on the dust this step, in centre-relative px. */
export interface DustShock {
  readonly x: number;
  readonly y: number;
  /** Distance of the ripple front from its origin (px). */
  readonly front: number;
  /** Width of the push band (px). */
  readonly width: number;
  /** Push strength 0..1. */
  readonly strength: number;
}

/** Per-step inputs shared by every mote. */
export interface DustStepParams {
  /** Absorption radius reference (px) — the orb radius. */
  readonly coreRadius: number;
  /** Radius (px) at which angular speed equals SWIRL_RATE. */
  readonly swirlRadius: number;
  /** True while motes should fall into the core. */
  readonly inflow: boolean;
  /** Combo heat 0..1. */
  readonly heat: number;
  readonly shock: DustShock | null;
}

/**
 * Advance one mote by `dt` seconds.
 * @returns false once the mote has been absorbed by the core and should respawn.
 */
export function stepMote(m: Mote, dt: number, p: DustStepParams): boolean {
  const r = Math.hypot(m.x, m.y);
  const rr = Math.max(r, p.coreRadius);

  // Swirl: Keplerian-ish, faster toward the core
  const omega = SWIRL_RATE * Math.sqrt(p.swirlRadius / rr) * (1 + p.heat * SWIRL_HEAT_GAIN);
  const ca = Math.cos(omega * dt), sa = Math.sin(omega * dt);
  let x = m.x * ca - m.y * sa;
  let y = m.x * sa + m.y * ca;

  // Inflow toward the core, accelerating as the mote falls
  if (p.inflow && r > 0) {
    const inflow = (INFLOW_BASE + INFLOW_PULL * (p.coreRadius * 3) / rr) * (1 + p.heat * INFLOW_HEAT_GAIN);
    const step = Math.min(inflow * dt, r);
    x -= (m.x / r) * step;
    y -= (m.y / r) * step;
  }

  // Ripple push away from the hit point while the front passes
  if (p.shock !== null) {
    const dx = m.x - p.shock.x, dy = m.y - p.shock.y;
    const d = Math.hypot(dx, dy);
    const band = (d - p.shock.front) / p.shock.width;
    if (d > 0 && Math.abs(band) < 1.5) {
      const accel = SHOCK_PUSH_ACCEL * Math.exp(-band * band) * p.shock.strength;
      m.vx += (dx / d) * accel * dt;
      m.vy += (dy / d) * accel * dt;
    }
  }

  const damping = Math.exp(-dt * PUSH_DAMPING);
  m.vx *= damping;
  m.vy *= damping;
  m.x = x + m.vx * dt;
  m.y = y + m.vy * dt;
  m.fade = Math.min(1, m.fade + dt * FADE_IN_RATE);

  return !(p.inflow && Math.hypot(m.x, m.y) < p.coreRadius * ABSORB_RADIUS);
}

// ─── AmbientDust ──────────────────────────────────────────────────────────────

export class AmbientDust {
  readonly #graphics: PIXI.Graphics;
  readonly #w: number;
  readonly #h: number;
  readonly #spawnRadius: number;
  readonly #rng: () => number;
  readonly #motes: Mote[];

  /**
   * @param parent Container to draw into (above backgrounds, below gameplay).
   * @param width  Canvas width in pixels.
   * @param height Canvas height in pixels.
   * @param rng    Random source in [0, 1); injectable for tests.
   */
  constructor(parent: PIXI.Container, width: number, height: number, rng: () => number = Math.random) {
    this.#w = width;
    this.#h = height;
    this.#rng = rng;
    this.#spawnRadius = Math.hypot(width, height) * SPAWN_RADIUS_FRAC;
    this.#graphics = new PIXI.Graphics();
    parent.addChild(this.#graphics);

    const count = Math.min(DUST_MAX, Math.max(DUST_MIN, Math.round((width * height) / DUST_AREA_PER_MOTE)));
    this.#motes = Array.from({ length: count }, () => this.#spawn(true));
  }

  /** Number of live motes. */
  get count(): number {
    return this.#motes.length;
  }

  /**
   * Advance and redraw the dust.
   * @param dt     Frame delta (s).
   * @param frame  Current atmosphere state (heat, ripple, camera).
   * @param inflow True while the Classic orb is on screen to absorb motes.
   */
  update(dt: number, frame: AtmosphereFrame, inflow: boolean): void {
    const step = Math.min(Math.max(dt, 0), MAX_STEP_S);
    const params: DustStepParams = {
      coreRadius: ORB_RADIUS,
      swirlRadius: RING_MAX_RADIUS,
      inflow,
      heat: frame.heat,
      shock: this.#shockFor(frame),
    };

    const maxRadius = this.#spawnRadius * 1.4;
    for (let i = 0; i < this.#motes.length; i++) {
      const m = this.#motes[i]!;
      const alive = stepMote(m, step, params);
      if (!alive || Math.hypot(m.x, m.y) > maxRadius) {
        this.#motes[i] = this.#spawn(false);
      }
    }

    this.#draw(frame, inflow);
  }

  destroy(): void {
    this.#graphics.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  #spawn(anywhere: boolean): Mote {
    const rng = this.#rng;
    const angle = rng() * Math.PI * 2;
    const radius = anywhere
      ? ORB_RADIUS * 2 + rng() * this.#spawnRadius
      : this.#spawnRadius * (0.9 + rng() * 0.2);
    const layer = DEPTH_LAYERS[Math.min(DEPTH_LAYERS.length - 1, Math.floor(rng() * DEPTH_LAYERS.length))]!;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      depth: layer * (0.85 + rng() * 0.3),
      fade: anywhere ? 1 : 0,
    };
  }

  #shockFor(frame: AtmosphereFrame): DustShock | null {
    if (frame.shockAge >= SHOCK_PUSH_WINDOW_S) return null;
    const strength = (1 - frame.shockAge / SHOCK_PUSH_WINDOW_S)
      * (frame.shockGood > 0.5 ? SHOCK_GOOD_STRENGTH : 1);
    return {
      x: (frame.shockX - 0.5) * this.#w,
      y: (frame.shockY - 0.5) * this.#h,
      front: frame.shockAge * SHOCK_SPEED * this.#h,
      width: SHOCK_PUSH_WIDTH_FRAC * this.#h,
      strength,
    };
  }

  #draw(frame: AtmosphereFrame, inflow: boolean): void {
    const g = this.#graphics;
    g.clear();
    const cx = this.#w / 2, cy = this.#h / 2;
    for (const m of this.#motes) {
      const r = Math.hypot(m.x, m.y);
      const absorb = Math.min(1, Math.max(0, (r - ORB_RADIUS) / (ORB_RADIUS * ABSORB_FADE_SPAN)));
      const alpha = (ALPHA_BASE + ALPHA_DEPTH * m.depth) * m.fade * absorb;
      if (alpha < 0.01) continue;
      const shift = PARALLAX_GAIN * m.depth;
      const x = cx + m.x - frame.camX * this.#w * shift;
      const y = cy + m.y - frame.camY * this.#h * shift;
      const color = inflow && absorb < WARM_THRESHOLD ? COLOR_WARM : COLOR_COOL;
      g.circle(x, y, SIZE_BASE + SIZE_DEPTH * m.depth).fill({ color, alpha });
    }
  }
}
