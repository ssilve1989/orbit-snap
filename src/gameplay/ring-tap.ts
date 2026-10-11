import {
  ORB_RADIUS, RING_MAX_RADIUS, ACCEL,
  PERFECT_WINDOW, GOOD_WINDOW, AUTO_MISS_BUFFER, TAP_LATENCY_MS,
} from '../config.js';
import type { DifficultyState } from './difficulty-progression.js';

export type RingStatus = 'PENDING' | 'ACTIVE' | 'HIT' | 'MISSED';
export type Grade = 'PERFECT' | 'GOOD' | 'MISS';

/** Read-only ring snapshot exposed to the renderer. */
export interface RingState {
  readonly id: number;
  readonly radius: number;
  readonly spawnDelay: number;
  readonly state: RingStatus;
}

export interface RingResolvedEvent {
  readonly grade: Grade;
  readonly ringId: number;
  readonly timestamp: number;
}

/** Mutable internal representation — never exposed outside this module. */
interface MutableRing {
  id: number;
  radius: number;
  spawnDelay: number;
  state: RingStatus;
  /** Base convergence speed for this ring (px/s), randomised at spawn. */
  speed: number;
}

const AUTO_MISS_THRESHOLD = ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER;

/**
 * Core timing mechanic. Manages ring spawning, convergence, and grade resolution.
 * Implements S1 Ring Tap GDD.
 */
export class RingTap {
  #rings: MutableRing[] = [];
  #state: 'WAITING' | 'ACTIVE' = 'WAITING';
  #ringIdCounter = 0;
  #difficultyState: DifficultyState | null = null;
  #tapProcessedThisFrame = false;
  #ringResolvedListeners: Array<(event: RingResolvedEvent) => void> = [];
  #roundEndListeners: Array<() => void> = [];

  /**
   * Advance simulation by dt seconds. Call once per ticker tick.
   * Resets the per-frame tap guard at the start of each call.
   */
  update(dt: number): void {
    this.#tapProcessedThisFrame = false;

    if (this.#state !== 'ACTIVE' || this.#difficultyState === null) return;

    for (const ring of this.#rings) {
      if (ring.state === 'PENDING') {
        ring.spawnDelay -= dt * 1000;
        if (ring.spawnDelay <= 0) {
          ring.spawnDelay = 0;
          ring.state = 'ACTIVE';
        }
        continue;
      }

      if (ring.state === 'ACTIVE') {
        ring.radius -= RingTap.computeRingSpeed(ring.radius, ring.speed) * dt;

        if (ring.radius <= AUTO_MISS_THRESHOLD) {
          this.#resolveRing(ring, 'MISS');
        }
      }
    }

    const allResolved =
      this.#rings.length > 0 &&
      this.#rings.every(r => r.state === 'HIT' || r.state === 'MISSED');

    if (allResolved) {
      this.#state = 'WAITING';
      for (const fn of this.#roundEndListeners) fn();
    }
  }

  /**
   * Process a player tap. Only the first tap per update() interval is processed;
   * subsequent calls are discarded until the next frame.
   */
  onTap(timestamp = Date.now()): void {
    if (this.#tapProcessedThisFrame) return;
    if (this.#state !== 'ACTIVE') return;

    this.#tapProcessedThisFrame = true;

    // Exclude rings past the auto-miss threshold (GDD: auto-miss takes priority)
    const candidates = this.#rings.filter(
      r => r.state === 'ACTIVE' && r.radius > AUTO_MISS_THRESHOLD,
    );

    if (candidates.length === 0) return;

    // Closest ring to ORB_RADIUS wins; ties broken by spawn order (lowest id)
    candidates.sort((a, b) => {
      const dA = Math.abs(RingTap.#perceivedRadius(a) - ORB_RADIUS);
      const dB = Math.abs(RingTap.#perceivedRadius(b) - ORB_RADIUS);
      return dA !== dB ? dA - dB : a.id - b.id;
    });

    const target = candidates[0];
    if (target === undefined) return;

    const delta = Math.abs(RingTap.#perceivedRadius(target) - ORB_RADIUS);

    let grade: Grade;
    if (delta <= PERFECT_WINDOW) grade = 'PERFECT';
    else if (delta <= GOOD_WINDOW) grade = 'GOOD';
    else grade = 'MISS';

    this.#resolveRing(target, grade, timestamp);
  }

  /** Spawn rings for a new round. Transitions state to ACTIVE. */
  startRound(difficultyState: DifficultyState): void {
    let { ringCount } = difficultyState;
    if (ringCount < 1) {
      console.warn(`RingTap: invalid ringCount ${ringCount}, defaulting to 1`);
      ringCount = 1;
    }

    this.#difficultyState = difficultyState;
    this.#rings = [];

    const { ringSpeed, ringSpeedVariance } = difficultyState;
    for (let i = 0; i < ringCount; i++) {
      const spawnDelay = i * difficultyState.staggerMs;
      const variance   = (Math.random() * 2 - 1) * ringSpeedVariance;
      this.#rings.push({
        id: this.#ringIdCounter++,
        radius: RING_MAX_RADIUS,
        spawnDelay,
        state: spawnDelay === 0 ? 'ACTIVE' : 'PENDING',
        speed: Math.max(ringSpeed + variance, 1),
      });
    }

    this.#state = 'ACTIVE';
  }

  /** Reset all state for a new session. */
  reset(): void {
    this.#rings = [];
    this.#state = 'WAITING';
    this.#ringIdCounter = 0;
    this.#difficultyState = null;
    this.#tapProcessedThisFrame = false;
  }

  /**
   * Register a listener for ring resolution events.
   * @returns Unsubscribe function
   */
  onRingResolved(fn: (event: RingResolvedEvent) => void): () => void {
    this.#ringResolvedListeners.push(fn);
    return () => {
      this.#ringResolvedListeners = this.#ringResolvedListeners.filter(l => l !== fn);
    };
  }

  /**
   * Register a listener called when all rings in a round are resolved.
   * @returns Unsubscribe function
   */
  onRoundEnd(fn: () => void): () => void {
    this.#roundEndListeners.push(fn);
    return () => {
      this.#roundEndListeners = this.#roundEndListeners.filter(l => l !== fn);
    };
  }

  /** Read-only snapshot of all ring states for the renderer. */
  get rings(): readonly RingState[] {
    return this.#rings as readonly RingState[];
  }

  get state(): 'WAITING' | 'ACTIVE' {
    return this.#state;
  }

  /**
   * Computes ring convergence speed at a given radius.
   * Formula: ringSpeed(d) = baseSpeed + ACCEL × (1 − d / RING_MAX_RADIUS)
   * Exposed as static for unit-testable formula verification.
   */
  static computeRingSpeed(radius: number, baseSpeed: number): number {
    return baseSpeed + ACCEL * (1 - radius / RING_MAX_RADIUS);
  }

  /** Ring radius TAP_LATENCY_MS ago — what the player was looking at when they tapped. */
  static #perceivedRadius(ring: MutableRing): number {
    return ring.radius + RingTap.computeRingSpeed(ring.radius, ring.speed) * TAP_LATENCY_MS / 1000;
  }

  #resolveRing(ring: MutableRing, grade: Grade, timestamp = Date.now()): void {
    ring.state = grade === 'MISS' ? 'MISSED' : 'HIT';
    const event: RingResolvedEvent = { grade, ringId: ring.id, timestamp };
    for (const fn of this.#ringResolvedListeners) fn(event);
  }
}
