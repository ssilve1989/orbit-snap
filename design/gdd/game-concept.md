# Game Concept: Orbit Snap

> **Status**: Validated via prototype
> **Platform**: Web (PixiJS v8, HTML)
> **Scope**: Jam game (~5 days production)
> **Last Updated**: 2026-03-29

## One-Line Pitch

A single-input precision timing game where rings converge on a central orb and
you must snap the exact moment they align.

## Genre

Rhythm / precision timing. Single mechanic, escalating difficulty.

## Core Mechanic

A central orb sits at the screen centre. Rings spawn at the outer edge and shrink
inward at a fixed speed. The player has one control — tap (click or Space). Tapping
grades the closest active ring: **Perfect** (±9 px), **Good** (±22 px), or **Miss**.
Multiple rings spawn simultaneously at higher difficulty levels, staggered in time.

## Player Fantasy

The satisfaction of precise execution — that moment of "I nailed it" when you
snap a Perfect on a fast ring. The escalating multi-ring juggling creates genuine
split-second decisions without ever feeling unfair.

## Pillars

1. **Read and React** — the mechanic must be immediately legible with zero tutorial
2. **Skill Ladder** — Perfect/Good/Miss grades give players something to master
3. **Escalating Tension** — more simultaneous rings increase difficulty naturally

## Art Direction

Space-themed animated backgrounds (PixiJS GPU shaders). Five environments tied
to difficulty level: Deep Space → Nebula → Pulsar Zone → Red Giant → Event Horizon.

## Scope

| Phase | Target |
|-------|--------|
| Core loop + 5 levels | Day 1–2 |
| Audio + juice (particles, SFX) | Day 3 |
| UI (title, score screen, combo) | Day 4 |
| Polish + mobile testing | Day 5 |

## Validated Assumptions (from prototype)

- Ring speed 115 px/s, Perfect window ±9 px → ~78 ms window — feels tight but fair
- 2 simultaneous rings with 550 ms stagger → readable without colour differentiation
- 3 simultaneous rings → skill ceiling; 4+ likely needs per-ring colour coding
- Colour-temperature ring shift (white → red) communicates urgency without UI text
- Hint rings at ±9 px and ±22 px aid calibration without being a crutch
