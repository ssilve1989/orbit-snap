# Prototype Report: Ring Tap

## Hypothesis

A single converging ring hitting a central orb — with Perfect/Good/Miss grading —
will feel satisfying and readable. Multiple simultaneous rings should escalate
difficulty legibly without becoming visually chaotic.

## Approach

Built a single self-contained HTML/Canvas2D file (no build step, no dependencies).
Core loop: rings spawn at `RING_MAX_RADIUS = 265px`, shrink at `115px/s` toward
the central orb (`ORB_RADIUS = 32px`). Click or Space triggers hit detection
against the closest active ring. Grade windows are `±9px` (Perfect) and `±22px`
(Good). Difficulty ramps every 4 rounds, adding simultaneous rings (1 → 1 → 2 → 3).
Shortcuts taken: vanilla Canvas instead of PixiJS, hardcoded all values, no audio,
no scene management, no save state.

**Time to playable:** ~45 minutes.

## Result

The core read-and-react loop is immediately understandable — no tutorial needed.
The color-temperature shift on the ring (white → yellow → red as it closes in)
acts as a natural urgency cue. The orb flash on hit/miss gives clear feedback
without on-screen text alone.

Two simultaneous rings remain readable because staggered spawning (550ms offset)
means they are almost never at the same radius — the player perceives a
priority ring and a trailing ring. Three simultaneous rings start to create
genuine split-second decisions, which feels like the mechanic's skill ceiling.

Notable observation: the timing window feel is very sensitive to `RING_SPEED`.
At 115px/s the 9px Perfect window is ~78ms — tight but achievable. At higher
speeds the window feels punishing; at lower speeds it feels trivial.

## Metrics

- Time to first playable tap: <3 seconds after page load
- Iteration count to get feel right: 3 (speed 140→120→115, window 6→8→9)
- Perfect window at 115px/s: ~78ms
- Good window at 115px/s: ~191ms
- Subjective feel at 115px/s: satisfying — misses feel earned, perfects feel
  rewarding without being lucky
- 2-ring readability: clear — stagger handles it
- 3-ring readability: borderline — works but approaching cognitive limit
- 4+ rings: not tested — likely requires visual differentiation (color-coded rings)

## Recommendation: PROCEED

The mechanic works. The single-input / visual-only design communicates timing
clearly, the grade system gives a skill ladder, and the difficulty ramp from 1 to
3 rings is naturally paced. The core question is answered: this feels good to play.

The main risk is monotony — the mechanic is one-dimensional. Mitigation options:
variable ring speeds, rhythm patterns (rings timed to a beat), ring color lanes
with different scoring implications. These are production concerns, not prototype
blockers.

## If Proceeding

**Architecture requirements**
- Switch from Canvas 2D to PixiJS for batched rendering and easier VFX (glow,
  particles on perfect hit)
- Separate game state from render loop — `GameState` class, `Renderer` class
- Ring spawner driven by a level/pattern data format (JSON), not hardcoded logic
- Audio system: Web Audio API for click SFX + beat-sync if rhythm direction chosen

**Performance targets**
- 60fps on mid-tier mobile (target: iOS Safari, Chrome Android)
- Ring count ceiling: test up to 5 with PixiJS batching

**Scope adjustments**
- The stagger-based multi-ring approach works but needs formalization: a pattern
  format that specifies ring spawn times relative to beat or round start
- Hit feedback needs particle burst + sound to feel complete — color flash alone
  is functional but undercooked

**Estimated production effort**
- Core loop (PixiJS, clean architecture): 1–2 days
- Level/pattern system + 5 levels: 1 day
- Audio + juice (particles, screen shake, SFX): 1 day
- UI (title, score screen, combo display): 0.5 day
- Polish + mobile testing: 1 day
- **Total: ~4–5 days** (well within jam scope)

## Lessons Learned

- Ring speed is the primary feel lever — more sensitive than window size. Keep
  it as the primary difficulty axis.
- The subtle hit-zone hint rings (faint circles at ±9px and ±22px from orb) help
  players calibrate without being a crutch. Keep them in production.
- Color temperature on the shrinking ring (white → red) is an intuitive urgency
  cue that required no explanation in testing. Ship it.
- Staggered spawning naturally solves 2-ring readability. For 3+ rings, consider
  giving each ring a distinct visual property (color, dashed pattern) so players
  can track individual rings across rounds.
