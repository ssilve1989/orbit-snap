# Scatter Mode (S7–S10)

> **Status**: Designed + Implemented (first pass, pending playtest)
> **Author**: User + Claude Code
> **Last Updated**: 2026-10-11
> **Implements Pillars**: Skill Ladder, Escalating Tension
> **Systems**: S7 Target Field · S8 Wave Progression · S9 Pinpoint Streak · S10 Roguelite Power-Ups

## Overview

Scatter is a second game mode selectable from the title screen. Instead of rings
converging on one central orb, **targets pop up anywhere on the screen**, each with
its own approach ring shrinking onto it. Targets spawn on a jittered, staggered
timer, so two or three are often live at once with different hit moments. The
player must both *find* each target and *time* the tap, graded with the same
Perfect / Good / Miss feel as Classic. Play is split into **waves**; after each
cleared wave the player **drafts one of three power-ups** (roguelite style) that
persist for the rest of the run. Consecutive Perfects build a **Pinpoint Streak**
that pays escalating bonus points and milestone rewards.

## Player Fantasy

Classic is about rhythm and focus on a single point. Scatter is about **spatial
juggling under time pressure**: eyes darting across the screen, reading which ring
closes first, and snapping to it precisely. The Pinpoint Streak makes precision
feel like a high-stakes chain worth protecting: every Perfect pays a bit more, and
a single sloppy Good costs you the whole run of bonuses. The draft adds run-to-run
variety and a "build" fantasy: a forgiving Wide Lens + Aegis run feels different
from a greedy Overcharge + Momentum glass-cannon run.

## Detailed Rules

### S7 — Target Field

1. A target is a disc of radius `TARGET_RADIUS` at a random position inside the
   playfield (`TARGET_EDGE_MARGIN` from edges, never above `TARGET_TOP_MARGIN`,
   which is the HUD band).
2. Placement samples up to `TARGET_PLACEMENT_ATTEMPTS` positions and keeps the first
   at least `TARGET_MIN_SPACING` from every live target, falling back to the most
   spaced candidate.
3. Each target has an **approach duration** `A`. Its ring shrinks linearly from
   `TARGET_RADIUS + TARGET_RING_START_OFFSET` to `TARGET_RADIUS` over `A`. The
   moment the ring touches the disc is the **hit moment**.
4. **Tap (pointer)**: among live targets whose hit area (radius
   `TARGET_RADIUS × TARGET_HIT_RADIUS_MULT × hitRadiusMult`) contains the point,
   the one closest to its hit moment is graded. A tap that touches no target is
   ignored (a faint "whiff" ripple is shown; no penalty).
5. **Tap (keyboard Space)**: accessibility fallback that grades the live target
   closest to its hit moment.
6. Multi-touch: each new finger is its own tap, so two targets can be hit at once.
7. Grading uses the absolute timing error (see Formulas). Tapping a target far too
   early is a MISS, the same as tapping too early in Classic.
8. A target not tapped by `goodMs + SCATTER_AUTO_MISS_MS` after its hit moment
   auto-misses.

### S8 — Wave Progression

1. A wave spawns `targetCount` targets. The first spawns after `WAVE_LEAD_IN_MS`;
   each next one after `spawnInterval × (1 ± WAVE_SPAWN_JITTER)`.
2. The wave ends when all targets are spawned and resolved. The run then pauses
   briefly and opens the draft.
3. The background tier follows the wave index (same 5-tier cycle as Classic).

### S9 — Pinpoint Streak

1. PERFECT increments the streak. GOOD resets it (unless a Streak Guard charge is
   spent). MISS always resets it, shielded or not.
2. Every Perfect earns a per-hit bonus by tier; crossing each tier boundary earns a
   one-off milestone bonus (gold burst, chime, floating "PINPOINT ×N").
3. The combo (S2) is separate: GOOD keeps the combo but breaks the streak.

### S10 — Roguelite Power-Ups

1. After each wave, `DRAFT_CHOICES` distinct eligible power-ups are offered,
   weighted by `POWER_UP_TUNING[id].weight`. The player picks one (tap or 1/2/3).
2. A power-up is eligible if under its `maxStacks` and its gate passes:
   Aegis needs shields < `PU_MAX_SHIELDS`; Second Wind needs a lost heart;
   Momentum needs comboStep > `PU_MOMENTUM_MIN_STEP`.
3. If nothing is eligible the draft is skipped.
4. Loadout resets when the run ends.

| Power-up | Kind | Effect (per stack) | Max |
|---|---|---|---|
| Steady Hand | passive | Perfect window +`PU_STEADY_HAND_MS` | 3 |
| Wide Lens | passive | Good window +`PU_WIDE_LENS_MS` | 3 |
| Time Dilation | passive | Approach duration +`PU_TIME_DILATION_PCT` | 3 |
| Overcharge | passive | Score ×(1 + `PU_OVERCHARGE_PCT`·n) | 4 |
| Magnet Touch | passive | Hit radius +`PU_MAGNET_PCT` | 2 |
| Aegis | instant | +1 shield: absorbs a miss (no heart lost, combo kept; streak still breaks) | cap `PU_MAX_SHIELDS` held |
| Second Wind | instant | Restore 1 heart | — |
| Streak Guard | passive | One GOOD per wave doesn't break the streak | 2 |
| Momentum | passive | Combo step −`PU_MOMENTUM_STEP_REDUCTION` | 2 |
| Resonance | passive | Each Pinpoint milestone grants a shield | 1 |

### States and Transitions (main loop)

| Phase | Enters when | Exits to |
|---|---|---|
| `PLAYING` | wave starts | `BETWEEN_ROUNDS` (wave cleared) / `SCORE` (hearts = 0 or Esc) |
| `BETWEEN_ROUNDS` | wave cleared | `DRAFT` after `DRAFT_OPEN_DELAY_MS` (or `PLAYING` if draft empty) |
| `DRAFT` | offer non-empty | `PLAYING` (pick) / `SCORE` (Esc) |
| `SCORE` | run over | `PLAYING` (retry, same mode) / `TITLE` |

## Formulas

**Grade** (timing error `e` = ms until hit moment; + early, − late):

```
|e| ≤ perfectMs → PERFECT
|e| ≤ goodMs    → GOOD
otherwise       → MISS
perfectMs = SCATTER_PERFECT_MS + steadyHand × PU_STEADY_HAND_MS           (70 base)
goodMs    = max(SCATTER_GOOD_MS + wideLens × PU_WIDE_LENS_MS, perfectMs+1) (160 base)
```

Rationale: Classic's PERFECT_WINDOW of 9 px at 115 px/s ≈ ±78 ms and GOOD 22 px
≈ ±191 ms. Scatter is slightly tighter on Good to offset the generous hit area,
and similar on Perfect so skill transfers between modes.

**Wave parameters** (`w` = zero-based wave):

```
targetCount     = min(8 + 2w, 24)
approachMs      = max(1500 − 70w, 820) × (1 + timeDilation × 0.12)
spawnIntervalMs = max(950 − 60w, 360)
avg concurrent  ≈ approachMs / spawnIntervalMs   (≈1.6 at w=0 → ≈2.3 at w≥10)
```

**Pinpoint**:

```
tier          = min(floor(streak / PINPOINT_STEP), PINPOINT_MAX_TIER)    (step 5, max 6)
hitBonus      = PINPOINT_BONUS_PER_TIER × tier                            (30/tier)
milestone     = PINPOINT_MILESTONE_BONUS × tier, when streak % 5 = 0 and tier ≤ 6   (250/tier)
```

**Hit score**:

```
comboMult = MULTIPLIER_TABLE[min(floor(combo / comboStep), 3)]   (sampled before increment)
points    = round((base × comboMult + hitBonus) × scoreMult) + round(milestone × scoreMult)
base      = 100 (Perfect) / 50 (Good);  scoreMult = 1 + 0.25 × overcharge
comboStep = max(COMBO_STEP − momentum, 2)
```

**Worked example**: 10th consecutive Perfect, combo 14 before the hit, one
Overcharge stack, no Momentum. tier = 2, hitBonus = 60, milestone = 500,
comboMult = TABLE[floor(14/5)=2] = 3, scoreMult = 1.25.
points = round((100 × 3 + 60) × 1.25) + round(500 × 1.25) = 450 + 625 = **1075**.

## Edge Cases

- **Overlapping targets**: tap grades the one closest to its hit moment, which
  gives the player the best available grade.
- **Long frame / tab hitch**: spawns catch up in a loop and subtract overshoot
  from the new target's timer, so timing stays frame-rate independent.
- **Game over mid-frame**: if a listener ends the run during auto-miss
  processing, the field stops immediately (no further events, no spurious wave
  end). A regression test covers this.
- **Tiny screens**: placement bounds collapse safely (`minY = min(TOP_MARGIN, H/2)`).
- **Stray tap on empty space**: ignored (no penalty) so aiming errors aren't
  double-punished; timing errors on a real target still MISS.
- **Late tap from the last wave hitting a draft card**: draft input ignores
  taps for `INPUT_COOLDOWN_MS` after it opens.
- **All power-ups maxed**: the draft is skipped.
- **Shielded miss**: no heart lost, combo kept, Pinpoint streak still broken.
- **Best score**: stored per mode; Classic keeps its original storage key.

## Dependencies

- **S1 Ring Tap**: `Grade` type; visual ring colour ramp.
- **S2 Scoring & Combo**: `PERFECT_BASE`, `GOOD_BASE`, `MULTIPLIER_TABLE`,
  `COMBO_STEP` (re-used, not modified).
- **S4 End Condition**: `MAX_MISSES` hearts.
- **Presentation**: `TargetRenderer`, `VfxManager` (positional bursts),
  `Hud` (wave label, shields, streak, loadout, banner), `PowerUpDraft`,
  `ScoreScreen` (mode-specific stats), `AudioManager` (milestone, power-up, shield cues).

Code: `src/gameplay/target-field.ts`, `wave-progression.ts`, `pinpoint-streak.ts`,
`power-ups.ts`, `scatter-run.ts`. Tests: `tests/scatter-mode.test.ts`.

## Tuning Knobs

All in `src/config.ts` under S7–S10:

| Knob | Default | Safe range | Effect |
|---|---|---|---|
| `TARGET_RADIUS` | 26 | 20–36 | Visual size |
| `TARGET_HIT_RADIUS_MULT` | 1.7 | 1.2–2.2 | Touch forgiveness |
| `TARGET_RING_START_OFFSET` | 84 | 60–120 | Ring travel; larger = easier to read timing |
| `SCATTER_PERFECT_MS` / `SCATTER_GOOD_MS` | 70 / 160 | 50–90 / 130–200 | Timing strictness |
| `WAVE_BASE_*` / `*_DECREMENT` / `*_MIN_*` | see config | — | Ramp speed and ceiling |
| `WAVE_SPAWN_JITTER` | 0.35 | 0–0.5 | Irregularity of the stagger |
| `PINPOINT_STEP` / `_BONUS_PER_TIER` / `_MILESTONE_BONUS` / `_MAX_TIER` | 5 / 30 / 250 / 6 | — | How much precision pays |
| `DRAFT_CHOICES` | 3 | 2–4 | Draft breadth |
| `POWER_UP_TUNING` | table | — | Max stacks + draft weights |
| `PU_*` | see config | — | Per-stack strength |

## Acceptance Criteria

- [x] Title screen offers Classic and Scatter; Classic behaviour is unchanged.
- [x] Targets appear at random on-screen positions with staggered, jittered spawns;
      2+ targets are regularly live at once from wave 1.
- [x] Each target is graded independently with Perfect/Good/Miss on its own timing.
- [x] Taps outside any target are ignored; taps on a target outside the Good window MISS.
- [x] 5 consecutive Perfects trigger a Pinpoint milestone with bonus points + VFX/SFX.
- [x] A GOOD breaks the Pinpoint streak but not the combo; Streak Guard forgives one per wave.
- [x] After each wave a draft of up to 3 distinct eligible power-ups appears;
      the pick takes effect from the next wave.
- [x] Shields absorb misses; Second Wind restores a heart; the run ends at 0 hearts.
- [x] Best score is tracked separately per mode.
- [x] All gameplay logic covered by unit tests (`tests/scatter-mode.test.ts`).
- [ ] Playtest: wave 1 is clearable by a new player; waves 8+ feel hectic but fair.
- [ ] Playtest: no single power-up is a must-pick (check pick rates after ~20 runs).
