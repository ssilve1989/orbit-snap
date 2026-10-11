# Systems Index: Orbit Snap

> **Last Updated**: 2026-03-29
> **Total Systems**: 10
> **MVP Systems**: Ring Tap, Scoring & Combo, Difficulty Progression

## Progress Tracker

| Phase | Total | Designed | Approved |
|-------|-------|----------|----------|
| MVP   | 3     | 3        | 0        |
| Full  | 3     | 0        | 0        |

---

## System Map

| ID | System | Layer | Priority | Depends On | Depended On By | Status | Design Doc |
|----|--------|-------|----------|------------|----------------|--------|------------|
| S1 | Ring Tap (Core Timing) | Core | P0 — MVP | S3 (Difficulty) | S2 (Scoring), S4 (Audio), S5 (HUD) | Designed | [ring-tap.md](ring-tap.md) |
| S2 | Scoring & Combo | Core | P0 — MVP | S1 (Ring Tap) | S5 (HUD) | Designed | [scoring-combo.md](scoring-combo.md) |
| S3 | Difficulty Progression | Core | P0 — MVP | — | S1 (Ring Tap) | Designed | [difficulty-progression.md](difficulty-progression.md) |
| S4 | Audio | Feedback | P1 — Full | S1 (Ring Tap) | — | Undesigned | — |
| S5 | HUD & Score Display | UI | P1 — Full | S1, S2, S3 | — | Undesigned | — |
| S6 | Level / Pattern System | Content | P1 — Full | S1 (Ring Tap) | S3 (Difficulty) | Undesigned | — |
| S7 | Scatter: Target Field | Core | P1 — Mode | S1 (Grade), S2, S8 | S9, S10, HUD | Designed | [scatter-mode.md](scatter-mode.md) |
| S8 | Scatter: Wave Progression | Core | P1 — Mode | — | S7 | Designed | [scatter-mode.md](scatter-mode.md) |
| S9 | Pinpoint Streak | Core | P1 — Mode | S7 | HUD | Designed | [scatter-mode.md](scatter-mode.md) |
| S10 | Roguelite Power-Ups | Meta | P1 — Mode | S7, S9 | S7 (timing rules) | Designed | [scatter-mode.md](scatter-mode.md) |

---

## Design Order (Recommended)

1. **S3 — Difficulty Progression** (no upstream deps; defines the space S1 operates in)
2. **S1 — Ring Tap** (core loop; depends on S3 contract)
3. **S2 — Scoring & Combo** (depends on S1 grade outputs)
4. **S6 — Level / Pattern System** (depends on S1 spawn interface)
5. **S5 — HUD & Score Display** (depends on S1 + S2 state)
6. **S4 — Audio** (depends on S1 events)

---

## Interface Contracts (to be filled as GDDs are written)

### S1 → S2: Ring Tap emits grade events
```
RingResolved { grade: 'PERFECT'|'GOOD'|'MISS', ringId, timestamp }
```

### S3 → S1: Difficulty drives spawn parameters
```
DifficultyState { level: number, ringCount: number, ringSpeed: number, staggerMs: number }
```

### S1 → S4: Ring Tap emits audio trigger events
```
AudioEvent { type: 'hit_perfect'|'hit_good'|'miss'|'round_start', timestamp }
```
