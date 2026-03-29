/**
 * VfxManager — particle bursts, screen flash overlays, and screen shake.
 *
 * Sits on a dedicated PixiJS layer above GameRenderer.
 * All animation state is internal; callers just trigger events.
 *
 * Usage:
 *   const vfx = new VfxManager(app.stage, W, H);
 *   vfx.spawnPerfectBurst();   // on Perfect grade
 *   vfx.spawnMissPulse();      // on Miss grade — also triggers screen shake
 *   app.ticker.add(() => vfx.update(app.ticker.deltaMS / 1000));
 */

import * as PIXI from 'pixi.js';

// ─── Visual constants ─────────────────────────────────────────────────────────

const BURST_PARTICLE_COUNT = 10;
const BURST_SPEED_MIN = 120;  // px/s
const BURST_SPEED_MAX = 220;  // px/s
const BURST_LIFETIME  = 0.38; // seconds
const BURST_RADIUS    = 3;    // particle dot radius (px)
const BURST_COLOR     = 0x00ffcc;

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
  readonly #stage: PIXI.Container;
  readonly #g: PIXI.Graphics;
  readonly #overlay: PIXI.Graphics;
  readonly #cx: number;
  readonly #cy: number;
  readonly #w: number;
  readonly #h: number;

  #particles: Particle[] = [];
  #flash: ScreenFlash | null = null;
  #shake: Shake | null = null;

  constructor(parent: PIXI.Container, width: number, height: number) {
    this.#stage = parent;
    this.#cx = width / 2;
    this.#cy = height / 2;
    this.#w  = width;
    this.#h  = height;

    // Full-screen overlay (miss flash) — drawn first so it sits under particles
    this.#overlay = new PIXI.Graphics();
    parent.addChild(this.#overlay);

    // Particle layer
    this.#g = new PIXI.Graphics();
    parent.addChild(this.#g);
  }

  /** Spawn a radial particle burst at the orb centre (Perfect grade). */
  spawnPerfectBurst(): void {
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2 +
                    (Math.random() - 0.5) * 0.4;
      const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
      this.#particles.push({
        x:       this.#cx,
        y:       this.#cy,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    BURST_LIFETIME,
        maxLife: BURST_LIFETIME,
      });
    }
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
    this.#particles = this.#particles.filter(p => p.life > 0);

    // Advance screen flash
    if (this.#flash !== null) {
      this.#flash.alpha -= this.#flash.decay * dt;
      if (this.#flash.alpha <= 0) this.#flash = null;
    }

    // Advance screen shake
    if (this.#shake !== null) {
      this.#shake.elapsed   += dt;
      this.#shake.intensity -= SHAKE_DECAY * dt;
      if (this.#shake.intensity <= 0) {
        this.#shake = null;
        this.#stage.position.set(0, 0);
      } else {
        const offset = Math.sin(this.#shake.elapsed * SHAKE_FREQUENCY * Math.PI * 2)
                       * this.#shake.intensity;
        this.#stage.position.x = offset;
        this.#stage.position.y = offset * 0.4;
      }
    }

    this.#draw();
  }

  destroy(): void {
    this.#stage.position.set(0, 0);
    this.#g.destroy();
    this.#overlay.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  #draw(): void {
    // Screen flash overlay
    this.#overlay.clear();
    if (this.#flash !== null) {
      this.#overlay
        .rect(0, 0, this.#w, this.#h)
        .fill({ color: this.#flash.color, alpha: this.#flash.alpha });
    }

    // Particles
    this.#g.clear();
    for (const p of this.#particles) {
      const progress = 1 - p.life / p.maxLife;
      const alpha    = 1 - progress;
      const radius   = BURST_RADIUS * (1 + progress * 0.5);
      this.#g.circle(p.x, p.y, radius).fill({ color: BURST_COLOR, alpha });
    }
  }
}
