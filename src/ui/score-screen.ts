/**
 * ScoreScreen — end-of-session overlay showing final score, max combo, and best score.
 * Calls onRestart when the player taps or presses Space/Enter.
 */

const STYLES = `
#orbit-score {
  position: fixed;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  font-family: monospace;
  color: white;
  pointer-events: none;
  user-select: none;
}
#orbit-score-title {
  font-size: 28px;
  letter-spacing: 6px;
  color: #888;
  margin-bottom: 32px;
}
#orbit-score-value {
  font-size: 64px;
  font-weight: bold;
  letter-spacing: 4px;
  margin-bottom: 6px;
}
#orbit-score-new-best {
  font-size: 13px;
  letter-spacing: 4px;
  color: #00ffcc;
  height: 20px;
  margin-bottom: 6px;
}
#orbit-score-best {
  font-size: 13px;
  letter-spacing: 2px;
  color: #555;
  height: 20px;
  margin-bottom: 8px;
}
#orbit-score-combo {
  font-size: 16px;
  color: #aaa;
  letter-spacing: 3px;
  margin-bottom: 56px;
}
#orbit-score-prompt {
  font-size: 15px;
  letter-spacing: 3px;
  color: #555;
  animation: orbit-blink-score 1.2s ease-in-out infinite;
}
@keyframes orbit-blink-score {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
`;

export interface ScoreData {
  score: number;
  maxCombo: number;
  bestScore: number;
  isNewBest: boolean;
}

export class ScoreScreen {
  readonly #root: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;
  readonly #scoreEl: HTMLDivElement;
  readonly #newBestEl: HTMLDivElement;
  readonly #bestEl: HTMLDivElement;
  readonly #comboEl: HTMLDivElement;
  #onRestart: (() => void) | null = null;

  #clickHandler  = () => this.#trigger();
  #touchHandler  = (e: TouchEvent) => { e.preventDefault(); this.#trigger(); };
  #keyHandler    = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.#trigger();
    }
  };

  constructor() {
    this.#styleEl = document.createElement('style');
    this.#styleEl.textContent = STYLES;
    document.head.appendChild(this.#styleEl);

    this.#root = document.createElement('div');
    this.#root.id = 'orbit-score';
    this.#root.innerHTML = `
      <div id="orbit-score-title">GAME OVER</div>
      <div id="orbit-score-value">0</div>
      <div id="orbit-score-new-best"></div>
      <div id="orbit-score-best"></div>
      <div id="orbit-score-combo">MAX COMBO: 0</div>
      <div id="orbit-score-prompt">TAP OR PRESS SPACE TO PLAY AGAIN</div>
    `;
    document.body.appendChild(this.#root);

    this.#scoreEl   = this.#root.querySelector('#orbit-score-value')    as HTMLDivElement;
    this.#newBestEl = this.#root.querySelector('#orbit-score-new-best') as HTMLDivElement;
    this.#bestEl    = this.#root.querySelector('#orbit-score-best')     as HTMLDivElement;
    this.#comboEl   = this.#root.querySelector('#orbit-score-combo')    as HTMLDivElement;
  }

  show(data: ScoreData, onRestart: () => void): void {
    this.#scoreEl.textContent   = String(data.score);
    this.#comboEl.textContent   = `MAX COMBO: ${data.maxCombo}`;
    this.#newBestEl.textContent = data.isNewBest ? '✦ NEW BEST ✦' : '';
    this.#bestEl.textContent    = data.isNewBest ? '' : `BEST: ${data.bestScore}`;

    this.#onRestart = onRestart;
    this.#root.style.display = 'flex';
    document.addEventListener('keydown',    this.#keyHandler);
    document.addEventListener('click',      this.#clickHandler);
    document.addEventListener('touchstart', this.#touchHandler, { passive: false });
  }

  hide(): void {
    this.#root.style.display = 'none';
    document.removeEventListener('keydown',    this.#keyHandler);
    document.removeEventListener('click',      this.#clickHandler);
    document.removeEventListener('touchstart', this.#touchHandler);
    this.#onRestart = null;
  }

  destroy(): void {
    this.hide();
    this.#root.remove();
    this.#styleEl.remove();
  }

  #trigger(): void {
    const cb = this.#onRestart;
    this.hide();
    cb?.();
  }
}
