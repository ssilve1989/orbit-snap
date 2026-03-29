/**
 * High score persistence via localStorage.
 * Handles missing storage and corrupt values gracefully.
 */

const STORAGE_KEY = 'orbit-snap:best-score';

/** Returns the stored best score, or 0 if none exists or storage is unavailable. */
export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
export function saveBestScore(score: number): boolean {
  try {
    const current = loadBestScore();
    if (score > current) {
      localStorage.setItem(STORAGE_KEY, String(score));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
