/**
 * TitleScreen — full-screen DOM overlay shown before the game starts.
 * Calls onStart when the player taps or presses Space/Enter.
 */

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
}
#orbit-title-name {
  font-size: 52px;
  font-weight: bold;
  letter-spacing: 8px;
  margin-bottom: 12px;
}
#orbit-title-sub {
  font-size: 14px;
  letter-spacing: 4px;
  color: #888;
  margin-bottom: 60px;
}
#orbit-title-prompt {
  font-size: 15px;
  letter-spacing: 3px;
  color: #aaa;
  animation: orbit-blink 1.2s ease-in-out infinite;
}
@keyframes orbit-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}
`;

export class TitleScreen {
  readonly #root: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;
  #onStart: (() => void) | null = null;

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
    this.#root.id = 'orbit-title';
    this.#root.innerHTML = `
      <div id="orbit-title-name">ORBIT SNAP</div>
      <div id="orbit-title-sub">TAP WHEN THE RING MEETS THE ORB</div>
      <div id="orbit-title-prompt">TAP OR PRESS SPACE TO START</div>
    `;
    document.body.appendChild(this.#root);
  }

  /** Show the title screen and register the start callback. */
  show(onStart: () => void): void {
    this.#onStart = onStart;
    this.#root.style.display = 'flex';
    document.addEventListener('keydown',    this.#keyHandler);
    document.addEventListener('click',      this.#clickHandler);
    document.addEventListener('touchstart', this.#touchHandler, { passive: false });
  }

  /** Hide the screen and remove event listeners. */
  hide(): void {
    this.#root.style.display = 'none';
    document.removeEventListener('keydown',    this.#keyHandler);
    document.removeEventListener('click',      this.#clickHandler);
    document.removeEventListener('touchstart', this.#touchHandler);
    this.#onStart = null;
  }

  destroy(): void {
    this.hide();
    this.#root.remove();
    this.#styleEl.remove();
  }

  #trigger(): void {
    const cb = this.#onStart;
    this.hide();
    cb?.();
  }
}
