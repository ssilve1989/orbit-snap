import { describe, it, expect } from 'vitest';
import {
  ORB_RADIUS, RING_MAX_RADIUS, ACCEL,
  PERFECT_WINDOW, GOOD_WINDOW, AUTO_MISS_BUFFER, INTER_ROUND_MS,
  PERFECT_BASE, GOOD_BASE, COMBO_STEP, MULTIPLIER_CAP, MULTIPLIER_TABLE,
  ROUNDS_PER_LEVEL, RING_COUNT_TABLE, BASE_RING_SPEED,
  SPEED_INCREMENT, MAX_RING_SPEED, STAGGER_MS,
} from '../src/config.js';

describe('config', () => {
  it('exports all S1 Ring Tap knobs as numbers', () => {
    expect(typeof ORB_RADIUS).toBe('number');
    expect(typeof RING_MAX_RADIUS).toBe('number');
    expect(typeof ACCEL).toBe('number');
    expect(typeof PERFECT_WINDOW).toBe('number');
    expect(typeof GOOD_WINDOW).toBe('number');
    expect(typeof AUTO_MISS_BUFFER).toBe('number');
    expect(typeof INTER_ROUND_MS).toBe('number');
  });

  it('exports all S2 Scoring knobs as numbers or arrays', () => {
    expect(typeof PERFECT_BASE).toBe('number');
    expect(typeof GOOD_BASE).toBe('number');
    expect(typeof COMBO_STEP).toBe('number');
    expect(typeof MULTIPLIER_CAP).toBe('number');
    expect(Array.isArray(MULTIPLIER_TABLE)).toBe(true);
  });

  it('exports all S3 Difficulty knobs as numbers or arrays', () => {
    expect(typeof ROUNDS_PER_LEVEL).toBe('number');
    expect(Array.isArray(RING_COUNT_TABLE)).toBe(true);
    expect(typeof BASE_RING_SPEED).toBe('number');
    expect(typeof SPEED_INCREMENT).toBe('number');
    expect(typeof MAX_RING_SPEED).toBe('number');
    expect(typeof STAGGER_MS).toBe('number');
  });

  it('RING_MAX_RADIUS > ORB_RADIUS', () => {
    expect(RING_MAX_RADIUS).toBeGreaterThan(ORB_RADIUS);
  });

  it('GOOD_WINDOW > PERFECT_WINDOW', () => {
    expect(GOOD_WINDOW).toBeGreaterThan(PERFECT_WINDOW);
  });

  it('PERFECT_BASE / GOOD_BASE >= 1.8 (GDD ratio constraint)', () => {
    expect(PERFECT_BASE / GOOD_BASE).toBeGreaterThanOrEqual(1.8);
  });

  it('MULTIPLIER_TABLE last entry equals MULTIPLIER_CAP', () => {
    expect(MULTIPLIER_TABLE[MULTIPLIER_TABLE.length - 1]).toBe(MULTIPLIER_CAP);
  });

  it('RING_COUNT_TABLE entries are all >= 1', () => {
    expect(RING_COUNT_TABLE.every(n => n >= 1)).toBe(true);
  });

  it('BASE_RING_SPEED <= MAX_RING_SPEED', () => {
    expect(BASE_RING_SPEED).toBeLessThanOrEqual(MAX_RING_SPEED);
  });

  it('COMBO_STEP >= 1 (guards against divide-by-zero in multiplier lookup)', () => {
    expect(COMBO_STEP).toBeGreaterThanOrEqual(1);
  });

  it('ROUNDS_PER_LEVEL >= 1 (guards against divide-by-zero in difficulty)', () => {
    expect(ROUNDS_PER_LEVEL).toBeGreaterThanOrEqual(1);
  });
});
