/**
 * VfxManager — particle bursts, screen flash overlays, and screen shake.
 *
 * Sits on two dedicated PixiJS layers:
 *   - shakeParent: backgrounds, rings, particles — displaced during screen shake
 *   - overlayParent: full-screen flash — NOT displaced by shake (no edge seam)
 *
 * All animation state is internal; callers just trigger events.
 *
 * Usage:
 *   const vfx = new VfxManager(shakeLayer, overlayLayer, W, H);
 *   vfx.spawnPerfectBurst();   // on Perfect grade
 *   vfx.spawnGoodBurst();      // on Good grade
 *   vfx.spawnMissPulse();      // on Miss grade — also triggers screen shake
 *   app.ticker.add(() => vfx.update(app.ticker.deltaMS / 1000));
 */

import * as PIXI from 'pixi.js';

// ─── Visual constants ─────────────────────────────────────────────────────────

const BURST_PARTICLE_COUNT = 10;
const GOOD_PARTICLE_COUNT  = 6;
const BURST_SPEED_MIN = 120;  // px/s
const BURST_SPEED_MAX = 220;  // px/s
const BURST_LIFETIME  = 0.38; // seconds
const GOOD_LIFETIME   = 0.26; // seconds — shorter, lighter feel
const BURST_RADIUS    = 3;    // particle dot radius (px)

const BURST_COLOR_PERFECT = 0x00ffcc; // teal
const BURST_COLOR_GOOD    = 0x88ff44; // lime

/** Pinpoint milestone burst — bigger, gold */
const MILESTONE_PARTICLE_COUNT = 22;
const MILESTONE_LIFETIME       = 0.6;
const MILESTONE_SPEED_MULT     = 1.5;
const MILESTONE_COLOR          = 0xffd34d;
const MILESTONE_FLASH_ALPHA    = 0.12;

/** Shield block — blue flash, no shake */
const SHIELD_PARTICLE_COUNT = 12;
const SHIELD_COLOR          = 0x66ccff;
const SHIELD_FLASH_ALPHA    = 0.16;

const MISS_FLASH_ALPHA_PEAK = 0.28;
const MISS_FLASH_DECAY      = 1.4;  // alpha/s
const MISS_FLASH_COLOR      = 0xff2222;

/** Screen shake on Miss — subtle, fast-decaying */
const SHAKE_INTENSITY  = 6;   // px peak displacement
const SHAKE_FREQUENCY  = 28;  // oscillations/s
const SHAKE_DECAY      = 18;  // intensity reduction per second

// ─── Internal types ───────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
}

interface ScreenFlash {
  color: number;
  alpha: number;
  decay: number;
}

interface Shake {
  intensity: number;
  elapsed: number;
}

// ─── VfxManager ───────────────────────────────────────────────────────────────

export class VfxManager {
  /** The gameplay layer — displaced by screen shake. */
  readonly #shakeLayer: PIXI.Container;
  /** Full-screen graphics layer on shakeLayer (particles). */
  readonly #g: PIXI.Graphics;
  /** Full-screen overlay on overlayParent — NOT shaken. */
  readonly #overlay: PIXI.Graphics;
  readonly #cx: number;
  readonly #cy: number;
  readonly #w: number;
  readonly #h: number;

  #particles: Particle[] = [];
  #flash: ScreenFlash | null = null;
  #shake: Shake | null = null;

  /**
   * @param shakeParent   Container for gameplay elements (will be displaced during shake).
   * @param overlayParent Separate container for the full-screen flash overlay (not shaken).
   */
  constructor(
    shakeParent: PIXI.Container,
    overlayParent: PIXI.Container,
    width: number,
    height: number,
  ) {
    this.#shakeLayer = shakeParent;
    this.#cx = width / 2;
    this.#cy = height / 2;
    this.#w  = width;
    this.#h  = height;

    // Full-screen overlay (miss flash) — on its own layer, unaffected by shake
    this.#overlay = new PIXI.Graphics();
    overlayParent.addChild(this.#overlay);

    // Particle layer — on the shake layer so particles move with the screen
    this.#g = new PIXI.Graphics();
    shakeParent.addChild(this.#g);
  }

  /**
   * Spawn a radial particle burst (Perfect grade).
   * Defaults to the orb centre; Scatter mode passes the target position.
   */
  spawnPerfectBurst(x: number = this.#cx, y: number = this.#cy): void {
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2 +
                    (Math.random() - 0.5) * 0.4;
      const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
      this.#particles.push({
        x,
        y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    BURST_LIFETIME,
        maxLife: BURST_LIFETIME,
        color:   BURST_COLOR_PERFECT,
      });
    }
  }

  /** Spawn a lighter particle burst (Good grade). Defaults to the orb centre. */
  spawnGoodBurst(x: number = this.#cx, y: number = this.#cy): void {
    for (let i = 0; i < GOOD_PARTICLE_COUNT; i++) {
      const angle = (i / GOOD_PARTICLE_COUNT) * Math.PI * 2 +
                    (Math.random() - 0.5) * 0.6;
      const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN) * 0.7;
      this.#particles.push({
        x,
        y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    GOOD_LIFETIME,
        maxLife: GOOD_LIFETIME,
        color:   BURST_COLOR_GOOD,
      });
    }
  }

  /** Large gold burst plus a soft flash for a Pinpoint streak milestone. */
  spawnMilestoneBurst(x: number, y: number): void {
    this.#radialBurst(x, y, MILESTONE_PARTICLE_COUNT, MILESTONE_LIFETIME, MILESTONE_COLOR, MILESTONE_SPEED_MULT);
    this.#flash = { color: MILESTONE_COLOR, alpha: MILESTONE_FLASH_ALPHA, decay: MISS_FLASH_DECAY };
  }

  /** Blue burst and flash when a shield absorbs a miss (no shake). */
  spawnShieldBlock(x: number, y: number): void {
    this.#radialBurst(x, y, SHIELD_PARTICLE_COUNT, GOOD_LIFETIME, SHIELD_COLOR, 1);
    this.#flash = { color: SHIELD_COLOR, alpha: SHIELD_FLASH_ALPHA, decay: MISS_FLASH_DECAY };
  }

  /** Flash the screen red and shake (Miss grade). */
  spawnMissPulse(): void {
    this.#flash = {
      color: MISS_FLASH_COLOR,
      alpha: MISS_FLASH_ALPHA_PEAK,
      decay: MISS_FLASH_DECAY,
    };
    // Restart shake (or add to existing intensity, capped)
    this.#shake = {
      intensity: SHAKE_INTENSITY,
      elapsed:   0,
    };
  }

  /** Advance animations. Call once per ticker tick. */
  update(dt: number): void {
    // Advance particles
    for (const p of this.#particles) {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.life -= dt;
    }
    for (let i = this.#particles.length - 1; i >= 0; i--) {
      if (this.#particles[i]!.life <= 0) {
        this.#particles[i] = this.#particles[this.#particles.length - 1]!;
        this.#particles.pop();
      }
    }

    // Advance screen flash
    if (this.#flash !== null) {
      this.#flash.alpha -= this.#flash.decay * dt;
      if (this.#flash.alpha <= 0) this.#flash = null;
    }

    // Advance screen shake — displaces shakeLayer only, not the overlay
    if (this.#shake !== null) {
      this.#shake.elapsed   += dt;
      this.#shake.intensity -= SHAKE_DECAY * dt;
      if (this.#shake.intensity <= 0) {
        this.#shake = null;
        this.#shakeLayer.position.set(0, 0);
      } else {
        const offset = Math.sin(this.#shake.elapsed * SHAKE_FREQUENCY * Math.PI * 2)
                       * this.#shake.intensity;
        this.#shakeLayer.position.x = offset;
        this.#shakeLayer.position.y = offset * 0.4;
      }
    }

    this.#draw();
  }

  /** Clear all active effects immediately (call when ending a session). */
  reset(): void {
    this.#particles = [];
    this.#flash     = null;
    this.#shake     = null;
    this.#shakeLayer.position.set(0, 0);
    this.#overlay.clear();
    this.#g.clear();
  }

  destroy(): void {
    this.#shakeLayer.position.set(0, 0);
    this.#g.destroy();
    this.#overlay.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  #radialBurst(x: number, y: number, count: number, lifetime: number, color: number, speedMult: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = (BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN)) * speedMult;
      this.#particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: lifetime,
        maxLife: lifetime,
        color,
      });
    }
  }

  #draw(): void {
    // Screen flash overlay (on separate non-shaken layer)
    this.#overlay.clear();
    if (this.#flash !== null) {
      this.#overlay
        .rect(0, 0, this.#w, this.#h)
        .fill({ color: this.#flash.color, alpha: this.#flash.alpha });
    }

    // Particles (on shake layer)
    this.#g.clear();
    for (const p of this.#particles) {
      const progress = 1 - p.life / p.maxLife;
      const alpha    = 1 - progress;
      const radius   = BURST_RADIUS * (1 + progress * 0.5);
      this.#g.circle(p.x, p.y, radius).fill({ color: p.color, alpha });
    }
  }
}
