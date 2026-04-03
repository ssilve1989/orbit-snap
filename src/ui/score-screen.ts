/**
 * ScoreScreen — end-of-session overlay showing final score, max combo, level,
 * and best score. Provides two explicit actions: Play Again and Return to Title.
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
#orbit-score-stats {
  display: flex;
  gap: 48px;
  margin-bottom: 56px;
}
.orbit-score-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.orbit-score-stat-label {
  font-size: 11px;
  letter-spacing: 3px;
  color: #555;
}
.orbit-score-stat-value {
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 2px;
  color: #aaa;
}
#orbit-score-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  pointer-events: auto;
}
#orbit-score-btn-restart,
#orbit-score-btn-title {
  background: none;
  border: none;
  font-family: monospace;
  cursor: pointer;
  letter-spacing: 3px;
  padding: 8px 16px;
  transition: color 0.15s;
}
#orbit-score-btn-restart {
  font-size: 15px;
  color: #555;
  animation: orbit-blink-score 1.2s ease-in-out infinite;
}
#orbit-score-btn-restart:hover,
#orbit-score-btn-restart:focus {
  color: #fff;
  outline: none;
}
#orbit-score-btn-title {
  font-size: 13px;
  color: #333;
}
#orbit-score-btn-title:hover,
#orbit-score-btn-title:focus {
  color: #666;
  outline: none;
}
@keyframes orbit-blink-score {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}
@keyframes orbit-score-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
#orbit-score.is-visible {
  animation: orbit-score-in 300ms ease-out forwards;
}
`;

export interface ScoreData {
  score: number;
  maxCombo: number;
  level: number;
  bestScore: number;
  isNewBest: boolean;
}

export class ScoreScreen {
  readonly #root: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;
  readonly #scoreEl: HTMLDivElement;
  readonly #newBestEl: HTMLDivElement;
  readonly #bestEl: HTMLDivElement;
  readonly #levelEl: HTMLDivElement;
  readonly #comboEl: HTMLDivElement;
  readonly #restartBtn: HTMLButtonElement;
  readonly #titleBtn: HTMLButtonElement;
  #onRestart: (() => void) | null = null;
  #onTitle: (() => void) | null = null;
  #inputCooldownId: ReturnType<typeof setTimeout> | null = null;

  #restartClickHandler = () => this.#triggerRestart();
  #titleClickHandler   = () => this.#triggerTitle();
  #keyHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.#triggerRestart();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      this.#triggerTitle();
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
      <div id="orbit-score-stats">
        <div class="orbit-score-stat">
          <div class="orbit-score-stat-label">LEVEL</div>
          <div id="orbit-score-level" class="orbit-score-stat-value">1</div>
        </div>
        <div class="orbit-score-stat">
          <div class="orbit-score-stat-label">COMBO</div>
          <div id="orbit-score-combo" class="orbit-score-stat-value">0</div>
        </div>
      </div>
      <div id="orbit-score-actions">
        <button id="orbit-score-btn-restart">SPACE · PLAY AGAIN</button>
        <button id="orbit-score-btn-title">ESCAPE · RETURN TO TITLE</button>
      </div>
    `;
    document.body.appendChild(this.#root);

    this.#scoreEl    = this.#root.querySelector('#orbit-score-value')    as HTMLDivElement;
    this.#newBestEl  = this.#root.querySelector('#orbit-score-new-best') as HTMLDivElement;
    this.#bestEl     = this.#root.querySelector('#orbit-score-best')     as HTMLDivElement;
    this.#levelEl    = this.#root.querySelector('#orbit-score-level')    as HTMLDivElement;
    this.#comboEl    = this.#root.querySelector('#orbit-score-combo')    as HTMLDivElement;
    this.#restartBtn = this.#root.querySelector('#orbit-score-btn-restart') as HTMLButtonElement;
    this.#titleBtn   = this.#root.querySelector('#orbit-score-btn-title')   as HTMLButtonElement;
  }

  show(data: ScoreData, onRestart: () => void, onTitle: () => void): void {
    this.#scoreEl.textContent   = String(data.score);
    this.#newBestEl.textContent = data.isNewBest ? '✦ NEW BEST ✦' : '';
    this.#bestEl.textContent    = data.isNewBest ? '' : `BEST: ${data.bestScore}`;
    this.#levelEl.textContent   = String(data.level);
    this.#comboEl.textContent   = String(data.maxCombo);

    this.#onRestart = onRestart;
    this.#onTitle   = onTitle;
    this.#root.style.display = 'flex';
    this.#root.classList.add('is-visible');

    this.#inputCooldownId = setTimeout(() => {
      this.#inputCooldownId = null;
      document.addEventListener('keydown', this.#keyHandler);
      this.#restartBtn.addEventListener('click', this.#restartClickHandler);
      this.#titleBtn.addEventListener('click',   this.#titleClickHandler);
    }, 400);
  }

  hide(): void {
    if (this.#inputCooldownId !== null) {
      clearTimeout(this.#inputCooldownId);
      this.#inputCooldownId = null;
    }
    this.#root.style.display = 'none';
    this.#root.classList.remove('is-visible');
    document.removeEventListener('keydown', this.#keyHandler);
    this.#restartBtn.removeEventListener('click', this.#restartClickHandler);
    this.#titleBtn.removeEventListener('click',   this.#titleClickHandler);
    this.#onRestart = null;
    this.#onTitle   = null;
  }

  destroy(): void {
    this.hide();
    this.#root.remove();
    this.#styleEl.remove();
  }

  #triggerRestart(): void {
    const cb = this.#onRestart;
    this.hide();
    cb?.();
  }

  #triggerTitle(): void {
    const cb = this.#onTitle;
    this.hide();
    cb?.();
  }
}
