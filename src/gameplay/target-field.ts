import {
  TARGET_RADIUS, TARGET_HIT_RADIUS_MULT, SCATTER_AUTO_MISS_MS,
  TARGET_EDGE_MARGIN, TARGET_TOP_MARGIN, TARGET_MIN_SPACING, TARGET_PLACEMENT_ATTEMPTS,
} from '../config.js';
import type { Grade } from './ring-tap.js';
import type { WaveParams } from './wave-progression.js';

/** Read-only snapshot of a live target, exposed to the renderer. */
export interface TargetState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Total approach duration for this target (ms). */
  readonly approachMs: number;
  /** Milliseconds until the ideal hit moment. Negative once late. */
  readonly timeToHit: number;
}

export interface TargetResolvedEvent {
  readonly grade: Grade;
  readonly targetId: number;
  readonly x: number;
  readonly y: number;
  /** Signed timing error (ms): positive = early, negative = late. */
  readonly offsetMs: number;
  /** True when resolved by timing out rather than a tap. */
  readonly auto: boolean;
  readonly timestamp: number;
}

/** Timing/tap rules that power-ups may modify. */
export interface TimingRules {
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly approachMult: number;
  readonly hitRadiusMult: number;
}

/** Playfield dimensions in canvas pixels. */
export interface FieldBounds {
  readonly width: number;
  readonly height: number;
}

interface MutableTarget {
  id: number;
  x: number;
  y: number;
  approachMs: number;
  timeToHit: number;
}

/**
 * Field states:
 *   IDLE   — no wave running; taps ignored.            → ACTIVE via startWave()
 *   ACTIVE — spawning and/or live targets remain.      → IDLE when all spawned + resolved (emits waveEnd)
 */
export type FieldState = 'IDLE' | 'ACTIVE';

/**
 * Scatter mode core: places targets at random positions on a staggered timer and
 * grades taps by how close they land to each target's hit moment.
 * Implements S7 Target Field (design/gdd/scatter-mode.md).
 */
export class TargetField {
  readonly #bounds: FieldBounds;
  readonly #rng: () => number;

  #state: FieldState = 'IDLE';
  #targets: MutableTarget[] = [];
  #idCounter = 0;
  #toSpawn = 0;
  #spawnTimer = 0;
  #wave: WaveParams | null = null;
  #rules: TimingRules;
  #resolvedListeners: Array<(e: TargetResolvedEvent) => void> = [];
  #waveEndListeners: Array<() => void> = [];

  /**
   * @param bounds Playfield size in px.
   * @param rules  Initial timing rules.
   * @param rng    Uniform [0,1) source — inject a seeded function for tests.
   */
  constructor(bounds: FieldBounds, rules: TimingRules, rng: () => number = Math.random) {
    this.#bounds = bounds;
    this.#rules = rules;
    this.#rng = rng;
  }

  /** Begin spawning a wave. Live targets from a previous wave are discarded. */
  startWave(params: WaveParams): void {
    this.#wave = params;
    this.#targets = [];
    this.#toSpawn = Math.max(0, params.targetCount);
    this.#spawnTimer = params.leadInMs;
    this.#state = 'ACTIVE';
  }

  /** Replace timing rules (applies to grading immediately, approach on next spawn). */
  setRules(rules: TimingRules): void {
    this.#rules = rules;
  }

  /** Advance the simulation by dt seconds. */
  update(dt: number): void {
    if (this.#state !== 'ACTIVE' || this.#wave === null) return;
    const dtMs = dt * 1000;

    for (const t of this.#targets) t.timeToHit -= dtMs;

    // Spawn — loop so a long frame can catch up on several due spawns
    this.#spawnTimer -= dtMs;
    while (this.#toSpawn > 0 && this.#spawnTimer <= 0) {
      const overshoot = -this.#spawnTimer;
      this.#spawn(overshoot);
      this.#toSpawn--;
      const jitter = 1 + this.#wave.spawnJitter * (this.#rng() * 2 - 1);
      this.#spawnTimer += this.#wave.spawnIntervalMs * jitter;
    }

    // Auto-miss anything past the late grace window
    // Listeners may reset() the field mid-loop (e.g. on game over) — stop if so
    const lateLimit = -(this.#rules.goodMs + SCATTER_AUTO_MISS_MS);
    for (const t of [...this.#targets]) {
      if (this.#state !== 'ACTIVE') return;
      if (t.timeToHit < lateLimit) this.#resolve(t, 'MISS', true, performance.now());
    }

    if (this.#state === 'ACTIVE' && this.#toSpawn === 0 && this.#targets.length === 0) {
      this.#state = 'IDLE';
      for (const fn of this.#waveEndListeners) fn();
    }
  }

  /**
   * Tap at a playfield position. Among targets whose hit area contains the point,
   * the one closest to its hit moment is graded.
   * @returns The resolution event, or null if the tap touched no target.
   */
  tap(x: number, y: number, timestamp: number = performance.now()): TargetResolvedEvent | null {
    if (this.#state !== 'ACTIVE') return null;
    const r = this.hitRadius;
    let best: MutableTarget | null = null;
    for (const t of this.#targets) {
      if (Math.hypot(t.x - x, t.y - y) > r) continue;
      if (best === null || Math.abs(t.timeToHit) < Math.abs(best.timeToHit)) best = t;
    }
    return best === null ? null : this.#grade(best, timestamp);
  }

  /**
   * Position-free tap (keyboard fallback): grades the target closest to its hit moment.
   * @returns The resolution event, or null if no targets are live.
   */
  tapMostUrgent(timestamp: number = performance.now()): TargetResolvedEvent | null {
    if (this.#state !== 'ACTIVE') return null;
    let best: MutableTarget | null = null;
    for (const t of this.#targets) {
      if (best === null || Math.abs(t.timeToHit) < Math.abs(best.timeToHit)) best = t;
    }
    return best === null ? null : this.#grade(best, timestamp);
  }

  /** Clear everything for a new run. */
  reset(): void {
    this.#state = 'IDLE';
    this.#targets = [];
    this.#idCounter = 0;
    this.#toSpawn = 0;
    this.#spawnTimer = 0;
    this.#wave = null;
  }

  /**
   * Register a listener for target resolutions (taps and auto-misses).
   * @returns Unsubscribe function
   */
  onTargetResolved(fn: (e: TargetResolvedEvent) => void): () => void {
    this.#resolvedListeners.push(fn);
    return () => { this.#resolvedListeners = this.#resolvedListeners.filter(l => l !== fn); };
  }

  /**
   * Register a listener called once all of a wave's targets are spawned and resolved.
   * @returns Unsubscribe function
   */
  onWaveEnd(fn: () => void): () => void {
    this.#waveEndListeners.push(fn);
    return () => { this.#waveEndListeners = this.#waveEndListeners.filter(l => l !== fn); };
  }

  /** Live (unresolved) targets. */
  get targets(): readonly TargetState[] { return this.#targets; }

  get state(): FieldState { return this.#state; }

  /** Targets still waiting to spawn this wave. */
  get remainingToSpawn(): number { return this.#toSpawn; }

  /** Current tap hit radius (px), including power-up modifiers. */
  get hitRadius(): number {
    return TARGET_RADIUS * TARGET_HIT_RADIUS_MULT * this.#rules.hitRadiusMult;
  }

  /**
   * Grade formula on absolute timing error |e| (ms):
   *   |e| ≤ perfectMs → PERFECT, |e| ≤ goodMs → GOOD, else MISS.
   */
  static gradeFor(errorMs: number, rules: Pick<TimingRules, 'perfectMs' | 'goodMs'>): Grade {
    const e = Math.abs(errorMs);
    if (e <= rules.perfectMs) return 'PERFECT';
    if (e <= rules.goodMs) return 'GOOD';
    return 'MISS';
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  #grade(t: MutableTarget, timestamp: number): TargetResolvedEvent {
    return this.#resolve(t, TargetField.gradeFor(t.timeToHit, this.#rules), false, timestamp);
  }

  #resolve(t: MutableTarget, grade: Grade, auto: boolean, timestamp: number): TargetResolvedEvent {
    this.#targets = this.#targets.filter(o => o !== t);
    const event: TargetResolvedEvent = {
      grade, targetId: t.id, x: t.x, y: t.y, offsetMs: t.timeToHit, auto, timestamp,
    };
    for (const fn of this.#resolvedListeners) fn(event);
    return event;
  }

  #spawn(overshootMs: number): void {
    if (this.#wave === null) return;
    const { x, y } = this.#placeTarget();
    const approachMs = this.#wave.approachMs * this.#rules.approachMult;
    this.#targets.push({
      id: this.#idCounter++,
      x, y,
      approachMs,
      timeToHit: approachMs - overshootMs,
    });
  }

  /** Random placement that prefers positions far from live targets. */
  #placeTarget(): { x: number; y: number } {
    const { width, height } = this.#bounds;
    const minX = TARGET_EDGE_MARGIN;
    const maxX = Math.max(minX, width - TARGET_EDGE_MARGIN);
    const minY = Math.min(TARGET_TOP_MARGIN, height / 2);
    const maxY = Math.max(minY, height - TARGET_EDGE_MARGIN);

    let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    let bestSpacing = -1;
    for (let i = 0; i < TARGET_PLACEMENT_ATTEMPTS; i++) {
      const candidate = {
        x: minX + this.#rng() * (maxX - minX),
        y: minY + this.#rng() * (maxY - minY),
      };
      let spacing = Infinity;
      for (const t of this.#targets) {
        spacing = Math.min(spacing, Math.hypot(t.x - candidate.x, t.y - candidate.y));
      }
      if (spacing > bestSpacing) {
        best = candidate;
        bestSpacing = spacing;
      }
      if (spacing >= TARGET_MIN_SPACING) break;
    }
    return best;
  }
}
