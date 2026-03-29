import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RingTap } from '../src/gameplay/ring-tap.js';
import type { DifficultyState } from '../src/gameplay/difficulty-progression.js';
import {
  ORB_RADIUS, RING_MAX_RADIUS, ACCEL,
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
};

/** Advance simulation until the first ACTIVE ring reaches at or below targetRadius. */
function advanceToRadius(rt: RingTap, targetRadius: number, maxSteps = 200_000): void {
  const dt = 1 / 240;
  for (let i = 0; i < maxSteps; i++) {
    const ring = rt.rings.find(r => r.state === 'ACTIVE');
    if (ring === undefined || ring.radius <= targetRadius) break;
    rt.update(dt);
  }
}

describe('RingTap — ring spawning', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('ring spawns at RING_MAX_RADIUS', () => {
    rt.startRound(DEFAULT_STATE);
    const rings = rt.rings;
    expect(rings).toHaveLength(1);
    expect(rings[0]?.radius).toBe(RING_MAX_RADIUS);
  });

  it('ring state is ACTIVE immediately when spawnDelay is 0', () => {
    rt.startRound(DEFAULT_STATE);
    expect(rt.rings[0]?.state).toBe('ACTIVE');
  });

  it('ring radius decreases each update', () => {
    rt.startRound(DEFAULT_STATE);
    const r0 = rt.rings[0]?.radius ?? 0;
    rt.update(1 / 60);
    expect(rt.rings[0]?.radius).toBeLessThan(r0);
  });

  it('second ring starts PENDING with correct spawnDelay', () => {
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 550 });
    const rings = rt.rings;
    expect(rings[0]?.state).toBe('ACTIVE');
    expect(rings[1]?.state).toBe('PENDING');
    expect(rings[1]?.spawnDelay).toBeCloseTo(550);
  });

  it('PENDING ring transitions to ACTIVE after its spawnDelay elapses', () => {
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 200 });
    for (let i = 0; i < Math.ceil(0.201 * 60); i++) rt.update(1 / 60);
    expect(rt.rings[1]?.state).toBe('ACTIVE');
  });
});

describe('RingTap — grade thresholds', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('grades PERFECT when delta <= PERFECT_WINDOW', () => {
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, ORB_RADIUS + PERFECT_WINDOW);
    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);
    expect(events[0]?.grade).toBe('PERFECT');
  });

  it('grades MISS when ring is far from ORB_RADIUS', () => {
    rt.startRound(DEFAULT_STATE);
    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);
    expect(events[0]?.grade).toBe('MISS');
  });

  it('tap with no active rings emits no event', () => {
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);

    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);
    expect(events).toHaveLength(0);
  });

  it('tap in WAITING state emits no event', () => {
    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);
    expect(events).toHaveLength(0);
  });
});

describe('RingTap — only closest ring graded per tap', () => {
  it('grades the ring closer to ORB_RADIUS when two are active', () => {
    const rt = new RingTap();
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 50 });

    for (let i = 0; i < 200; i++) rt.update(1 / 240);

    const activeRings = rt.rings.filter(r => r.state === 'ACTIVE');
    if (activeRings.length < 2) return;

    const closer = activeRings.reduce((a, b) =>
      Math.abs(a.radius - ORB_RADIUS) < Math.abs(b.radius - ORB_RADIUS) ? a : b,
    );

    const events: Array<{ ringId: number }> = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);

    expect(events).toHaveLength(1);
    expect(events[0]?.ringId).toBe(closer.id);
  });
});

describe('RingTap — auto-miss', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('emits MISS grade when ring passes AUTO_MISS_THRESHOLD without tap', () => {
    const events: Array<{ grade: string }> = [];
    rt.onRingResolved(e => events.push(e));
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);
    expect(events.some(e => e.grade === 'MISS')).toBe(true);
  });

  it('ring transitions to MISSED state on auto-miss', () => {
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);
    expect(rt.rings[0]?.state).toBe('MISSED');
  });

  it('tap after auto-miss emits no additional event', () => {
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);

    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(0);
    expect(events).toHaveLength(0);
  });
});

describe('RingTap — multiple taps per frame', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('only the first tap in a frame is processed', () => {
    rt.startRound(DEFAULT_STATE);
    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(1);
    rt.onTap(2);
    rt.onTap(3);
    expect(events).toHaveLength(1);
  });

  it('second tap is processed after update() resets the frame guard', () => {
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 0 });
    const events: unknown[] = [];
    rt.onRingResolved(e => events.push(e));
    rt.onTap(1);
    rt.update(1 / 60);
    rt.onTap(2);
    expect(events).toHaveLength(2);
  });
});

describe('RingTap — round lifecycle', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('state is ACTIVE after startRound', () => {
    rt.startRound(DEFAULT_STATE);
    expect(rt.state).toBe('ACTIVE');
  });

  it('state transitions to WAITING when all rings are resolved', () => {
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);
    expect(rt.state).toBe('WAITING');
  });

  it('onRoundEnd fires when all rings resolved', () => {
    const roundEndFn = vi.fn();
    rt.onRoundEnd(roundEndFn);
    rt.startRound(DEFAULT_STATE);
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);
    expect(roundEndFn).toHaveBeenCalledOnce();
  });

  it('round does not end while any ring is still PENDING', () => {
    const roundEndFn = vi.fn();
    rt.onRoundEnd(roundEndFn);
    // staggerMs >> ring traversal time (~2.3s) so ring 1 is still PENDING
    // when ring 0 auto-misses
    rt.startRound({ ...DEFAULT_STATE, ringCount: 2, staggerMs: 10_000 });
    advanceToRadius(rt, AUTO_MISS_THRESHOLD - 1);
    rt.update(1 / 60);
    expect(roundEndFn).not.toHaveBeenCalled();
  });

  it('RingResolved event includes grade, ringId, and timestamp', () => {
    const events: Array<{ grade: string; ringId: unknown; timestamp: unknown }> = [];
    rt.onRingResolved(e => events.push(e));
    rt.startRound(DEFAULT_STATE);
    rt.onTap(12345);
    expect(events[0]).toMatchObject({
      grade: expect.stringMatching(/^(PERFECT|GOOD|MISS)$/),
      ringId: expect.any(Number),
      timestamp: 12345,
    });
  });

  it('reset() returns to initial state', () => {
    rt.startRound(DEFAULT_STATE);
    rt.update(1 / 60);
    rt.reset();
    expect(rt.state).toBe('WAITING');
    expect(rt.rings).toHaveLength(0);
  });
});

describe('RingTap — speed formula', () => {
  it('speed at RING_MAX_RADIUS equals baseSpeed (ACCEL term = 0 at spawn)', () => {
    const speed = RingTap.computeRingSpeed(RING_MAX_RADIUS, BASE_RING_SPEED);
    expect(speed).toBeCloseTo(BASE_RING_SPEED);
  });

  it('speed at ORB_RADIUS equals BASE_SPEED + ACCEL × (1 − ORB/MAX)', () => {
    const speed = RingTap.computeRingSpeed(ORB_RADIUS, BASE_RING_SPEED);
    const expected = BASE_RING_SPEED + ACCEL * (1 - ORB_RADIUS / RING_MAX_RADIUS);
    expect(speed).toBeCloseTo(expected, 2);
  });

  it('ACCEL = 0 produces constant speed regardless of radius', () => {
    if (ACCEL !== 0) return;
    const s1 = RingTap.computeRingSpeed(RING_MAX_RADIUS, BASE_RING_SPEED);
    const s2 = RingTap.computeRingSpeed(ORB_RADIUS + 50, BASE_RING_SPEED);
    const s3 = RingTap.computeRingSpeed(ORB_RADIUS, BASE_RING_SPEED);
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
  });

  it.todo('ACCEL > 0: ring accelerates as it approaches orb');
});

describe('RingTap — edge cases', () => {
  let rt: RingTap;

  beforeEach(() => { rt = new RingTap(); });

  it('ringCount 0 defaults to 1 ring with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rt.startRound({ ...DEFAULT_STATE, ringCount: 0 });
    expect(rt.rings).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('onRingResolved returns an unsubscribe function', () => {
    const events: unknown[] = [];
    const unsub = rt.onRingResolved(e => events.push(e));
    unsub();
    rt.startRound(DEFAULT_STATE);
    rt.onTap(0);
    expect(events).toHaveLength(0);
  });
});
