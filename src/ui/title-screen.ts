/**
 * TitleScreen — full-screen DOM overlay shown before the game starts.
 * Offers a mode choice and calls onStart with the picked mode.
 *
 * Input: tap/click a mode button, or press Space/Enter/1 for Classic and 2/S for Scatter.
 */

import type { GameMode } from '../game-mode.js';

const STYLES = `
#orbit-title {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  font-family: monospace;
  color: white;
  pointer-events: none;
  user-select: none;
  background: transparent;
  padding: 0 16px;
}
#orbit-title-name {
  font-size: 52px;
  font-weight: bold;
  letter-spacing: 8px;
  margin-bottom: 12px;
  text-align: center;
}
#orbit-title-sub {
  font-size: 14px;
  letter-spacing: 4px;
  color: #888;
  margin-bottom: 48px;
  text-align: center;
}
#orbit-title-modes {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  pointer-events: auto;
}
.orbit-title-mode {
  width: 200px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid #333;
  color: white;
  font-family: monospace;
  padding: 16px 14px;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
}
.orbit-title-mode:hover,
.orbit-title-mode:focus-visible {
  border-color: #00ffcc;
  background: rgba(0, 255, 204, 0.06);
  outline: none;
}
.orbit-title-mode-name {
  font-size: 17px;
  font-weight: bold;
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.orbit-title-mode-desc {
  font-size: 11px;
  letter-spacing: 1px;
  line-height: 1.5;
  color: #888;
}
.orbit-title-mode-key {
  font-size: 10px;
  letter-spacing: 2px;
  color: #555;
  margin-top: 10px;
}
#orbit-title-prompt {
  font-size: 13px;
  letter-spacing: 3px;
  color: #aaa;
  margin-top: 36px;
  animation: orbit-blink 1.2s ease-in-out infinite;
}
@media (max-width: 480px) {
  #orbit-title-name { font-size: 38px; letter-spacing: 6px; }
  #orbit-title-sub  { font-size: 12px; letter-spacing: 3px; margin-bottom: 32px; }
}
@keyframes orbit-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}
`;

export class TitleScreen {
  readonly #root: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;
  readonly #classicBtn: HTMLButtonElement;
  readonly #scatterBtn: HTMLButtonElement;
  #onStart: ((mode: GameMode) => void) | null = null;
  #inputCooldownId: ReturnType<typeof setTimeout> | null = null;

  #classicHandler = () => this.#trigger('CLASSIC');
  #scatterHandler = () => this.#trigger('SCATTER');
  #keyHandler     = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Digit1') {
      e.preventDefault();
      this.#trigger('CLASSIC');
    } else if (e.code === 'Digit2' || e.code === 'KeyS') {
      e.preventDefault();
      this.#trigger('SCATTER');
    }
  };

  constructor() {
    this.#styleEl = document.createElement('style');
    this.#styleEl.textContent = STYLES;
    document.head.appendChild(this.#styleEl);

    this.#root = document.createElement('div');
    this.#root.id = 'orbit-title';
    this.#root.innerHTML = `
      <div id="orbit-title-name">ORBIT SNAP</div>
      <div id="orbit-title-sub">TAP WHEN THE RING MEETS ITS TARGET</div>
      <div id="orbit-title-modes">
        <button class="orbit-title-mode" id="orbit-title-classic">
          <div class="orbit-title-mode-name">CLASSIC</div>
          <div class="orbit-title-mode-desc">Rings converge on the central orb.</div>
          <div class="orbit-title-mode-key">SPACE · 1</div>
        </button>
        <button class="orbit-title-mode" id="orbit-title-scatter">
          <div class="orbit-title-mode-name">SCATTER</div>
          <div class="orbit-title-mode-desc">Targets appear anywhere. Chain Perfects, draft power-ups between waves.</div>
          <div class="orbit-title-mode-key">2 · S</div>
        </button>
      </div>
      <div id="orbit-title-prompt">CHOOSE A MODE</div>
    `;
    document.body.appendChild(this.#root);

    this.#classicBtn = this.#root.querySelector('#orbit-title-classic') as HTMLButtonElement;
    this.#scatterBtn = this.#root.querySelector('#orbit-title-scatter') as HTMLButtonElement;
  }

  /** Show the title screen and register the start callback. */
  show(onStart: (mode: GameMode) => void): void {
    this.#onStart = onStart;
    this.#root.style.display = 'flex';
    this.#inputCooldownId = setTimeout(() => {
      this.#inputCooldownId = null;
      document.addEventListener('keydown', this.#keyHandler);
      this.#classicBtn.addEventListener('click', this.#classicHandler);
      this.#scatterBtn.addEventListener('click', this.#scatterHandler);
    }, 400);
  }

  /** Hide the screen and remove event listeners. */
  hide(): void {
    if (this.#inputCooldownId !== null) {
      clearTimeout(this.#inputCooldownId);
      this.#inputCooldownId = null;
    }
    this.#root.style.display = 'none';
    document.removeEventListener('keydown', this.#keyHandler);
    this.#classicBtn.removeEventListener('click', this.#classicHandler);
    this.#scatterBtn.removeEventListener('click', this.#scatterHandler);
    this.#onStart = null;
  }

  destroy(): void {
    this.hide();
    this.#root.remove();
    this.#styleEl.remove();
  }

  #trigger(mode: GameMode): void {
    const cb = this.#onStart;
    this.hide();
    cb?.(mode);
  }
}
