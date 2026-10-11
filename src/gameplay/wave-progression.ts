import {
  WAVE_BASE_TARGETS, WAVE_TARGETS_INCREMENT, WAVE_MAX_TARGETS,
  WAVE_BASE_APPROACH_MS, WAVE_APPROACH_DECREMENT, WAVE_MIN_APPROACH_MS,
  WAVE_BASE_SPAWN_INTERVAL_MS, WAVE_SPAWN_INTERVAL_DECREMENT, WAVE_MIN_SPAWN_INTERVAL_MS,
  WAVE_SPAWN_JITTER, WAVE_LEAD_IN_MS,
} from '../config.js';

/** Spawn parameters for one Scatter wave. */
export interface WaveParams {
  /** Zero-based wave index. */
  readonly wave: number;
  /** Targets spawned over the course of the wave. */
  readonly targetCount: number;
  /** Base approach duration from spawn to hit moment (ms), before power-ups. */
  readonly approachMs: number;
  /** Mean time between spawns (ms). */
  readonly spawnIntervalMs: number;
  /** Random ± fraction applied per spawn interval. */
  readonly spawnJitter: number;
  /** Delay before the first spawn (ms). */
  readonly leadInMs: number;
}

/**
 * Derive wave parameters. Implements S8 Wave Progression (design/gdd/scatter-mode.md).
 *
 *   targetCount     = min(WAVE_BASE_TARGETS + wave × WAVE_TARGETS_INCREMENT, WAVE_MAX_TARGETS)
 *   approachMs      = max(WAVE_BASE_APPROACH_MS − wave × WAVE_APPROACH_DECREMENT, WAVE_MIN_APPROACH_MS)
 *   spawnIntervalMs = max(WAVE_BASE_SPAWN_INTERVAL_MS − wave × WAVE_SPAWN_INTERVAL_DECREMENT, WAVE_MIN_SPAWN_INTERVAL_MS)
 *
 * Average concurrent targets ≈ approachMs / spawnIntervalMs, rising from ~1.6 to ~2.3.
 */
export function getWaveParams(wave: number): WaveParams {
  const w = Math.max(0, Math.floor(wave));
  return {
    wave: w,
    targetCount: Math.min(WAVE_BASE_TARGETS + w * WAVE_TARGETS_INCREMENT, WAVE_MAX_TARGETS),
    approachMs: Math.max(WAVE_BASE_APPROACH_MS - w * WAVE_APPROACH_DECREMENT, WAVE_MIN_APPROACH_MS),
    spawnIntervalMs: Math.max(
      WAVE_BASE_SPAWN_INTERVAL_MS - w * WAVE_SPAWN_INTERVAL_DECREMENT,
      WAVE_MIN_SPAWN_INTERVAL_MS,
    ),
    spawnJitter: WAVE_SPAWN_JITTER,
    leadInMs: WAVE_LEAD_IN_MS,
  };
}
