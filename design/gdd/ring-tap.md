# Ring Tap (Core Timing)

> **Status**: Designed
> **Author**: User + Claude Code
> **Last Updated**: 2026-03-29
> **Implements Pillars**: Read and React, Skill Ladder, Escalating Tension

## Overview

Ring Tap is the sole interactive system in the game. A central orb sits fixed at
the screen centre. Rings spawn at a fixed outer radius and converge toward the orb
at a constant speed. The player has one control — a single tap — which grades the
nearest active ring based on how closely its radius matches the orb radius at the
moment of input: Perfect, Good, or Miss. At higher difficulty levels multiple rings
are active simultaneously, staggered in spawn time so they converge at different
moments. The system reads its spawn parameters each round from Difficulty Progression
and emits grade events to Scoring.

## Player Fantasy

The tap itself is the entire game. There is no aiming, no movement, no resource
management — just the moment of contact. A Perfect hit should feel like a sniper
shot: precise, deliberate, satisfying. A Good hit feels like a near-miss you got
away with. A Miss feels earned — the player knows they were late or early. The
multi-ring escalation shifts the fantasy from precision to prioritisation: which
ring do I hit, and when do I let the other one go? The mechanic rewards
attentiveness and punishes distraction, never luck.

## Detailed Design

### Core Rules

1. On round start, Ring Tap reads `DifficultyState` from Difficulty Progression and
   spawns `ringCount` rings, each separated by `staggerMs` milliseconds.
2. Each ring spawns at `RING_MAX_RADIUS` and shrinks toward the orb at `ringSpeed`
   px/s every frame.
3. A ring is **active** while its radius > `ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER`
   and it has not been hit.
4. On tap, the system finds the single active ring with the smallest
   `|ring.radius - ORB_RADIUS|` (closest to perfect alignment) and grades it:
   - **Perfect**: delta ≤ `PERFECT_WINDOW`
   - **Good**: delta ≤ `GOOD_WINDOW`
   - **Miss**: delta > `GOOD_WINDOW`
5. Only one ring is graded per tap — the closest one. Tapping when no active ring
   exists has no effect.
6. A ring that passes below `ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER` without
   being tapped is **auto-missed**.
7. A round ends when all rings for that round have been either tapped or auto-missed.
   After a brief inter-round pause (`INTER_ROUND_MS`), the next round begins.
8. Hint rings (faint circles at `ORB_RADIUS + PERFECT_WINDOW` and
   `ORB_RADIUS + GOOD_WINDOW`) are rendered at all times to help players calibrate
   without text.

### States and Transitions

| State | Description | Transitions |
|-------|-------------|-------------|
| `WAITING` | Between rounds; no rings active | → `ACTIVE` after `INTER_ROUND_MS` |
| `ACTIVE` | One or more rings converging | → `WAITING` when all rings resolved |
| `HIT` *(per-ring)* | Ring graded; fading out | Ring removed when alpha reaches 0 |
| `MISSED` *(per-ring)* | Auto-missed; fading out | Ring removed when alpha reaches 0 |

### Interactions with Other Systems

- **← S3 Difficulty Progression**: reads `DifficultyState { ringCount, ringSpeed, staggerMs }`
  at each round start.
- **→ S2 Scoring & Combo**: emits `RingResolved { grade, ringId, timestamp }` on every
  tap and auto-miss.
- **→ S4 Audio** *(future)*: emits `AudioEvent { type: 'hit_perfect'|'hit_good'|'miss'|'round_start' }`.
- **→ S5 HUD** *(future)*: exposes current ring states for visual rendering; HUD reads,
  never writes.

## Formulas

**Ring speed (distance-based acceleration):**
```
ringSpeed(d) = BASE_SPEED + ACCEL × (1 - d / RING_MAX_RADIUS)
```
where `d` = `ring.radius` (current radius). Applied each frame via Euler integration:
```
ring.radius -= ringSpeed(ring.radius) × dt
```
At spawn (`d = RING_MAX_RADIUS`): speed = `BASE_SPEED`
At orb (`d = ORB_RADIUS`): speed ≈ `BASE_SPEED + ACCEL × 0.88`

**Hit delta (distance from perfect):**
```
perceivedRadius = ring.radius + ringSpeed(ring.radius) × TAP_LATENCY_MS / 1000
delta = |perceivedRadius - ORB_RADIUS|
```
`TAP_LATENCY_MS` compensates for display + touch latency: the player taps when the ring
*they see* meets the orb, which lags the simulation. Example: 175 px/s × 60 ms = 10.5 px.

**Grade thresholds:**
```
grade = PERFECT  if delta ≤ PERFECT_WINDOW
grade = GOOD     if delta ≤ GOOD_WINDOW
grade = MISS     if delta >  GOOD_WINDOW
```

**Auto-miss threshold:**
```
autoMiss when: ring.radius < ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER
```

**Effective window duration at impact (ms):**
```
perfectWindowMs ≈ (PERFECT_WINDOW × 2) / ringSpeed(ORB_RADIUS) × 1000
goodWindowMs    ≈ (GOOD_WINDOW × 2)    / ringSpeed(ORB_RADIUS) × 1000
```
Window tightens as `ACCEL` increases — speed at the orb is the binding constraint.

| `BASE_SPEED` | `ACCEL` | Speed at orb | Perfect window | Good window |
|---|---|---|---|---|
| 115 px/s | 0 | 115 px/s | ~157 ms | ~383 ms |
| 115 px/s | 50 | ~159 px/s | ~113 ms | ~277 ms |
| 115 px/s | 100 | ~203 px/s | ~89 ms | ~217 ms |

**Staggered spawn times:**
```
ring[i].spawnTime = roundStartTime + (i × staggerMs)
```

**Prototype-validated values:**

| Variable | Value | Notes |
|----------|-------|-------|
| `ORB_RADIUS` | 32 px | Fixed |
| `RING_MAX_RADIUS` | 265 px | Spawn radius |
| `PERFECT_WINDOW` | 12 px | ~104 ms at 115 px/s (relaxed from 9 after playtest) |
| `GOOD_WINDOW` | 30 px | ~261 ms at 115 px/s (relaxed from 22 after playtest) |
| `AUTO_MISS_BUFFER` | 12 px | Grace distance past Good window |
| `INTER_ROUND_MS` | 750 ms | Pause between rounds |
| `ACCEL` | 0 px/s² (prototype) | Distance-based acceleration; TBD for production |

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Tap with no active rings | No-op — no grade emitted, no feedback |
| Two rings at identical radius simultaneously | Closest-delta rule applies; ties broken by spawn order (first-spawned wins) |
| Tap fires in the same frame a ring auto-misses | Auto-miss takes priority if ring crossed threshold before tap is processed; tap ignored for that ring |
| Ring speed mid-round | By design — `ringSpeed(d)` is re-evaluated every frame from current radius; acceleration is continuous |
| `ACCEL = 0` | Degrades gracefully to constant-speed behaviour; valid for prototype parity |
| `ringCount = 0` received | Treat as invalid config; default to 1 ring and log warning |
| Ring radius reaches exactly `ORB_RADIUS` with no tap | Continues past — auto-missed when it crosses `ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER` |
| Player taps repeatedly before any ring is active | All taps are no-ops; no missed grades assigned |
| Multiple taps in one frame | Only the first tap in a frame is processed; subsequent taps discarded |
| `STAGGER_MS` ≥ time for first ring to traverse full range | Second ring would spawn after first already auto-missed; `STAGGER_MS` must be validated against `RING_MAX_RADIUS / BASE_SPEED × 1000` |

## Dependencies

| Direction | System | Type | Interface |
|-----------|--------|------|-----------|
| Upstream | S3 Difficulty Progression | Hard | Reads `DifficultyState { level, ringCount, ringSpeed, staggerMs }` at each round start. `ringSpeed` becomes `BASE_SPEED` for the acceleration formula. |
| Downstream | S2 Scoring & Combo | Hard | Emits `RingResolved { grade: 'PERFECT'|'GOOD'|'MISS', ringId, timestamp }` on tap and auto-miss |
| Downstream | S4 Audio *(future)* | Soft | Emits `AudioEvent { type, timestamp }` — Ring Tap functions without audio |
| Downstream | S5 HUD *(future)* | Soft | Exposes read-only ring state array and orb flash state — Ring Tap functions without HUD |

## Tuning Knobs

| Knob | Default | Safe Range | Too Low | Too High |
|------|---------|------------|---------|----------|
| `ORB_RADIUS` | 32 px | 24–48 | Target feels tiny; hard to read visually | Target dominates the screen; mechanic feels trivial |
| `RING_MAX_RADIUS` | 265 px | 220–320 | Short travel time; little anticipation build-up | Long travel; pacing feels slow |
| `BASE_SPEED` | 115 px/s | 90–145 | Windows feel trivially wide | Windows feel punishing before acceleration kicks in |
| `ACCEL` | 0 px/s² | 0–120 | No urgency ramp (flat speed) | Ring arrives so fast near orb that acceleration dominates over skill |
| `PERFECT_WINDOW` | 12 px | 6–14 | Perfects feel impossible; luck-dependent | Perfects feel the same as Goods; grade distinction lost |
| `GOOD_WINDOW` | 30 px | 16–30 | Goods feel rare; most hits are Misses | Good window so wide that Misses feel unfair |
| `TAP_LATENCY_MS` | 60 ms | 0–120 | Taps grade late; on-time taps on mobile become Misses | Taps grade early; players must tap late to score Perfect |
| `AUTO_MISS_BUFFER` | 12 px | 8–20 | Auto-miss fires before player realises ring passed | Auto-miss delayed so long it feels unresponsive |
| `STAGGER_MS` | 550 ms | 350–800 | Rings visually overlap; priority unclear | Rings feel sequential; 2-ring = 1-ring in practice |
| `INTER_ROUND_MS` | 750 ms | 400–1200 | No breathing room between rounds | Pacing feels sluggish |

**Primary feel levers** (in order of sensitivity, from prototype):
1. `BASE_SPEED` — most sensitive; changes the entire feel of the mechanic
2. `ACCEL` — new in production; second most impactful on window tightness
3. `PERFECT_WINDOW` — fine-tune after speed is locked
4. `STAGGER_MS` — adjust only if multi-ring readability suffers

## Visual / Audio Requirements

[To be designed]

## UI Requirements

[To be designed]

## Acceptance Criteria

- [ ] A ring spawns at `RING_MAX_RADIUS` and converges to `ORB_RADIUS` at the correct accelerating speed each frame
- [ ] Tap on a ring within `PERFECT_WINDOW` grades as Perfect; within `GOOD_WINDOW` grades as Good; beyond grades as Miss
- [ ] Only the closest active ring to `ORB_RADIUS` is graded per tap
- [ ] A ring that passes `ORB_RADIUS - GOOD_WINDOW - AUTO_MISS_BUFFER` without a tap is auto-missed and emits a Miss grade
- [ ] Multiple taps in one frame: only the first is processed
- [ ] Tap with no active rings: no grade emitted, no state change
- [ ] `ringSpeed(d)` at spawn equals `BASE_SPEED`; at `ORB_RADIUS` equals `BASE_SPEED + ACCEL × 0.88` (±1%)
- [ ] `ACCEL = 0` produces identical behaviour to constant-speed prototype
- [ ] Round ends only when all rings for that round are resolved
- [ ] `INTER_ROUND_MS` pause elapses before next round begins
- [ ] `RingResolved` event emitted with correct grade, ringId, and timestamp on every resolution
- [ ] All tuning knobs loaded from external config; no gameplay values hardcoded
- [ ] 60 fps maintained with 3 simultaneous active rings on target platforms

## Open Questions

[To be designed]
