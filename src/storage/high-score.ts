/**
 * High score persistence via localStorage.
 * Handles missing storage and corrupt values gracefully.
 */

import type { GameMode } from '../game-mode.js';

/** Classic keeps the original key so existing best scores carry over. */
const STORAGE_KEYS: Readonly<Record<GameMode, string>> = {
  CLASSIC: 'orbit-snap:best-score',
  SCATTER: 'orbit-snap:best-score:scatter',
};

/** Returns the stored best score, or 0 if none exists or storage is unavailable. */
export function loadBestScore(mode: GameMode = 'CLASSIC'): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[mode]);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Persists a new best score. No-op if storage is unavailable.
 * Only writes if score exceeds the current stored value.
 * @returns true if the value was saved (it was a new best).
 */
export function saveBestScore(score: number, mode: GameMode = 'CLASSIC'): boolean {
  try {
    const current = loadBestScore(mode);
    if (score > current) {
      localStorage.setItem(STORAGE_KEYS[mode], String(score));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
