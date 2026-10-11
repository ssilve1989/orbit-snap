/**
 * TargetRenderer — draws Scatter mode targets, their approach rings, resolve
 * fades, whiff ripples, and floating text labels.
 * Visual layer for S7 Target Field (design/gdd/scatter-mode.md).
 *
 * Call draw() once per ticker tick with TargetField.targets. Resolution effects
 * are pushed in by the caller (addResolve / addLabel / addWhiff) because resolved
 * targets leave the field's live list immediately.
 */

import * as PIXI from 'pixi.js';
import { TARGET_RADIUS, TARGET_RING_START_OFFSET } from '../config.js';
import type { Grade } from '../gameplay/ring-tap.js';
import type { TargetState } from '../gameplay/target-field.js';
import { GRADE_COLOR } from './game-renderer.js';

// ─── Visual constants (presentation layer — not gameplay tuning knobs) ────────

const RING_STROKE_WIDTH = 3;
const CORE_STROKE_WIDTH = 3;
const CORE_FILL_ALPHA = 0.1;
const CORE_STROKE_ALPHA = 0.9;
/** Time over which a freshly spawned target fades in (ms). */
const SPAWN_FADE_MS = 160;

/** Approach ring trail: echoes behind the closing ring (matches the Classic ring trail). */
const TRAIL_ECHOES = 3;
const TRAIL_STEP_MS = 50;
const TRAIL_ALPHA = 0.2;
const TRAIL_WIDTH_FALLOFF = 0.2;

/** Resolve ring: starts at the target radius and expands while fading. */
const RESOLVE_START_ALPHA = 0.8;
const RESOLVE_FADE_RATE = 2.6;   // alpha/s
const RESOLVE_GROW_RATE = 60;    // px/s

/** Whiff ripple for taps that touch no target. */
const WHIFF_START_RADIUS = 6;
const WHIFF_START_ALPHA = 0.35;
const WHIFF_FADE_RATE = 2.4;
const WHIFF_GROW_RATE = 90;

/** Floating labels rise and fade. */
const LABEL_RISE_SPEED = 38;     // px/s
const LABEL_LIFETIME = 0.75;     // seconds
const LABEL_FONT = 'monospace';

const SHIELD_COLOR = 0x66ccff;

// ─── Internal types ───────────────────────────────────────────────────────────

interface RingFx {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: number;
  grow: number;
  fade: number;
}

interface LabelFx {
  text: PIXI.Text;
  life: number;
}

/** Label styling options. */
export interface LabelOptions {
  readonly color?: number;
  readonly size?: number;
  /** Seconds to wait before the label starts rising/fading. */
  readonly delay?: number;
}

// ─── TargetRenderer ───────────────────────────────────────────────────────────

export class TargetRenderer {
  readonly #graphics: PIXI.Graphics;
  readonly #labelLayer: PIXI.Container;
  #rings: RingFx[] = [];
  #labels: LabelFx[] = [];

  /** @param parent Container to add the target layers to (above backgrounds). */
  constructor(parent: PIXI.Container) {
    this.#graphics = new PIXI.Graphics();
    this.#labelLayer = new PIXI.Container();
    parent.addChild(this.#graphics);
    parent.addChild(this.#labelLayer);
  }

  /**
   * Redraw all targets for the current frame and advance effects.
   * @param targets Live targets from TargetField.targets.
   * @param dt      Frame delta time in seconds.
   */
  draw(targets: readonly TargetState[], dt: number): void {
    this.#advance(dt);

    const g = this.#graphics;
    g.clear();

    for (const fx of this.#rings) {
      g.circle(fx.x, fx.y, fx.radius).stroke({ width: RING_STROKE_WIDTH, color: fx.color, alpha: fx.alpha });
    }

    // Draw the most urgent target last so it sits on top of any overlap
    const ordered = [...targets].sort((a, b) => b.timeToHit - a.timeToHit);
    for (const t of ordered) this.#drawTarget(g, t);
  }

  /** Spawn the resolve ring and grade label for a resolved target. */
  addResolve(x: number, y: number, grade: Grade, subLabel?: string): void {
    const color = GRADE_COLOR[grade];
    this.#rings.push({
      x, y, radius: TARGET_RADIUS, alpha: RESOLVE_START_ALPHA, color,
      grow: RESOLVE_GROW_RATE, fade: RESOLVE_FADE_RATE,
    });
    this.addLabel(x, y - TARGET_RADIUS - 14, grade, { color, size: 16 });
    if (subLabel !== undefined) {
      this.addLabel(x, y - TARGET_RADIUS + 4, subLabel, { color: 0xaaaaaa, size: 11 });
    }
  }

  /** Blue ring for a shield-absorbed miss. */
  addShieldBlock(x: number, y: number): void {
    this.#rings.push({
      x, y, radius: TARGET_RADIUS, alpha: RESOLVE_START_ALPHA, color: SHIELD_COLOR,
      grow: RESOLVE_GROW_RATE * 1.6, fade: RESOLVE_FADE_RATE,
    });
    this.addLabel(x, y - TARGET_RADIUS - 14, 'BLOCKED', { color: SHIELD_COLOR, size: 16 });
  }

  /** Faint ripple where a tap touched nothing. */
  addWhiff(x: number, y: number): void {
    this.#rings.push({
      x, y, radius: WHIFF_START_RADIUS, alpha: WHIFF_START_ALPHA, color: 0xffffff,
      grow: WHIFF_GROW_RATE, fade: WHIFF_FADE_RATE,
    });
  }

  /** Floating text that rises and fades out. */
  addLabel(x: number, y: number, text: string, opts: LabelOptions = {}): void {
    const label = new PIXI.Text({
      text,
      style: {
        fontFamily: LABEL_FONT,
        fontSize: opts.size ?? 14,
        fontWeight: 'bold',
        fill: opts.color ?? 0xffffff,
        letterSpacing: 2,
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.#labelLayer.addChild(label);
    this.#labels.push({ text: label, life: LABEL_LIFETIME + (opts.delay ?? 0) });
  }

  /** Clear all targets and effects (call when leaving the mode). */
  clear(): void {
    this.#graphics.clear();
    this.#rings = [];
    for (const l of this.#labels) l.text.destroy();
    this.#labels = [];
  }

  destroy(): void {
    this.clear();
    this.#graphics.destroy();
    this.#labelLayer.destroy();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  #drawTarget(g: PIXI.Graphics, t: TargetState): void {
    const elapsed = t.approachMs - t.timeToHit;
    const fadeIn = Math.min(1, Math.max(0, elapsed / SPAWN_FADE_MS));
    const progress = Math.min(1, Math.max(0, 1 - t.timeToHit / t.approachMs));
    const ringRadius = TARGET_RADIUS + (1 - progress) * TARGET_RING_START_OFFSET;

    // Core disc
    g.circle(t.x, t.y, TARGET_RADIUS).fill({ color: 0xffffff, alpha: CORE_FILL_ALPHA * fadeIn });
    g.circle(t.x, t.y, TARGET_RADIUS)
      .stroke({ width: CORE_STROKE_WIDTH, color: 0xffffff, alpha: CORE_STROKE_ALPHA * fadeIn });

    // Approach ring — white when fresh, warm orange near the hit moment (matches S1)
    const color = approachColor(progress);
    if (progress < 1) {
      const closingPxPerMs = TARGET_RING_START_OFFSET / t.approachMs;
      for (let k = TRAIL_ECHOES; k >= 1; k--) {
        g.circle(t.x, t.y, ringRadius + closingPxPerMs * TRAIL_STEP_MS * k).stroke({
          width: RING_STROKE_WIDTH * (1 - k * TRAIL_WIDTH_FALLOFF),
          color,
          alpha: (TRAIL_ALPHA / k) * fadeIn,
        });
      }
    }
    g.circle(t.x, t.y, ringRadius)
      .stroke({ width: RING_STROKE_WIDTH, color, alpha: fadeIn });
  }

  #advance(dt: number): void {
    for (const fx of this.#rings) {
      fx.radius += fx.grow * dt;
      fx.alpha -= fx.fade * dt;
    }
    this.#rings = this.#rings.filter(fx => fx.alpha > 0);

    for (const l of this.#labels) {
      l.life -= dt;
      if (l.life < LABEL_LIFETIME) {
        l.text.y -= LABEL_RISE_SPEED * dt;
        l.text.alpha = Math.max(0, l.life / LABEL_LIFETIME);
      }
    }
    const expired = this.#labels.filter(l => l.life <= 0);
    for (const l of expired) l.text.destroy();
    this.#labels = this.#labels.filter(l => l.life > 0);
  }
}

/** White (t=0) → warm orange 0xff7300 (t=1); same ramp as the classic ring. */
function approachColor(t: number): number {
  const gVal = Math.round(255 * (1 - t * 0.55));
  const b = Math.round(255 * (1 - t));
  return (255 << 16) | (gVal << 8) | b;
}
