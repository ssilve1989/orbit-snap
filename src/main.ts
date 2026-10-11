/**
 * main.ts — game entry point and main loop.
 *
 * Two modes share one phase machine (see src/game-mode.ts):
 *   CLASSIC — rings converge on the central orb (S1–S3)
 *   SCATTER — targets appear across the screen; drafts between waves (S7–S10)
 *
 * Game phase state machine:
 *   TITLE          — title screen shown, waiting for a mode pick      → PLAYING
 *   PLAYING        — rings/targets active, input live                 → BETWEEN_ROUNDS | SCORE
 *   BETWEEN_ROUNDS — brief pause, then `pendingAction` runs           → PLAYING | DRAFT
 *   DRAFT          — Scatter only: power-up pick overlay shown         → PLAYING | SCORE
 *   SCORE          — score screen shown after the session ends        → PLAYING | TITLE
 */

import * as PIXI from 'pixi.js';
import { MAX_MISSES, ORB_RADIUS, PINPOINT_STEP } from './config.js';
import type { GameMode } from './game-mode.js';
import { DifficultyProgression } from './gameplay/difficulty-progression.js';
import { RingTap } from './gameplay/ring-tap.js';
import { ScoringCombo } from './gameplay/scoring-combo.js';
import { ScatterRun } from './gameplay/scatter-run.js';
import type { HitOutcome } from './gameplay/scatter-run.js';
import { TargetField } from './gameplay/target-field.js';
import type { TargetResolvedEvent } from './gameplay/target-field.js';
import { getPowerUp } from './gameplay/power-ups.js';
import { AudioManager } from './audio/audio-manager.js';
import { AmbientDust } from './rendering/ambient-dust.js';
import { Atmosphere, focusFromRingDistance, focusFromTimeToHit } from './rendering/atmosphere.js';
import { BackgroundManager } from './rendering/backgrounds.js';
import { GameRenderer, GRADE_COLOR, FLASH_DURATION_MS } from './rendering/game-renderer.js';
import type { OrbFlash } from './rendering/game-renderer.js';
import { TargetRenderer } from './rendering/target-renderer.js';
import { VfxManager } from './rendering/vfx-manager.js';
import { Hud } from './ui/hud.js';
import type { HudState } from './ui/hud.js';
import { TitleScreen } from './ui/title-screen.js';
import { ScoreScreen } from './ui/score-screen.js';
import type { ScoreStat } from './ui/score-screen.js';
import { PowerUpDraft } from './ui/power-up-draft.js';
import { loadBestScore, saveBestScore } from './storage/high-score.js';
import { initPwa } from './ui/pwa.js';

// ─── Presentation timings (not gameplay tuning) ──────────────────────────────

/** Pause after a Scatter wave clears before the draft opens (ms). */
const DRAFT_OPEN_DELAY_MS = 550;

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

const difficulty  = new DifficultyProgression();
const ringTap     = new RingTap();
const scoring     = new ScoringCombo();
const scatterRun  = new ScatterRun();
const targetField = new TargetField({ width: W, height: H }, scatterRun.timingRules);
const audio       = new AudioManager();

// Rendering layers (order matters — each addChild appends above the previous)
// shakeLayer: displaced during screen shake (backgrounds, rings, targets, particles)
// overlayLayer: above shakeLayer, NOT displaced (miss flash overlay)
const shakeLayer   = new PIXI.Container();
const overlayLayer = new PIXI.Container();
app.stage.addChild(shakeLayer);
app.stage.addChild(overlayLayer);

const backgrounds    = new BackgroundManager(shakeLayer, W, H);
const dust           = new AmbientDust(shakeLayer, W, H);
const renderer       = new GameRenderer(shakeLayer, W, H);
const targetRenderer = new TargetRenderer(shakeLayer);
const vfx            = new VfxManager(shakeLayer, overlayLayer, W, H);

// Backdrop reactivity (combo heat, ripple, focus, parallax, orb core)
const atmosphere = new Atmosphere({
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});

// UI (DOM overlays, above canvas via z-index)
const hud         = new Hud();
const titleScreen = new TitleScreen();
const scoreScreen = new ScoreScreen();
const draftUi     = new PowerUpDraft();

// ─── Game state ───────────────────────────────────────────────────────────────

type GamePhase = 'TITLE' | 'PLAYING' | 'BETWEEN_ROUNDS' | 'DRAFT' | 'SCORE';
let phase: GamePhase = 'TITLE';
let mode: GameMode = 'CLASSIC';
let interRoundTimer = 0; // ms remaining in the between-rounds pause
let pendingAction: () => void = () => {};

interface ActiveFlash {
  color: number;
  remainingMs: number;
}
let activeFlash: ActiveFlash | null = null;

const isLive = (): boolean => phase === 'PLAYING' || phase === 'BETWEEN_ROUNDS' || phase === 'DRAFT';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentHudState(): HudState {
  if (mode === 'SCATTER') {
    return {
      score:           scatterRun.score,
      combo:           scatterRun.combo,
      multiplier:      scatterRun.multiplier,
      level:           scatterRun.wave + 1,
      levelLabel:      'WAVE',
      missesRemaining: scatterRun.heartsRemaining,
      shields:         scatterRun.shields,
      streak:          scatterRun.streak,
      loadout:         [...scatterRun.loadout]
        .filter(([id]) => getPowerUp(id).kind === 'passive')
        .map(([id, n]) => `${getPowerUp(id).name}${n > 1 ? ` ×${n}` : ''}`),
    };
  }
  const diffState = difficulty.getDifficultyState();
  return {
    score:           scoring.score,
    combo:           scoring.combo,
    multiplier:      scoring.multiplier,
    level:           diffState.level + 1,
    missesRemaining: Math.max(0, MAX_MISSES - scoring.missCount),
  };
}

/**
 * Focus pull target 0..1: how close the next hit is. Classic uses the nearest
 * active ring's gap to the orb edge; Scatter uses the most urgent target's time.
 */
function currentFocus(): number {
  if (phase !== 'PLAYING') return 0;
  if (mode === 'CLASSIC') {
    let gap = Infinity;
    for (const ring of ringTap.rings) {
      if (ring.state === 'ACTIVE') gap = Math.min(gap, ring.radius - ORB_RADIUS);
    }
    return gap === Infinity ? 0 : focusFromRingDistance(gap);
  }
  let timeToHit = Infinity;
  for (const t of targetField.targets) timeToHit = Math.min(timeToHit, t.timeToHit);
  return timeToHit === Infinity ? 0 : focusFromTimeToHit(timeToHit, scatterRun.timingRules.goodMs);
}

/** Enter BETWEEN_ROUNDS and run `action` once `ms` elapses. */
function pauseThen(ms: number, action: () => void): void {
  phase = 'BETWEEN_ROUNDS';
  interRoundTimer = ms;
  pendingAction = action;
}

function startNextRound(): void {
  const diffState = difficulty.getDifficultyState();
  ringTap.startRound(diffState);
  backgrounds.setLevel(diffState.level);
  hud.update(currentHudState());
  phase = 'PLAYING';
}

function startScatterWave(): void {
  const params = scatterRun.beginWave();
  targetField.setRules(scatterRun.timingRules);
  targetField.startWave(params);
  backgrounds.setLevel(params.wave);
  hud.update(currentHudState());
  hud.showBanner(`WAVE ${params.wave + 1}`, `${params.targetCount} TARGETS`);
  phase = 'PLAYING';
}

function startSession(selected: GameMode = mode): void {
  mode = selected;
  hud.setVisible(true);
  activeFlash = null;
  renderer.clear();
  targetRenderer.clear();
  vfx.reset();

  if (mode === 'SCATTER') {
    scatterRun.reset();
    targetField.reset();
    startScatterWave();
  } else {
    difficulty.reset();
    ringTap.reset();
    scoring.reset();
    startNextRound();
  }
}

// ─── Event wiring: Classic ───────────────────────────────────────────────────

ringTap.onRingResolved(event => {
  scoring.onRingResolved(event);
  hud.showGrade(event.grade);
  hud.update(currentHudState());
  activeFlash = { color: GRADE_COLOR[event.grade], remainingMs: FLASH_DURATION_MS };
  atmosphere.onGrade(event.grade, 0.5, 0.5, GRADE_COLOR[event.grade]);

  switch (event.grade) {
    case 'PERFECT':
      vfx.spawnPerfectBurst();
      audio.playPerfect();
      break;
    case 'GOOD':
      vfx.spawnGoodBurst();
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
  const levelBefore = difficulty.getDifficultyState().level;
  difficulty.onRoundEnd();
  const levelAfter = difficulty.getDifficultyState().level;
  if (levelAfter > levelBefore) audio.playLevelUp();
  pauseThen(difficulty.getDifficultyState().interRoundMs, startNextRound);
});

// ─── Event wiring: Scatter ───────────────────────────────────────────────────

targetField.onTargetResolved(event => {
  if (mode !== 'SCATTER' || phase !== 'PLAYING') return;
  const outcome = scatterRun.resolve(event.grade);
  presentScatterOutcome(event, outcome);
  hud.update(currentHudState());
  if (outcome.gameOver) endSession();
});

targetField.onWaveEnd(() => {
  if (mode !== 'SCATTER' || phase !== 'PLAYING') return;
  const cleared = scatterRun.wave + 1;
  scatterRun.completeWave();
  audio.playLevelUp();
  pauseThen(DRAFT_OPEN_DELAY_MS, () => openDraft(cleared));
});

function presentScatterOutcome(event: TargetResolvedEvent, outcome: HitOutcome): void {
  const { x, y } = event;
  if (!outcome.shieldUsed) {
    atmosphere.onGrade(outcome.grade, x / W, y / H, GRADE_COLOR[outcome.grade]);
  }
  switch (outcome.grade) {
    case 'PERFECT':
      vfx.spawnPerfectBurst(x, y);
      audio.playPerfect();
      targetRenderer.addResolve(x, y, 'PERFECT', `+${outcome.points - outcome.milestonePoints}`);
      break;
    case 'GOOD': {
      vfx.spawnGoodBurst(x, y);
      audio.playGood();
      const hint = outcome.pinpoint.guarded ? 'GUARDED' : timingHint(event.offsetMs);
      targetRenderer.addResolve(x, y, 'GOOD', hint);
      break;
    }
    case 'MISS':
      if (outcome.shieldUsed) {
        vfx.spawnShieldBlock(x, y);
        targetRenderer.addShieldBlock(x, y);
        audio.playShield();
      } else {
        vfx.spawnMissPulse();
        targetRenderer.addResolve(x, y, 'MISS', event.auto ? undefined : timingHint(event.offsetMs));
        audio.playMiss();
      }
      break;
  }

  if (outcome.pinpoint.isMilestone) {
    vfx.spawnMilestoneBurst(x, y);
    audio.playMilestone();
    hud.pulseStreak();
    targetRenderer.addLabel(x, y + 44, `PINPOINT ×${outcome.pinpoint.streak}  +${outcome.milestonePoints}`, {
      color: 0xffd34d, size: 15, delay: 0.25,
    });
  }
  if (outcome.shieldGained) {
    targetRenderer.addLabel(x, y + 64, '+SHIELD', { color: 0x66ccff, size: 12, delay: 0.35 });
  }
  if (outcome.pinpoint.broken && outcome.grade !== 'MISS' && scatterRun.bestStreak >= PINPOINT_STEP) {
    targetRenderer.addLabel(x, y + 44, 'STREAK LOST', { color: 0x888888, size: 11, delay: 0.15 });
  }
}

/** Positive offset = tapped before the hit moment. */
function timingHint(offsetMs: number): string {
  return offsetMs > 0 ? 'EARLY' : 'LATE';
}

function openDraft(clearedWave: number): void {
  const offer = scatterRun.offerDraft();
  if (offer.length === 0) {
    startScatterWave();
    return;
  }
  phase = 'DRAFT';
  draftUi.show(
    `WAVE ${clearedWave} CLEARED`,
    offer.map(def => ({
      id: def.id,
      name: def.name,
      description: def.description,
      owned: scatterRun.loadout.get(def.id) ?? 0,
      maxStacks: def.maxStacks,
      kind: def.kind,
    })),
    pickedId => {
      const def = offer.find(d => d.id === pickedId);
      if (def === undefined || phase !== 'DRAFT') return;
      scatterRun.pick(def.id);
      audio.playPowerUp();
      startScatterWave();
    },
  );
}

// ─── Session end ──────────────────────────────────────────────────────────────

function endSession(): void {
  phase = 'SCORE';
  activeFlash = null;
  draftUi.hide();
  hud.hideBanner();
  renderer.clear();
  targetRenderer.clear();
  targetField.reset();
  vfx.reset();
  audio.pauseMusic();

  const finalScore = mode === 'SCATTER' ? scatterRun.score : scoring.score;
  const isNewBest = saveBestScore(finalScore, mode);
  const stats: ScoreStat[] = mode === 'SCATTER'
    ? [
        { label: 'WAVE',     value: scatterRun.wave + 1 },
        { label: 'COMBO',    value: scatterRun.maxCombo },
        { label: 'PINPOINT', value: scatterRun.bestStreak },
        { label: 'PERFECT',  value: `${Math.round(scatterRun.accuracy * 100)}%` },
      ]
    : [
        { label: 'LEVEL', value: difficulty.getDifficultyState().level + 1 },
        { label: 'COMBO', value: scoring.maxCombo },
      ];

  scoreScreen.show(
    { score: finalScore, bestScore: loadBestScore(mode), isNewBest, stats },
    () => {
      audio.resumeMusic();
      startSession();
    },
    () => {
      hud.setVisible(false);
      titleScreen.show(selected => {
        audio.resumeMusic();
        startSession(selected);
      });
    },
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * Route a tap. Classic ignores position. Scatter hit-tests the position; with no
 * position (keyboard) it grades the target nearest its hit moment.
 */
function handleTap(x?: number, y?: number): void {
  audio.resume(); // safe to call every tap; no-ops once context is running
  if (phase !== 'PLAYING') return;

  if (mode === 'CLASSIC') {
    ringTap.onTap(performance.now());
    return;
  }

  if (x === undefined || y === undefined) {
    targetField.tapMostUrgent();
  } else if (targetField.tap(x, y) === null) {
    targetRenderer.addWhiff(x, y);
  }
}

app.canvas.addEventListener('mousedown', (e: MouseEvent) => {
  handleTap(e.offsetX, e.offsetY);
});
app.canvas.addEventListener('touchstart', (e: TouchEvent) => {
  e.preventDefault(); // suppress the delayed click and page scroll
  const rect = app.canvas.getBoundingClientRect();
  // Each new finger is its own tap — lets players hit two Scatter targets at once
  for (const touch of Array.from(e.changedTouches)) {
    handleTap(touch.clientX - rect.left, touch.clientY - rect.top);
  }
}, { passive: false });

// Pointer position steers the parallax camera (window-level so overlays don't block it)
window.addEventListener('pointermove', (e: PointerEvent) => {
  atmosphere.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault();
    handleTap();
  }
  if (e.code === 'Escape' && isLive()) {
    endSession();
  }
});

// ─── Main ticker ──────────────────────────────────────────────────────────────

app.ticker.add(() => {
  const dt = app.ticker.deltaMS / 1000;

  if (phase === 'BETWEEN_ROUNDS') {
    interRoundTimer -= app.ticker.deltaMS;
    if (interRoundTimer <= 0) pendingAction();
  }

  if (mode === 'CLASSIC' && (phase === 'PLAYING' || phase === 'BETWEEN_ROUNDS')) {
    ringTap.update(dt);
  }
  if (mode === 'SCATTER' && phase === 'PLAYING') {
    targetField.update(dt);
  }

  if (activeFlash !== null) {
    activeFlash.remainingMs -= app.ticker.deltaMS;
    if (activeFlash.remainingMs <= 0) activeFlash = null;
  }

  const live = isLive();
  atmosphere.setCombo(live ? (mode === 'SCATTER' ? scatterRun.combo : scoring.combo) : 0);
  atmosphere.setFocus(currentFocus());
  atmosphere.setOrbVisible(live && mode === 'CLASSIC');
  atmosphere.update(dt);
  backgrounds.update(atmosphere.frame);
  dust.update(dt, atmosphere.frame, live && mode === 'CLASSIC');

  if (isLive()) {
    vfx.update(dt);
    if (mode === 'CLASSIC') {
      const orbFlash: OrbFlash | null = activeFlash;
      renderer.draw(ringTap.rings, dt, orbFlash);
    } else {
      targetRenderer.draw(targetField.targets, dt);
    }
  }
});

// ─── Boot — show title screen ─────────────────────────────────────────────────

// Run backgrounds while on title screen so the scene looks alive
backgrounds.setLevel(0);
hud.setVisible(false);

titleScreen.show(selected => {
  audio.resume();
  startSession(selected);
});

initPwa();
