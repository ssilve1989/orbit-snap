import { describe, it, expect } from 'vitest';
import { stepMote } from '../src/rendering/ambient-dust.js';
import type { Mote, DustStepParams } from '../src/rendering/ambient-dust.js';
import { ORB_RADIUS, RING_MAX_RADIUS } from '../src/config.js';

const mote = (x: number, y: number): Mote => ({ x, y, vx: 0, vy: 0, depth: 1, fade: 1 });

const params = (overrides: Partial<DustStepParams> = {}): DustStepParams => ({
  coreRadius: ORB_RADIUS,
  swirlRadius: RING_MAX_RADIUS,
  inflow: true,
  heat: 0,
  shock: null,
  ...overrides,
});

const radius = (m: Mote): number => Math.hypot(m.x, m.y);

describe('stepMote — inflow', () => {
  it('pulls motes toward the core while inflow is on', () => {
    const m = mote(300, 0);
    stepMote(m, 0.1, params());
    expect(radius(m)).toBeLessThan(300);
  });

  it('falls faster near the core', () => {
    const far = mote(400, 0), near = mote(80, 0);
    stepMote(far, 0.1, params());
    stepMote(near, 0.1, params());
    expect(80 - radius(near)).toBeGreaterThan(400 - radius(far));
  });

  it('reports absorption once inside the core', () => {
    const m = mote(ORB_RADIUS * 1.06, 0);
    let alive = true;
    for (let i = 0; i < 60 && alive; i++) alive = stepMote(m, 1 / 60, params());
    expect(alive).toBe(false);
  });

  it('only swirls (keeps its radius) when inflow is off', () => {
    const m = mote(200, 0);
    for (let i = 0; i < 120; i++) expect(stepMote(m, 1 / 60, params({ inflow: false }))).toBe(true);
    expect(radius(m)).toBeCloseTo(200, 6);
    expect(m.y).not.toBe(0); // it moved around the centre
  });

  it('heat speeds up the fall', () => {
    const cold = mote(300, 0), hot = mote(300, 0);
    stepMote(cold, 0.1, params());
    stepMote(hot, 0.1, params({ heat: 1 }));
    expect(radius(hot)).toBeLessThan(radius(cold));
  });
});

describe('stepMote — ripple push', () => {
  it('pushes motes on the ripple front away from the hit point', () => {
    const m = mote(200, 0);
    const shock = { x: 0, y: 0, front: 200, width: 60, strength: 1 };
    stepMote(m, 1 / 60, params({ inflow: false, shock }));
    expect(m.vx).toBeGreaterThan(0);
    expect(Math.abs(m.vy)).toBeLessThan(1e-9);
  });

  it('ignores motes far from the front', () => {
    const m = mote(600, 0);
    const shock = { x: 0, y: 0, front: 100, width: 60, strength: 1 };
    stepMote(m, 1 / 60, params({ inflow: false, shock }));
    expect(m.vx).toBe(0);
  });

  it('push velocity damps away', () => {
    const m = mote(200, 0);
    m.vx = 100;
    for (let i = 0; i < 180; i++) stepMote(m, 1 / 60, params({ inflow: false }));
    expect(Math.abs(m.vx)).toBeLessThan(1);
  });
});
