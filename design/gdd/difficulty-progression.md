# Difficulty Progression

> **Status**: Designed
> **Author**: User + Claude Code
> **Last Updated**: 2026-03-29
> **Implements Pillar**: Escalating Tension

## Overview

Difficulty Progression tracks how many rounds the player has completed and advances
the game through a sequence of difficulty levels. Each level defines the number of
simultaneous rings that spawn and the speed at which they converge. The system
provides the sole mechanism for escalating challenge — no other system drives
difficulty independently.

## Player Fantasy

The player never sees a "difficulty up" screen — they simply notice the game is
pushing back harder. A second ring appears mid-session and the player feels the
shift in cognitive load before they consciously register it. The progression should
feel like the game is watching them and responding, not like they unlocked a new
mode. Mastery means three simultaneous rings feeling manageable — the same loop,
just more demanding.

## Detailed Design

### Core Rules

1. The game tracks a single counter: `roundsPlayed`, incremented each time all
   rings in a round are resolved (hit or missed).
2. The current difficulty level is derived:
   `diffLevel = floor(roundsPlayed / ROUNDS_PER_LEVEL)`.
3. Each difficulty level maps to a **ring count** and a **ring speed** via a
   lookup table.
4. When `diffLevel` exceeds the last defined entry, the table wraps (endless
   loop at maximum difficulty).
5. The active `diffLevel` is re-evaluated at the start of each new round —
   never mid-round.

### States and Transitions

| State   | Condition    | Ring Count | Notes                                              |
|---------|--------------|------------|----------------------------------------------------|
| Level 1 | rounds 0–3   | 1          | Tutorial feel — one ring, learn the timing         |
| Level 2 | rounds 4–7   | 1          | Same count, speed increase signals the ramp        |
| Level 3 | rounds 8–11  | 2          | First multi-ring — stagger makes it readable       |
| Level 4 | rounds 12–15 | 2          | Speed increase on 2-ring                           |
| Level 5 | rounds 16–19 | 3          | Skill ceiling — full cognitive load                |
| Level 6+ | rounds 20+  | 3          | Wraps; speed continues to increase each cycle      |

### Interactions with Other Systems

- **→ S1 Ring Tap**: emits `DifficultyState { level, ringCount, ringSpeed, staggerMs }`
  at the start of each round. Ring Tap reads this to determine how many rings to
  spawn and at what speed.
- **→ S6 Level/Pattern System** *(future)*: difficulty level will eventually select
  which pattern set to use. For MVP, ring count alone is sufficient.
- **← none**: Difficulty Progression has no upstream inputs — it derives state
  solely from `roundsPlayed`.

## Formulas

**Difficulty level:**
```
diffLevel = floor(roundsPlayed / ROUNDS_PER_LEVEL)
```

**Ring count lookup:**
```
ringCount = RING_COUNT_TABLE[diffLevel % len(RING_COUNT_TABLE)]
```

**Ring speed:**
```
ringSpeed = BASE_RING_SPEED + (diffLevel * SPEED_INCREMENT)
```
Capped at `MAX_RING_SPEED` to prevent the timing window becoming physically impossible.

**Stagger offset** (time between simultaneous ring spawns — unchanged by difficulty):
```
staggerMs = STAGGER_MS  (constant)
```

**Prototype-validated values:**

| Variable | Prototype Value | Notes |
|----------|----------------|-------|
| `ROUNDS_PER_LEVEL` | 4 | Rounds before level advance |
| `RING_COUNT_TABLE` | [1, 1, 2, 2, 3] | Per-level ring counts |
| `BASE_RING_SPEED` | 115 px/s | Validated feel at 115 |
| `SPEED_INCREMENT` | 0 px/s | Not implemented in prototype — TBD for production |
| `MAX_RING_SPEED` | TBD | Upper safety cap |
| `STAGGER_MS` | 550 ms | Validated for 2-ring readability |

## Edge Cases

| Situation | Handling |
|-----------|----------|
| `roundsPlayed` reaches end of `RING_COUNT_TABLE` | `diffLevel % len(table)` wraps back to index 0 — speed continues increasing but ring count resets to table start |
| `ringSpeed` hits `MAX_RING_SPEED` | Cap and hold — do not increase further; Perfect window floor is ~40 ms (human reaction limit) |
| Player completes a round with no taps (all auto-missed) | `roundsPlayed` still increments — difficulty advances regardless of performance |
| `ROUNDS_PER_LEVEL = 0` | Undefined behaviour — treat as invalid config; minimum value is 1 |
| 4+ simultaneous rings requested via table | Not tested in prototype; flag in implementation — likely requires per-ring colour coding to remain readable |
| `STAGGER_MS` ≥ round duration | Last ring would never spawn before the round ends; `STAGGER_MS` must be < `(RING_MAX_RADIUS - ORB_RADIUS) / ringSpeed * 1000` |

## Dependencies

| Direction | System | Type | Interface |
|-----------|--------|------|-----------|
| Upstream | none | — | — |
| Downstream | S1 Ring Tap | Hard | Provides `DifficultyState { level, ringCount, ringSpeed, staggerMs }` each round start |
| Downstream | S6 Level/Pattern System *(future)* | Soft | Provides `level` index for pattern selection; S6 can function with ring count alone for MVP |

## Tuning Knobs

| Knob | Default | Safe Range | Too Low | Too High |
|------|---------|------------|---------|----------|
| `ROUNDS_PER_LEVEL` | 4 | 2–8 | Ramp feels rushed; player has no time to adapt | Ramp feels invisible; game stays easy too long |
| `RING_COUNT_TABLE` | [1,1,2,2,3] | Max entry ≤ 3 (untested beyond) | Single ring throughout = no escalation | 4+ rings untested; readability unknown |
| `BASE_RING_SPEED` | 115 px/s | 90–145 | Timing feels trivial; Perfect window ~120 ms | Timing feels punishing; Perfect window ~55 ms |
| `SPEED_INCREMENT` | 0 px/s | 0–8 | No speed escalation | Speed becomes dominant difficulty axis; may overshadow ring count |
| `MAX_RING_SPEED` | TBD | ≤ 175 px/s | Ineffective cap | N/A — this is the upper bound |
| `STAGGER_MS` | 550 ms | 350–800 | Rings overlap in radius — hard to read priority | Rings nearly sequential — 2-ring feels like 1-ring |

**Interaction note**: `SPEED_INCREMENT` and `RING_COUNT_TABLE` are co-primary difficulty
axes. If both are non-zero, increasing `SPEED_INCREMENT` reduces the relative impact of
ring count escalation. For MVP, keep `SPEED_INCREMENT = 0` and tune ring count only.

## Visual / Audio Requirements

- The active background switches to match `diffLevel` at each round boundary
  (Deep Space → Nebula → Pulsar Zone → Red Giant → Event Horizon).
  Background index = `diffLevel % 5`.
- A subtle audio cue (short ascending tone or swoosh) plays on level advance.
  No screen flash or interruption — the transition should be felt, not announced.
- No explicit "Level Up" animation required for MVP; the background shift carries
  the signal.

## UI Requirements

- HUD displays current level and ring count as a single passive label:
  `LEVEL N · X RING(S)`. Updates immediately on level advance.
- No progress bar, countdown, or round counter exposed to the player — the system
  is intentionally opaque to preserve the "game is watching you" feel.

## Acceptance Criteria

- [ ] `diffLevel` advances exactly every `ROUNDS_PER_LEVEL` rounds
- [ ] `ringCount` matches `RING_COUNT_TABLE[diffLevel % len(table)]` at every level
- [ ] `ringSpeed` equals `BASE_RING_SPEED + diffLevel * SPEED_INCREMENT`, capped at `MAX_RING_SPEED`
- [ ] Difficulty does not advance mid-round — only at round boundaries
- [ ] Auto-missed rounds still increment `roundsPlayed`
- [ ] Table wrap is seamless — level 6 behaves identically to level 1 ring count (speed does not reset)
- [ ] A `DifficultyState` object with correct values is emitted to Ring Tap at each round start
- [ ] All tuning knobs are defined in an external config file, not hardcoded

## Open Questions

1. **Speed increment for production** — prototype kept `SPEED_INCREMENT = 0`. Should
   production introduce a speed ramp, and if so, at which levels?
   *(Owner: designer. Resolve before sprint 1 implementation.)*
2. **`MAX_RING_SPEED` value** — needs playtesting to establish the human-reaction
   floor. Suggested starting point: 160 px/s (~60 ms Perfect window).
   *(Owner: designer. Resolve during tuning pass.)*
3. **Adaptive difficulty** — should the system ease back if the player misses 3+
   rounds in a row? Not in prototype scope; flagged for post-jam consideration.
4. **End state** — does the game loop forever at max difficulty, or is there a win
   condition (e.g., survive N rounds at level 5)? Currently loops.
   *(Owner: designer. Decide before UI/score screen design.)*
