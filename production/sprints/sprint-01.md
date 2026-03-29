# Sprint 1 — 2026-03-30 to 2026-04-04

## Sprint Goal
Ship a complete, polished game: core loop implemented to GDD spec, backgrounds
ported from prototype, juice and audio added, UI screens bookending the session.

## Capacity
- Total days: 5
- Buffer (20%): 1 day reserved for unplanned work and tuning
- Available: 4 days

---

## Tasks

### Must Have (Critical Path)
*Game is not playable without these. Target: complete by end of day 2.*

| ID | Task | Agent | Est. | Dependencies | Acceptance Criteria |
|----|------|-------|------|-------------|---------------------|
| T01 | Project scaffolding — `package.json` (pixi.js, vite, vitest), `src/` directory structure, `index.html` entry point, PixiJS v8 CDN init | gameplay-programmer | 0.25d | — | `npm install` succeeds; Vite dev server starts on localhost; app boots with blank PixiJS canvas at full viewport |
| T01b | Test infrastructure — `vitest.config.js`, `tests/` directory, smoke test for `src/config.js` | gameplay-programmer | 0.1d | T01 | `npm test` runs and exits 0; config smoke test passes |
| T02 | Config system — `src/config.js` exporting all GDD tuning knobs | gameplay-programmer | 0.25d | T01 | All values from GDD Tuning Knobs sections present; no gameplay constant hardcoded elsewhere |
| T03 | `DifficultyProgression` class — implements S3 GDD | gameplay-programmer | 0.25d | T02 | Emits correct `DifficultyState` each round; all S3 acceptance criteria pass |
| T04 | `RingTap` core loop — `GameState`, `RingSpawner`, hit detection, grade events | gameplay-programmer | 1.0d | T02, T03 | All S1 acceptance criteria pass; `RingResolved` events fire with correct grade and timing |
| T05 | `ScoringCombo` class — implements S2 GDD | gameplay-programmer | 0.25d | T04 | All S2 acceptance criteria pass; score/combo/maxCombo correct across 20-round session |
| T06 | Space backgrounds — port 5 GPU shaders from prototype to production architecture | technical-artist | 0.5d | T01 | All 5 backgrounds render at 60 fps; UV fix and GLSL ES 1.00 syntax applied; no horizontal seams |
| T07 | Game renderer — PixiJS Graphics for rings, orb, hint rings, grade flash | gameplay-programmer | 0.5d | T04, T06 | Rings render with correct colour-temperature shift; orb flashes on grade; hint rings visible |

**Must Have total: 3.1 days**

---

### Should Have
*Game is complete without these, but feels unfinished.*

| ID | Task | Agent | Est. | Dependencies | Acceptance Criteria |
|----|------|-------|------|-------------|---------------------|
| T08 | HUD — score, combo multiplier, level label | ui-programmer | 0.25d | T05 | Updates correctly on every `RingResolved`; no DOM jank in game loop |
| T09 | VFX — particle burst on Perfect hit; screen flash on Miss | technical-artist | 0.5d | T07 | Perfect triggers ≥8 particles; Miss triggers red screen flash; both at 60 fps |
| T10 | Audio — Web Audio API; SFX for Perfect, Good, Miss, level advance | sound-designer | 0.5d | T04, T03 | All 4 audio events fire correct SFX; no audio lag >20 ms from event |
| T11 | Title screen — tap-to-start, game title, brief instruction | ui-programmer | 0.25d | T01 | Game does not start until player taps; transitions cleanly to game loop |
| T12 | Score screen — final score, max combo, play-again button | ui-programmer | 0.25d | T05 | Displays on session end; play-again resets all state correctly |

**Should Have total: 1.75 days**

---

### Nice to Have
*Pull from this list if Must Have + Should Have complete early.*

| ID | Task | Agent | Est. | Dependencies | Acceptance Criteria |
|----|------|-------|------|-------------|---------------------|
| T13 | Mobile touch support — `touchstart` input, viewport meta, safe area insets | gameplay-programmer | 0.25d | T04 | Playable on iOS Safari and Chrome Android; no input lag vs desktop |
| T14 | Screen shake on Miss | technical-artist | 0.1d | T07 | Subtle; does not interfere with ring readability |
| T15 | High score persistence — `localStorage` | gameplay-programmer | 0.15d | T12 | Persists across page reloads; handles missing/corrupt storage gracefully |
| T16 | Combo break visual — rings flash red briefly when combo resets | technical-artist | 0.1d | T07, T05 | Visible but not distracting |

**Nice to Have total: 0.6 days**

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| PixiJS v8 API surprises beyond what prototype covered | Medium | Medium | Reference `docs/engine-reference/pixijs/VERSION.md` before every API call; WebSearch to verify uncertain usage |
| `ACCEL` tuning takes longer than expected | Medium | Low | `ACCEL = 0` is a valid default (prototype parity); defer tuning to T13–T16 window |
| Web Audio API autoplay policy blocks sound on first load | High | Low | Gate audio init on first user gesture (tap on title screen covers this) |
| Mobile performance below 60 fps with 3 rings + shader backgrounds | Low | Medium | Profile early; fallback to simplified background at low frame rates |

## Definition of Done for Sprint 1
- [x] T01–T07 complete (game fully playable)
- [x] T08–T12 complete (game feels finished)
- [x] All implemented systems pass their GDD acceptance criteria
- [x] No S1 or S2 bugs
- [x] All tuning knobs in `src/config.ts` — zero hardcoded gameplay values
- [x] Playable in Chrome desktop without console errors

## Sprint Outcome

**Status: COMPLETE** — 2026-04-03

All Must Have and Should Have tasks delivered. Background music added (T10 scope
extended with `Orbiting_The_Burning_Core.mp3`). 66 unit tests passing, 0 failures.
Full game loop: Title → Playing → Score → Title.

Nice to Have tasks (T13–T16) deferred to Sprint 2.
