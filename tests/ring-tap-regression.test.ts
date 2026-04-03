/**
 * Regression tests for BUG-001: Red flash on return to title
 *
 * These tests verify that taps during phase transitions and at ring spawn
 * time are handled correctly to prevent spurious MISS grades.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RingTap } from '../src/gameplay/ring-tap.js';
import type { DifficultyState } from '../src/gameplay/difficulty-progression.js';
import {
  ORB_RADIUS, RING_MAX_RADIUS,
  PERFECT_WINDOW, GOOD_WINDOW, AUTO_MISS_BUFFER,
  BASE_RING_SPEED,
} from '../src/config.js';

const AUTO_MISS_THRESHOLD = ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER;

const DEFAULT_STATE: DifficultyState = {
  level: 0,
  ringCount: 1,
  ringSpeed: BASE_RING_SPEED,
  ringSpeedVariance: 0,
  staggerMs: 550,
  isLooping: false,
  interRoundMs: 1200,
};

describe('RingTap — Regression: BUG-001 spawn-phase input handling', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  // ─── Scenario A: Tap immediately after startRound() with ring at MAX_RADIUS

  it('tap immediately after startRound() on ring at RING_MAX_RADIUS emits MISS', () => {
    // BUG-001 hypothesis: A tap in the same frame as startRound() completion
    // fires on a ring at RING_MAX_RADIUS, which is ~233px away from ORB_RADIUS.
    // This distance exceeds GOOD_WINDOW, so it grades as MISS.

    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));

    rt.startRound(DEFAULT_STATE);
    const spawnedRing = rt.rings[0];
    expect(spawnedRing?.radius).toBe(RING_MAX_RADIUS);
    expect(spawnedRing?.state).toBe('ACTIVE');

    // Tap immediately, no update() call (same frame)
    rt.onTap(0);

    // CURRENT (BUG) BEHAVIOR: Event is emitted with grade MISS
    expect(events).toHaveLength(1);
    expect(events[0]?.grade).toBe('MISS');

    // Ring is resolved to MISSED state
    expect(rt.rings[0]?.state).toBe('MISSED');
  });

  // ─── Scenario B: Verify the distance calculation at spawn

  it('ring at RING_MAX_RADIUS has delta > GOOD_WINDOW from ORB_RADIUS', () => {
    // The distance from RING_MAX_RADIUS to ORB_RADIUS should exceed GOOD_WINDOW.
    // This confirms why a spawn-time tap would grade as MISS.

    const delta = Math.abs(RING_MAX_RADIUS - ORB_RADIUS);
    expect(delta).toBeGreaterThan(GOOD_WINDOW);

    // Specifically: 265 - 32 = 233, which is >> GOOD_WINDOW (22)
    expect(delta).toBe(233);
  });

  // ─── Scenario C: Back-to-back startRound() calls without reset()

  it('two consecutive startRound() calls can emit taps on second round immediately', () => {
    // Simulate: endSession() → startSession() → startNextRound()
    // Then immediately after, startNextRound() again (for the next round).
    // Both rounds can receive taps.

    const events: Array<{ grade: string; ringId: number }> = [];
    rt.onRingResolved(e => events.push(e));

    // First round
    rt.startRound(DEFAULT_STATE);
    rt.onTap(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.grade).toBe('MISS');

    // Advance past resolution to WAITING
    rt.update(10);
    expect(rt.state).toBe('WAITING');

    // Second round
    events.length = 0;
    rt.startRound(DEFAULT_STATE);
    rt.onTap(0);

    // Second tap also grades as MISS because ring is at spawn radius
    expect(events).toHaveLength(1);
    expect(events[0]?.grade).toBe('MISS');
  });

  // ─── Scenario D: Tap after minimal convergence time

  it('tap after 10ms of convergence (minimal movement) on ring still far from ORB', () => {
    // Even with 10ms of convergence, the ring barely moves.
    // It should still be far from ORB_RADIUS, grading as MISS.

    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));

    rt.startRound(DEFAULT_STATE);
    const radiusBeforeUpdate = rt.rings[0]?.radius ?? 0;

    // Small update to simulate minimal time passage
    rt.update(10 / 1000); // 10ms in seconds
    const radiusAfterUpdate = rt.rings[0]?.radius ?? 0;

    // Ring should have moved a little bit (but not much)
    const movement = radiusBeforeUpdate - radiusAfterUpdate;
    expect(movement).toBeGreaterThan(0);
    expect(movement).toBeLessThan(5); // 10ms at ~115 px/s = ~1.15 px

    // But it's still very close to RING_MAX_RADIUS, far from ORB_RADIUS
    expect(radiusAfterUpdate).toBeCloseTo(RING_MAX_RADIUS - movement);

    // Tap now
    rt.onTap(0);

    // Should still be MISS (delta still >> GOOD_WINDOW)
    expect(events).toHaveLength(1);
    expect(events[0]?.grade).toBe('MISS');
  });

  // ─── Scenario E: Multiple rings, tap on first ring at spawn

  it('tap at spawn with 2-ring stagger emits MISS on first ring only', () => {
    const events: Array<{ grade: string; ringId: number }> = [];
    rt.onRingResolved(e => events.push(e));

    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 550 });

    const ring0 = rt.rings[0];
    const ring1 = rt.rings[1];
    expect(ring0?.state).toBe('ACTIVE');
    expect(ring1?.state).toBe('PENDING');

    // Tap immediately (before any update, before ring 1 spawns)
    rt.onTap(0);

    // Only ring 0 should be resolved (ring 1 is still PENDING)
    expect(events).toHaveLength(1);
    expect(events[0]?.ringId).toBe(ring0?.id);
    expect(events[0]?.grade).toBe('MISS');

    // Ring 1 should still be PENDING
    expect(rt.rings[1]?.state).toBe('PENDING');
  });

  // ─── Scenario F: Reject ring from candidates if still at spawn radius

  it('ring barely past spawn (convergence < 5px) still has delta > GOOD_WINDOW', () => {
    // To help design a fix: even if we only reject taps that fire
    // within X milliseconds of spawn, the ring barely moves in that time.
    // Verify the math: at BASE_RING_SPEED (115 px/s), how long to move 50px?
    // time = 50 / 115 ≈ 435ms
    // So within 400ms, the ring moves < 50px, staying > 180px from ORB.

    const ringSpeed = BASE_RING_SPEED;
    const timeTo50pxMs = (50 / ringSpeed) * 1000;
    expect(timeTo50pxMs).toBeGreaterThan(400); // Takes > 400ms to move 50px

    const timeTo100pxMs = (100 / ringSpeed) * 1000;
    expect(timeTo100pxMs).toBeGreaterThan(800);

    // After 400ms, ring has moved ~46px, is at radius ~219px
    const radiusAfter400ms = RING_MAX_RADIUS - (ringSpeed * 400 / 1000);
    expect(radiusAfter400ms).toBeCloseTo(219);

    // Distance from ORB_RADIUS is still ~187px
    const deltaAfter400ms = Math.abs(radiusAfter400ms - ORB_RADIUS);
    expect(deltaAfter400ms).toBeCloseTo(187);

    // This is still >> GOOD_WINDOW (22)
    expect(deltaAfter400ms).toBeGreaterThan(GOOD_WINDOW);
  });

  // ─── Scenario G: Verify state machine transitions

  it('RingTap state transitions from WAITING → ACTIVE → WAITING', () => {
    expect(rt.state).toBe('WAITING');

    rt.startRound(DEFAULT_STATE);
    expect(rt.state).toBe('ACTIVE');

    // Advance to auto-miss
    for (let i = 0; i < 1000; i++) {
      if (rt.state === 'WAITING') break;
      rt.update(1 / 240);
    }
    expect(rt.state).toBe('WAITING');
  });

  it('onTap returns early if state is not ACTIVE', () => {
    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));

    // Ring spawning normally
    rt.startRound(DEFAULT_STATE);

    // Advance to auto-miss and transition to WAITING
    for (let i = 0; i < 1000; i++) {
      if (rt.state === 'WAITING') break;
      rt.update(1 / 240);
    }

    // Now state is WAITING — clear events emitted during auto-miss
    expect(rt.state).toBe('WAITING');
    events.length = 0;

    // Tap should be ignored
    rt.onTap(0);
    expect(events).toHaveLength(0);
  });

  // ─── Scenario H: Per-frame tap guard still works

  it('only first tap in a frame is processed (per-frame guard)', () => {
    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));

    // Two rings spawning immediately so ring 1 survives after ring 0 is resolved
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 0 });

    // Multiple taps without update (same frame) — only first processed (ring 0)
    rt.onTap(1);
    rt.onTap(2);
    rt.onTap(3);
    expect(events).toHaveLength(1);

    // After update, per-frame guard resets — ring 1 still ACTIVE
    rt.update(1 / 60);
    rt.onTap(4);

    // Second tap processed in next frame (ring 1)
    expect(events).toHaveLength(2);
  });

  // ─── Scenario I: reset() clears state properly

  it('reset() returns to WAITING with no rings, allowing fresh startRound()', () => {
    rt.startRound(DEFAULT_STATE);
    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));

    // Tap and resolve first ring
    rt.onTap(0);
    expect(events).toHaveLength(1);

    // Reset
    rt.reset();
    expect(rt.state).toBe('WAITING');
    expect(rt.rings).toHaveLength(0);

    // Fresh startRound should work normally
    events.length = 0;
    rt.startRound(DEFAULT_STATE);
    expect(rt.state).toBe('ACTIVE');

    // Tap should work on fresh ring
    rt.onTap(0);
    expect(events).toHaveLength(1);
  });

  // ─── Scenario J: Ring at spawn can't achieve PERFECT or GOOD

  it('tap at RING_MAX_RADIUS cannot grade PERFECT or GOOD', () => {
    const delta = Math.abs(RING_MAX_RADIUS - ORB_RADIUS);

    // Delta must be within PERFECT_WINDOW for PERFECT grade
    expect(delta).toBeGreaterThan(PERFECT_WINDOW);

    // Delta must be within GOOD_WINDOW for GOOD grade
    expect(delta).toBeGreaterThan(GOOD_WINDOW);

    // Therefore, any tap at spawn must grade MISS
    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));

    rt.startRound(DEFAULT_STATE);
    rt.onTap(0);

    expect(events[0]?.grade).toBe('MISS');
  });
});
