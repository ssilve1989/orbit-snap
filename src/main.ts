/**
 * main.ts — game entry point and main loop.
 *
 * Game phase state machine:
 *   TITLE          — title screen shown, waiting for first tap
 *   PLAYING        — rings active, input live
 *   BETWEEN_ROUNDS — brief pause before next round spawns
 *   SCORE          — score screen shown after session ends (future: add end condition)
 */

import * as PIXI from 'pixi.js';
import { INTER_ROUND_MS, MAX_MISSES } from './config.js';
import { DifficultyProgression } from './gameplay/difficulty-progression.js';
import { RingTap } from './gameplay/ring-tap.js';
import { ScoringCombo } from './gameplay/scoring-combo.js';
import { AudioManager } from './audio/audio-manager.js';
import { BackgroundManager } from './rendering/backgrounds.js';
import { GameRenderer, GRADE_COLOR, FLASH_DURATION_MS } from './rendering/game-renderer.js';
import type { OrbFlash } from './rendering/game-renderer.js';
import { VfxManager } from './rendering/vfx-manager.js';
import { Hud } from './ui/hud.js';
import { TitleScreen } from './ui/title-screen.js';
import { ScoreScreen } from './ui/score-screen.js';
import { loadBestScore, saveBestScore } from './storage/high-score.js';

// ─── PixiJS application ────────────────────────────────────────────────────────

const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  background: '#000000',
  antialias: false,
  powerPreference: 'high-performance',
});
document.body.appendChild(app.canvas);

const W = app.screen.width;
const H = app.screen.height;

// ─── Systems ──────────────────────────────────────────────────────────────────

const difficulty = new DifficultyProgression();
const ringTap    = new RingTap();
const scoring    = new ScoringCombo();
const audio      = new AudioManager();

// Rendering layers (order matters — each addChild appends above the previous)
const backgrounds = new BackgroundManager(app.stage, W, H);
const renderer    = new GameRenderer(app.stage, W, H);
const vfx         = new VfxManager(app.stage, W, H);

// UI (DOM overlays, above canvas via z-index)
const hud         = new Hud();
const titleScreen = new TitleScreen();
const scoreScreen = new ScoreScreen();

// ─── Game state ───────────────────────────────────────────────────────────────

type GamePhase = 'TITLE' | 'PLAYING' | 'BETWEEN_ROUNDS' | 'SCORE';
let phase: GamePhase = 'TITLE';
let interRoundTimer = 0; // ms remaining in the between-rounds pause

interface ActiveFlash {
  color: number;
  remainingMs: number;
}
let activeFlash: ActiveFlash | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentHudState() {
  const diffState = difficulty.getDifficultyState();
  return {
    score:           scoring.score,
    combo:           scoring.combo,
    multiplier:      scoring.multiplier,
    level:           diffState.level + 1,
    missesRemaining: Math.max(0, MAX_MISSES - scoring.missCount),
  };
}

function startNextRound(): void {
  const diffState = difficulty.getDifficultyState();
  ringTap.startRound(diffState);
  backgrounds.setLevel(diffState.level);
  hud.update(currentHudState());
  phase = 'PLAYING';
}

function startSession(): void {
  difficulty.reset();
  ringTap.reset();
  scoring.reset();
  activeFlash = null;
  hud.update({ score: 0, combo: 0, multiplier: 1, level: 1, missesRemaining: MAX_MISSES });
  startNextRound();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

ringTap.onRingResolved(event => {
  scoring.onRingResolved(event);
  hud.showGrade(event.grade);
  hud.update(currentHudState());
  activeFlash = { color: GRADE_COLOR[event.grade], remainingMs: FLASH_DURATION_MS };

  switch (event.grade) {
    case 'PERFECT':
      vfx.spawnPerfectBurst();
      audio.playPerfect();
      break;
    case 'GOOD':
      audio.playGood();
      break;
    case 'MISS':
      vfx.spawnMissPulse();
      audio.playMiss();
      if (scoring.missCount >= MAX_MISSES) endSession();
      break;
  }
});

ringTap.onRoundEnd(() => {
  difficulty.onRoundEnd();
  phase = 'BETWEEN_ROUNDS';
  interRoundTimer = INTER_ROUND_MS;
});

// ─── Input ────────────────────────────────────────────────────────────────────

function endSession(): void {
  phase = 'SCORE';
  audio.pauseMusic();
  const isNewBest = saveBestScore(scoring.score);
  scoreScreen.show(
    {
      score:      scoring.score,
      maxCombo:   scoring.maxCombo,
      bestScore:  loadBestScore(),
      isNewBest,
    },
    () => {
      audio.resumeMusic();
      startSession();
    },
  );
}

function handleTap(): void {
  audio.resume(); // safe to call every tap; no-ops once context is running
  if (phase === 'PLAYING') {
    ringTap.onTap(performance.now());
  }
}

app.canvas.addEventListener('click', handleTap);
app.canvas.addEventListener('touchstart', (e: TouchEvent) => {
  e.preventDefault(); // suppress the delayed click and page scroll
  handleTap();
}, { passive: false });

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleTap();
  }
  if (e.code === 'Escape' && (phase === 'PLAYING' || phase === 'BETWEEN_ROUNDS')) {
    endSession();
  }
});

// ─── Main ticker ──────────────────────────────────────────────────────────────

app.ticker.add(() => {
  const dt = app.ticker.deltaMS / 1000;

  if (phase === 'BETWEEN_ROUNDS') {
    interRoundTimer -= app.ticker.deltaMS;
    if (interRoundTimer <= 0) startNextRound();
  }

  if (phase === 'PLAYING' || phase === 'BETWEEN_ROUNDS') {
    ringTap.update(dt);
  }

  if (activeFlash !== null) {
    activeFlash.remainingMs -= app.ticker.deltaMS;
    if (activeFlash.remainingMs <= 0) activeFlash = null;
  }

  backgrounds.update(performance.now());
  vfx.update(dt);

  const orbFlash: OrbFlash | null = activeFlash;
  renderer.draw(ringTap.rings, dt, orbFlash);
});

// ─── Boot — show title screen ─────────────────────────────────────────────────

// Run backgrounds while on title screen so the scene looks alive
backgrounds.setLevel(0);

titleScreen.show(() => {
  audio.resume();
  startSession();
});
