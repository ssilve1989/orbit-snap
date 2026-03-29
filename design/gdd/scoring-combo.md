# Scoring & Combo

> **Status**: Designed
> **Author**: User + Claude Code
> **Last Updated**: 2026-03-29
> **Implements Pillars**: Skill Ladder, Escalating Tension

## Overview

Scoring & Combo tracks the player's score and streak across the session. Each
resolved ring contributes points based on its grade and an active combo multiplier.
The combo counter increments on every Perfect or Good and resets to zero on any
Miss or auto-miss. Score is cumulative and never decreases. The system receives
`RingResolved` events from Ring Tap and exposes current score, combo count, and
max combo to the HUD.

## Player Fantasy

Score is the proof of skill. A long combo turns routine Good hits into something
worth chasing — the multiplier makes the player feel like they are building
momentum, not just accumulating taps. Breaking a combo hurts because the player
was invested in it. The max combo displayed at the end of the session gives a
concrete personal target to beat on the next run. A perfect run — all Perfects,
no Misses — should feel meaningfully different on the scoreboard from a sloppy one.

## Detailed Design

### Core Rules

1. On receiving `RingResolved`, the system updates score and combo according to grade:
   - **Perfect**: combo increments; score += `PERFECT_BASE × comboMultiplier`
   - **Good**: combo increments; score += `GOOD_BASE × comboMultiplier`
   - **Miss**: combo resets to 0; score unchanged
2. `comboMultiplier` is derived from the current combo count via a stepped table
   (see Formulas).
3. `maxCombo` tracks the highest combo count reached in the session; never decreases.
4. Score never decreases — Misses cost the player their multiplier, not their points.
5. All state (score, combo, maxCombo) resets only on a full session restart, not
   between rounds.

### States and Transitions

| State | Condition | Effect |
|-------|-----------|--------|
| `IDLE` | Awaiting first `RingResolved` | Score = 0, combo = 0 |
| `STREAK` | Last resolution was Perfect or Good | combo incrementing, multiplier active |
| `BROKEN` | Last resolution was Miss | combo = 0, multiplier = 1× |

### Interactions with Other Systems

- **← S1 Ring Tap**: receives `RingResolved { grade, ringId, timestamp }` — sole input
- **→ S5 HUD**: exposes read-only `{ score, combo, maxCombo, multiplier }` — HUD reads
  each frame

## Formulas

**Score per grade:**
```
score += PERFECT_BASE × comboMultiplier   (on Perfect)
score += GOOD_BASE    × comboMultiplier   (on Good)
score += 0                                 (on Miss)
```

**Combo multiplier (stepped):**

| Combo count | Multiplier |
|-------------|------------|
| 0–4 | 1× |
| 5–9 | 2× |
| 10–19 | 3× |
| 20+ | 4× (cap) |

```
comboMultiplier = MULTIPLIER_TABLE[floor(combo / COMBO_STEP)]
                  capped at MULTIPLIER_TABLE[last entry]
```

**Max combo:**
```
maxCombo = max(maxCombo, combo)  — evaluated after each increment
```

**Prototype-validated base values:**

| Variable | Value | Notes |
|----------|-------|-------|
| `PERFECT_BASE` | 100 pts | |
| `GOOD_BASE` | 50 pts | |
| `COMBO_STEP` | 5 | Hits before next multiplier tier |
| `MULTIPLIER_CAP` | 4× | Maximum multiplier |

**Example — 10-hit Perfect streak:**
`(5 × 100 × 1) + (5 × 100 × 2) = 500 + 1000 = 1500 pts`

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Miss on first hit (combo = 0) | Combo stays at 0; no change; no negative state |
| Two rings resolved simultaneously (multi-ring round) | Events processed in arrival order; each updates combo and score independently |
| Perfect immediately after a Miss | Combo starts fresh at 1; multiplier returns to 1× |
| `COMBO_STEP = 0` | Invalid config — divide by zero in multiplier lookup; minimum value is 1 |
| Score integer overflow | Use 64-bit integer or floating point; at 4× multiplier + 100 pts per ring + 60 fps, overflow is not reachable in a jam-scope session |
| Session restart mid-combo | All state (score, combo, maxCombo) resets to 0 |
| `RingResolved` received with unknown grade value | Treat as Miss; log a warning |

## Dependencies

| Direction | System | Type | Interface |
|-----------|--------|------|-----------|
| Upstream | S1 Ring Tap | Hard | Receives `RingResolved { grade, ringId, timestamp }` — cannot function without it |
| Downstream | S5 HUD | Soft | Exposes `{ score, combo, maxCombo, multiplier }` — scoring functions without HUD |

## Tuning Knobs

| Knob | Default | Safe Range | Too Low | Too High |
|------|---------|------------|---------|----------|
| `PERFECT_BASE` | 100 pts | 50–200 | Score feels meaningless; numbers too small | Score inflates rapidly; 4-digit scores in first round feel cheap |
| `GOOD_BASE` | 50 pts | 25–100 | Good hits feel like charity | Good hits rival Perfects; grade distinction devalued |
| `COMBO_STEP` | 5 | 3–10 | Multiplier climbs so fast it dominates score | Takes too long to reach higher multipliers; streak feels unrewarded |
| `MULTIPLIER_CAP` | 4× | 2×–6× | Long streaks feel unrecognised | High multipliers make early score irrelevant |

**Ratio to preserve**: `PERFECT_BASE / GOOD_BASE` should remain ≥ 1.8× so that
grinding Goods never outpaces hitting Perfects at the same combo level. At defaults:
100/50 = 2× — a player landing all Perfects will always outscore one landing all
Goods at equivalent combo.

## Visual / Audio Requirements

[To be designed]

## UI Requirements

[To be designed]

## Acceptance Criteria

- [ ] Perfect grade awards `PERFECT_BASE × comboMultiplier` points
- [ ] Good grade awards `GOOD_BASE × comboMultiplier` points
- [ ] Miss grade awards 0 points and resets combo to 0
- [ ] Auto-miss is treated identically to Miss for scoring purposes
- [ ] Combo increments by 1 on every Perfect or Good
- [ ] `comboMultiplier` matches the stepped table at every combo count boundary
- [ ] `maxCombo` never decreases within a session
- [ ] Score never decreases within a session
- [ ] All state resets to zero on session restart
- [ ] `PERFECT_BASE / GOOD_BASE ≥ 1.8×` — all-Perfects run always outscores all-Goods run at same combo
- [ ] `{ score, combo, maxCombo, multiplier }` readable by HUD at any point in a frame
- [ ] All values loaded from external config; no scoring constants hardcoded

## Open Questions

[To be designed]
