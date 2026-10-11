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
/** Wave banner hold and fade (ms) */
const BANNER_HOLD_MS = 900;
const BANNER_FADE_MS = 350;
/** Minimum Pinpoint streak before the HUD shows it */
const STREAK_DISPLAY_MIN = 2;
/** Streak label pulse duration (ms) */
const STREAK_PULSE_MS = 140;

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
#orbit-hud-shields {
  color: #66ccff;
  margin-left: 6px;
}
#orbit-hud-streak {
  font-size: 13px;
  letter-spacing: 3px;
  margin-top: 4px;
  height: 18px;
  color: #ffd34d;
  transition: transform 120ms ease-out;
}
#orbit-hud-streak.is-pulse {
  transform: scale(1.35);
}
#orbit-hud-loadout {
  position: fixed;
  left: calc(14px + env(safe-area-inset-left, 0px));
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 10;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 2px;
  line-height: 1.6;
  color: #7a8a99;
  pointer-events: none;
  user-select: none;
}
#orbit-hud-banner {
  position: fixed;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  font-family: monospace;
  color: white;
  text-align: center;
  pointer-events: none;
  user-select: none;
  opacity: 0;
  transition: opacity ${BANNER_FADE_MS}ms;
}
#orbit-hud-banner-title {
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 8px;
}
#orbit-hud-banner-sub {
  font-size: 12px;
  letter-spacing: 4px;
  color: #888;
  margin-top: 8px;
}
`;

// ─── HudState ─────────────────────────────────────────────────────────────────

export interface HudState {
  score: number;
  combo: number;
  multiplier: number;
  level: number;
  missesRemaining: number;
  /** Label for the progress counter (default 'LEVEL'; Scatter uses 'WAVE'). */
  levelLabel?: string;
  /** Scatter: active shield charges, drawn after the hearts. */
  shields?: number;
  /** Scatter: current Pinpoint (consecutive Perfect) streak. */
  streak?: number;
  /** Scatter: drafted power-ups, one display line each. */
  loadout?: readonly string[];
}

// ─── Hud ─────────────────────────────────────────────────────────────────────

export class Hud {
  readonly #root: HTMLDivElement;
  readonly #scoreEl: HTMLDivElement;
  readonly #gradeEl: HTMLDivElement;
  readonly #comboEl: HTMLDivElement;
  readonly #levelEl: HTMLDivElement;
  readonly #livesEl: HTMLDivElement;
  readonly #heartsEl: HTMLSpanElement;
  readonly #shieldsEl: HTMLSpanElement;
  readonly #streakEl: HTMLDivElement;
  readonly #loadoutEl: HTMLDivElement;
  readonly #bannerEl: HTMLDivElement;
  readonly #bannerTitleEl: HTMLDivElement;
  readonly #bannerSubEl: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;

  #gradeTimer: ReturnType<typeof setTimeout> | null = null;
  #bannerTimer: ReturnType<typeof setTimeout> | null = null;
  #streakPulseTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.#heartsEl = document.createElement('span');
    this.#shieldsEl = document.createElement('span');
    this.#shieldsEl.id = 'orbit-hud-shields';
    this.#livesEl.append(this.#heartsEl, this.#shieldsEl);

    this.#streakEl = document.createElement('div');
    this.#streakEl.id = 'orbit-hud-streak';

    this.#root.append(this.#scoreEl, this.#gradeEl, this.#comboEl, this.#levelEl, this.#livesEl, this.#streakEl);
    document.body.appendChild(this.#root);

    this.#loadoutEl = document.createElement('div');
    this.#loadoutEl.id = 'orbit-hud-loadout';
    document.body.appendChild(this.#loadoutEl);

    this.#bannerEl = document.createElement('div');
    this.#bannerEl.id = 'orbit-hud-banner';
    this.#bannerTitleEl = document.createElement('div');
    this.#bannerTitleEl.id = 'orbit-hud-banner-title';
    this.#bannerSubEl = document.createElement('div');
    this.#bannerSubEl.id = 'orbit-hud-banner-sub';
    this.#bannerEl.append(this.#bannerTitleEl, this.#bannerSubEl);
    document.body.appendChild(this.#bannerEl);

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

    this.#levelEl.textContent = `${state.levelLabel ?? 'LEVEL'} ${state.level}`;
    this.#heartsEl.textContent = '♥'.repeat(state.missesRemaining);
    this.#shieldsEl.textContent = '◆'.repeat(state.shields ?? 0);

    const streak = state.streak ?? 0;
    this.#streakEl.textContent = streak >= STREAK_DISPLAY_MIN ? `PINPOINT ×${streak}` : '';

    const loadout = state.loadout ?? [];
    this.#loadoutEl.replaceChildren(...loadout.map(line => {
      const el = document.createElement('div');
      el.textContent = line;
      return el;
    }));
  }

  /** Briefly scale up the Pinpoint streak label (milestone feedback). */
  pulseStreak(): void {
    if (this.#streakPulseTimer !== null) clearTimeout(this.#streakPulseTimer);
    this.#streakEl.classList.add('is-pulse');
    this.#streakPulseTimer = setTimeout(() => {
      this.#streakEl.classList.remove('is-pulse');
      this.#streakPulseTimer = null;
    }, STREAK_PULSE_MS);
  }

  /** Show a centred banner (e.g. "WAVE 3") that holds, then fades out. */
  showBanner(title: string, subtitle = ''): void {
    if (this.#bannerTimer !== null) clearTimeout(this.#bannerTimer);
    this.#bannerTitleEl.textContent = title;
    this.#bannerSubEl.textContent = subtitle;
    this.#bannerEl.style.transition = 'none';
    this.#bannerEl.style.opacity = '1';
    this.#bannerTimer = setTimeout(() => {
      this.#bannerEl.style.transition = `opacity ${BANNER_FADE_MS}ms`;
      this.#bannerEl.style.opacity = '0';
      this.#bannerTimer = null;
    }, BANNER_HOLD_MS);
  }

  /** Immediately hide the banner (e.g. when a session ends). */
  hideBanner(): void {
    if (this.#bannerTimer !== null) clearTimeout(this.#bannerTimer);
    this.#bannerTimer = null;
    this.#bannerEl.style.opacity = '0';
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

  /** Show or hide the HUD (hidden on the title screen). */
  setVisible(visible: boolean): void {
    const display = visible ? '' : 'none';
    this.#root.style.display = display;
    this.#loadoutEl.style.display = display;
  }

  /** Remove all DOM nodes created by this HUD. */
  destroy(): void {
    if (this.#gradeTimer !== null) clearTimeout(this.#gradeTimer);
    if (this.#bannerTimer !== null) clearTimeout(this.#bannerTimer);
    if (this.#streakPulseTimer !== null) clearTimeout(this.#streakPulseTimer);
    this.#root.remove();
    this.#loadoutEl.remove();
    this.#bannerEl.remove();
    this.#styleEl.remove();
  }
}
