/**
 * PowerUpDraft — between-wave overlay offering a pick of roguelite power-ups.
 * Display only: reports the picked id via callback; ScatterRun applies it.
 * UI for S10 Roguelite Power-Ups (design/gdd/scatter-mode.md).
 *
 * Input: tap/click a card, or press 1/2/3.
 */

/** Card content for one offered power-up. */
export interface DraftCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Stacks already held before this pick. */
  readonly owned: number;
  readonly maxStacks: number;
  readonly kind: 'passive' | 'instant';
}

/** Delay before input is accepted, so a late gameplay tap can't pick a card (ms). */
const INPUT_COOLDOWN_MS = 450;

const STYLES = `
#orbit-draft {
  position: fixed;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 25;
  font-family: monospace;
  color: white;
  user-select: none;
  background: rgba(0, 0, 0, 0.62);
  padding: 0 16px;
}
#orbit-draft.is-visible {
  display: flex;
  animation: orbit-draft-in 220ms ease-out forwards;
}
@keyframes orbit-draft-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
#orbit-draft-title {
  font-size: 24px;
  letter-spacing: 6px;
  margin-bottom: 6px;
  text-align: center;
}
#orbit-draft-sub {
  font-size: 12px;
  letter-spacing: 4px;
  color: #888;
  margin-bottom: 28px;
  text-align: center;
}
#orbit-draft-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  max-width: 720px;
}
.orbit-draft-card {
  width: 200px;
  min-height: 132px;
  background: rgba(10, 16, 24, 0.9);
  border: 1px solid #2a3a48;
  color: white;
  font-family: monospace;
  padding: 16px 14px 12px;
  cursor: pointer;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: border-color 0.15s, transform 0.15s;
}
.orbit-draft-card:hover,
.orbit-draft-card:focus-visible {
  border-color: #ffd34d;
  transform: translateY(-3px);
  outline: none;
}
.orbit-draft-card-name {
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 3px;
  color: #ffd34d;
}
.orbit-draft-card-desc {
  font-size: 12px;
  line-height: 1.5;
  color: #ccc;
  flex: 1;
}
.orbit-draft-card-meta {
  font-size: 10px;
  letter-spacing: 2px;
  color: #556;
}
@media (max-width: 480px) {
  .orbit-draft-card { width: 100%; min-height: 0; }
}
@media (prefers-reduced-motion: reduce) {
  #orbit-draft.is-visible { animation: none; }
  .orbit-draft-card { transition: none; }
}
`;

export class PowerUpDraft {
  readonly #root: HTMLDivElement;
  readonly #styleEl: HTMLStyleElement;
  readonly #titleEl: HTMLDivElement;
  readonly #subEl: HTMLDivElement;
  readonly #cardsEl: HTMLDivElement;
  #cards: readonly DraftCard[] = [];
  #onPick: ((id: string) => void) | null = null;
  #accepting = false;
  #cooldownId: ReturnType<typeof setTimeout> | null = null;

  #keyHandler = (e: KeyboardEvent) => {
    const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (index < 0) return;
    const card = this.#cards[index];
    if (card === undefined) return;
    e.preventDefault();
    this.#pick(card.id);
  };

  constructor() {
    this.#styleEl = document.createElement('style');
    this.#styleEl.textContent = STYLES;
    document.head.appendChild(this.#styleEl);

    this.#root = document.createElement('div');
    this.#root.id = 'orbit-draft';
    this.#titleEl = document.createElement('div');
    this.#titleEl.id = 'orbit-draft-title';
    this.#subEl = document.createElement('div');
    this.#subEl.id = 'orbit-draft-sub';
    this.#cardsEl = document.createElement('div');
    this.#cardsEl.id = 'orbit-draft-cards';
    this.#root.append(this.#titleEl, this.#subEl, this.#cardsEl);
    // Swallow touches on the backdrop so they never reach the canvas
    this.#root.addEventListener('touchstart', e => {
      if (e.target === this.#root) e.preventDefault();
    }, { passive: false });
    document.body.appendChild(this.#root);
  }

  /** Show the draft. onPick receives the chosen card's id. */
  show(title: string, cards: readonly DraftCard[], onPick: (id: string) => void): void {
    this.#cards = cards;
    this.#onPick = onPick;
    this.#titleEl.textContent = title;
    this.#subEl.textContent = 'CHOOSE A POWER-UP';
    this.#cardsEl.replaceChildren(...cards.map((card, i) => this.#buildCard(card, i)));
    this.#root.classList.add('is-visible');

    this.#accepting = false;
    this.#cooldownId = setTimeout(() => {
      this.#cooldownId = null;
      this.#accepting = true;
      document.addEventListener('keydown', this.#keyHandler);
    }, INPUT_COOLDOWN_MS);
  }

  /** Hide without picking (e.g. the run was abandoned). */
  hide(): void {
    if (this.#cooldownId !== null) clearTimeout(this.#cooldownId);
    this.#cooldownId = null;
    this.#accepting = false;
    this.#root.classList.remove('is-visible');
    document.removeEventListener('keydown', this.#keyHandler);
    this.#onPick = null;
    this.#cards = [];
  }

  get isVisible(): boolean {
    return this.#root.classList.contains('is-visible');
  }

  destroy(): void {
    this.hide();
    this.#root.remove();
    this.#styleEl.remove();
  }

  #buildCard(card: DraftCard, index: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'orbit-draft-card';

    const name = document.createElement('div');
    name.className = 'orbit-draft-card-name';
    name.textContent = card.name;

    const desc = document.createElement('div');
    desc.className = 'orbit-draft-card-desc';
    desc.textContent = card.description;

    const meta = document.createElement('div');
    meta.className = 'orbit-draft-card-meta';
    const stackInfo = card.kind === 'instant' ? 'INSTANT' : `${card.owned}/${card.maxStacks}`;
    meta.textContent = `[${index + 1}] · ${stackInfo}`;

    btn.append(name, desc, meta);
    btn.addEventListener('click', () => this.#pick(card.id));
    return btn;
  }

  #pick(id: string): void {
    if (!this.#accepting) return;
    const cb = this.#onPick;
    this.hide();
    cb?.(id);
  }
}
