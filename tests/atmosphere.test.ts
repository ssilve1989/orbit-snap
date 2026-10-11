import { describe, it, expect, beforeEach } from 'vitest';
import {
  Atmosphere, focusFromRingDistance, focusFromTimeToHit,
  HEAT_FULL_COMBO, SHOCK_DURATION_S, FOCUS_RAMP_PX, FOCUS_RAMP_MS,
  TWINKLE_HEAT_GAIN, FLOW_HEAT_GAIN,
} from '../src/rendering/atmosphere.js';
import { GOOD_WINDOW } from '../src/config.js';

const PERFECT_COLOR = 0x00ffcc;
const GOOD_COLOR = 0x88ff44;
const MISS_COLOR = 0xff4444;

/** Run `seconds` of updates at 60 fps. */
function run(a: Atmosphere, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) a.update(1 / 60);
}

describe('Atmosphere — combo heat', () => {
  let a: Atmosphere;
  beforeEach(() => { a = new Atmosphere({ reducedMotion: false }); });

  it('starts cold', () => {
    expect(a.frame.heat).toBe(0);
  });

  it('eases toward combo / HEAT_FULL_COMBO', () => {
    a.setCombo(HEAT_FULL_COMBO / 2);
    run(a, 5);
    expect(a.frame.heat).toBeCloseTo(0.5, 2);
  });

  it('saturates at 1 above HEAT_FULL_COMBO', () => {
    a.setCombo(HEAT_FULL_COMBO * 4);
    run(a, 5);
    expect(a.frame.heat).toBeLessThanOrEqual(1);
    expect(a.frame.heat).toBeCloseTo(1, 2);
  });

  it('cools faster than it heats', () => {
    a.setCombo(HEAT_FULL_COMBO);
    run(a, 0.25);
    const gained = a.frame.heat;

    a.setCombo(HEAT_FULL_COMBO);
    run(a, 5);
    a.setCombo(0);
    run(a, 0.25);
    const lost = 1 - a.frame.heat;

    expect(lost).toBeGreaterThan(gained);
  });
});

describe('Atmosphere — animation clocks', () => {
  it('twinkle and flow track real time when cold', () => {
    const a = new Atmosphere({ reducedMotion: false });
    run(a, 2);
    expect(a.frame.twinkle).toBeCloseTo(2, 5);
    expect(a.frame.flow).toBeCloseTo(2, 5);
    expect(a.frame.time).toBeCloseTo(2, 5);
  });

  it('run faster at full heat, by the configured gain', () => {
    const a = new Atmosphere({ reducedMotion: false });
    a.setCombo(HEAT_FULL_COMBO);
    run(a, 5); // fully heated
    const t0 = a.frame.twinkle, f0 = a.frame.flow;
    run(a, 1);
    expect(a.frame.twinkle - t0).toBeCloseTo(1 + TWINKLE_HEAT_GAIN, 1);
    expect(a.frame.flow - f0).toBeCloseTo(1 + FLOW_HEAT_GAIN, 1);
  });

  it('never run backwards when heat drops', () => {
    const a = new Atmosphere({ reducedMotion: false });
    a.setCombo(HEAT_FULL_COMBO);
    run(a, 2);
    a.setCombo(0);
    let prevT = a.frame.twinkle, prevF = a.frame.flow;
    for (let i = 0; i < 60; i++) {
      a.update(1 / 60);
      expect(a.frame.twinkle).toBeGreaterThan(prevT);
      expect(a.frame.flow).toBeGreaterThan(prevF);
      prevT = a.frame.twinkle; prevF = a.frame.flow;
    }
  });

  it('caps a single long step so a backgrounded tab does not jump', () => {
    const a = new Atmosphere({ reducedMotion: false });
    a.update(30);
    expect(a.frame.time).toBeLessThanOrEqual(0.1);
  });
});

describe('Atmosphere — grade reactions', () => {
  let a: Atmosphere;
  beforeEach(() => { a = new Atmosphere({ reducedMotion: false }); });

  it('ripple is idle until a hit', () => {
    expect(a.frame.shockAge).toBe(SHOCK_DURATION_S);
  });

  it('Perfect fires a full ripple at the hit position', () => {
    a.onGrade('PERFECT', 0.25, 0.75, PERFECT_COLOR);
    expect(a.frame.shockAge).toBe(0);
    expect(a.frame.shockX).toBe(0.25);
    expect(a.frame.shockY).toBe(0.75);
    expect(a.frame.shockGood).toBe(0);
  });

  it('Good fires the weaker ripple', () => {
    a.onGrade('GOOD', 0.5, 0.5, GOOD_COLOR);
    expect(a.frame.shockAge).toBe(0);
    expect(a.frame.shockGood).toBe(1);
  });

  it('ripple ages and parks at SHOCK_DURATION_S', () => {
    a.onGrade('PERFECT', 0.5, 0.5, PERFECT_COLOR);
    run(a, 0.5);
    expect(a.frame.shockAge).toBeCloseTo(0.5, 5);
    run(a, 5);
    expect(a.frame.shockAge).toBe(SHOCK_DURATION_S);
  });

  it('Miss sets the fringe without moving or firing the ripple', () => {
    a.onGrade('PERFECT', 0.2, 0.2, PERFECT_COLOR);
    run(a, 0.3);
    const ageBefore = a.frame.shockAge;
    a.onGrade('MISS', 0.9, 0.9, MISS_COLOR);
    expect(a.frame.miss).toBe(1);
    expect(a.frame.shockX).toBe(0.2);
    expect(a.frame.shockAge).toBe(ageBefore);
  });

  it('Miss fringe decays to zero within half a second', () => {
    a.onGrade('MISS', 0.5, 0.5, MISS_COLOR);
    run(a, 0.5);
    expect(a.frame.miss).toBe(0);
  });

  it('orb flash takes the grade colour and decays', () => {
    a.onGrade('GOOD', 0.5, 0.5, GOOD_COLOR);
    expect(a.frame.orbFlash).toBe(1);
    expect(a.frame.flashR).toBeCloseTo(0x88 / 255, 5);
    expect(a.frame.flashG).toBeCloseTo(1, 5);
    expect(a.frame.flashB).toBeCloseTo(0x44 / 255, 5);
    run(a, 0.3);
    expect(a.frame.orbFlash).toBe(0);
  });
});

describe('Atmosphere — focus pull', () => {
  it('focusFromRingDistance is 1 inside the Good window and 0 past the ramp', () => {
    expect(focusFromRingDistance(GOOD_WINDOW)).toBe(1);
    expect(focusFromRingDistance(0)).toBe(1);
    expect(focusFromRingDistance(-10)).toBe(1);
    expect(focusFromRingDistance(GOOD_WINDOW + FOCUS_RAMP_PX)).toBe(0);
    expect(focusFromRingDistance(500)).toBe(0);
    expect(focusFromRingDistance(GOOD_WINDOW + FOCUS_RAMP_PX / 2)).toBeCloseTo(0.5, 5);
  });

  it('focusFromTimeToHit is 1 inside the Good window and 0 past the ramp', () => {
    expect(focusFromTimeToHit(80, 80)).toBe(1);
    expect(focusFromTimeToHit(-50, 80)).toBe(1);
    expect(focusFromTimeToHit(80 + FOCUS_RAMP_MS, 80)).toBe(0);
    expect(focusFromTimeToHit(80 + FOCUS_RAMP_MS / 2, 80)).toBeCloseTo(0.5, 5);
  });

  it('eases toward the target and clamps input', () => {
    const a = new Atmosphere({ reducedMotion: false });
    a.setFocus(5);
    run(a, 2);
    expect(a.frame.focus).toBeCloseTo(1, 3);
    a.setFocus(0);
    run(a, 2);
    expect(a.frame.focus).toBeCloseTo(0, 3);
  });
});

describe('Atmosphere — parallax camera', () => {
  it('drifts slowly on its own', () => {
    const a = new Atmosphere({ reducedMotion: false });
    run(a, 6);
    expect(a.frame.camX).not.toBe(0);
  });

  it('stays still with reduced motion', () => {
    const a = new Atmosphere({ reducedMotion: true });
    run(a, 6);
    expect(a.frame.camX).toBe(0);
    expect(a.frame.camY).toBe(0);
  });
});

describe('Atmosphere — living orb', () => {
  it('fades in when the orb is visible and out when hidden', () => {
    const a = new Atmosphere({ reducedMotion: false });
    expect(a.frame.orbPresence).toBe(0);
    a.setOrbVisible(true);
    run(a, 0.1);
    expect(a.frame.orbPresence).toBeGreaterThan(0);
    expect(a.frame.orbPresence).toBeLessThan(1);
    run(a, 1);
    expect(a.frame.orbPresence).toBe(1);
    a.setOrbVisible(false);
    run(a, 1);
    expect(a.frame.orbPresence).toBe(0);
  });
});
