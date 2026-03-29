/**
 * Hud — HTML/CSS overlay for score, combo multiplier, level, and grade feedback.
 *
 * Rendered as a DOM layer above the PixiJS canvas so text stays crisp and is
 * naturally accessible. Updates are event-driven (not per-frame) except for the
 * grade flash timeout.
 *
 * Usage:
 *   const hud = new Hud();
 *   hud.update({ score: 0, combo: 0, multiplier: 1, level: 1 });
 *   hud.showGrade('PERFECT');
 *   // on teardown:
 *   hud.destroy();
 */

import type { Grade } from '../gameplay/ring-tap.js';

// ─── Visual constants ─────────────────────────────────────────────────────────

/** How long (ms) the grade label stays fully visible before fading */
const GRADE_HOLD_MS = 500;
/** CSS transition duration for the grade fade-out */
const GRADE_FADE_MS = 250;

const GRADE_COLOR: Readonly<Record<Grade, string>> = {
  PERFECT: '#00ffcc',
  GOOD:    '#88ff44',
  MISS:    '#ff4444',
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLES = `
#orbit-hud {
  position: fixed;
  top: calc(20px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  min-width: 220px;
  z-index: 10;
  font-family: monospace;
  color: white;
  user-select: none;
}
#orbit-hud-score {
  font-size: 22px;
  letter-spacing: 2px;
}
#orbit-hud-grade {
  font-size: 36px;
  font-weight: bold;
  height: 44px;
  letter-spacing: 3px;
  transition: opacity ${GRADE_FADE_MS}ms;
  opacity: 0;
}
#orbit-hud-combo {
  font-size: 16px;
  color: #aaa;
  height: 22px;
}
#orbit-hud-level {
  font-size: 13px;
  color: #666;
  margin-top: 2px;
}
#orbit-hud-lives {
  font-size: 18px;
  letter-spacing: 4px;
  margin-top: 6px;
  color: #cc3333;
}
`;

// ─── HudState ─────────────────────────────────────────────────────────────────

export interface HudState {
  score: number;
  combo: number;
  multiplier: number;
  level: number;
  missesRemaining: number;
}

// ─── Hud ─────────────────────────────────────────────────────────────────────

export class Hud {
  readonly #root: HTMLDivElement;
  readonly #scoreEl: HTMLDivElement;
  readonly #gradeEl: HTMLDivElement;
  readonly #comboEl: HTMLDivElement;
  readonly #levelEl: HTMLDivElement;
  readonly #livesEl: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;

  #gradeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.#styleEl = document.createElement('style');
    this.#styleEl.textContent = STYLES;
    document.head.appendChild(this.#styleEl);

    this.#root = document.createElement('div');
    this.#root.id = 'orbit-hud';

    this.#scoreEl = document.createElement('div');
    this.#scoreEl.id = 'orbit-hud-score';

    this.#gradeEl = document.createElement('div');
    this.#gradeEl.id = 'orbit-hud-grade';

    this.#comboEl = document.createElement('div');
    this.#comboEl.id = 'orbit-hud-combo';

    this.#levelEl = document.createElement('div');
    this.#levelEl.id = 'orbit-hud-level';

    this.#livesEl = document.createElement('div');
    this.#livesEl.id = 'orbit-hud-lives';

    this.#root.append(this.#scoreEl, this.#gradeEl, this.#comboEl, this.#levelEl, this.#livesEl);
    document.body.appendChild(this.#root);

    // Render initial blank state
    this.update({ score: 0, combo: 0, multiplier: 1, level: 1, missesRemaining: 3 });
  }

  /** Update persistent labels (score, combo, level). Call on every game event that changes state. */
  update(state: HudState): void {
    this.#scoreEl.textContent = `SCORE: ${state.score}`;

    if (state.combo > 1) {
      this.#comboEl.textContent = `${state.combo}× COMBO`;
    } else {
      this.#comboEl.textContent = '';
    }

    this.#levelEl.textContent = `LEVEL ${state.level}`;
    this.#livesEl.textContent = '♥'.repeat(state.missesRemaining);
  }

  /**
   * Flash the grade label, then fade it out.
   * Cancels any in-progress flash before starting a new one.
   */
  showGrade(grade: Grade): void {
    if (this.#gradeTimer !== null) {
      clearTimeout(this.#gradeTimer);
      this.#gradeTimer = null;
    }

    const el = this.#gradeEl;
    el.textContent = grade;
    el.style.color = GRADE_COLOR[grade];
    el.style.transition = 'none';
    el.style.opacity = '1';

    // Hold, then fade out
    this.#gradeTimer = setTimeout(() => {
      el.style.transition = `opacity ${GRADE_FADE_MS}ms`;
      el.style.opacity = '0';
      this.#gradeTimer = null;
    }, GRADE_HOLD_MS);
  }

  /** Remove all DOM nodes created by this HUD. */
  destroy(): void {
    if (this.#gradeTimer !== null) clearTimeout(this.#gradeTimer);
    this.#root.remove();
    this.#styleEl.remove();
  }
}
