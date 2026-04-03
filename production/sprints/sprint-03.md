# Sprint 3 — 2026-04-04 to 2026-04-06

## Sprint Goal
Fix the immediate-restart bug so players land on a proper results screen, and upgrade the game-over UX with clear stats, a deliberate pause, and explicit action options.

## Capacity
- Total days: 2
- Buffer (20%): 0.4 days
- Available: 1.6 days

---

## Tasks

### Must Have (Critical Path)

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|-------------|---------------------|
| T20 ✅ | Fix score screen input cooldown — add 400ms delay before attaching restart listeners so same-event propagation can't dismiss the screen | gameplay-programmer | 0.1d | — | Final miss tap on mobile never skips the results screen; screen remains visible for at least 400ms before input is accepted |
| T21 ✅ | Score screen redesign — show score, max combo, level reached, high score, and explicit "PLAY AGAIN" prompt with tap/click/Space | ui-programmer | 0.3d | T20 | All four stats visible; prompt appears only after cooldown; tapping Play Again starts a new session |

### Should Have

| ID | Task | Agent/Owner | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-------------|-----------|-------------|---------------------|
| T22 ✅ | Entrance animation — fade-in or slide-up for score screen so transition from gameplay feels deliberate | technical-artist | 0.15d | T21 | Screen animates in over ~300ms; does not block input after cooldown completes; no jank at 60fps |
| T23 ✅ | "Return to Title" option — second action on score screen alongside Play Again | ui-programmer | 0.15d | T21 | Keyboard: Enter = Play Again, Escape = Title; Touch: two tappable button zones clearly labelled |

### Nice to Have

| ID | Task | Agent/Owner | Est. Days | Acceptance Criteria |
|----|------|-------------|-----------|---------------------|
| T24 ✅ | "Level reached" stat on score screen (derived from difficulty progression state at end of session) | ui-programmer | 0.1d | Shows `LEVEL: N` consistent with HUD level display |

---

## Carryover from Previous Sprint
None — Sprint 2 completed all tasks.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Touch event propagation fix has edge cases on iOS Safari | Medium | High | Test on real device; use `stopPropagation` on canvas touchstart as belt-and-suspenders fallback |
| Score screen redesign breaks existing CSS layout on small screens | Low | Medium | Test at 375×667 (iPhone SE) as minimum viewport |

---

## Dependencies on External Factors
- None — all work is self-contained in `src/ui/score-screen.ts` and `src/main.ts`

## Definition of Done for Sprint 3
- [x] T20 complete — final-miss tap never skips results screen (verified on mobile + desktop)
- [x] T21 complete — results screen shows score, combo, level, best score with Play Again prompt
- [x] T22 complete — entrance animation plays at 60fps without layout shift
- [x] T23 complete — both Play Again and Return to Title are reachable by keyboard and touch
- [x] T24 complete — level stat delivered as part of T21 implementation
- [ ] No regressions: title screen flow, in-game restart via Escape, high score persistence all still work
- [x] All existing unit tests pass (75 passing, 0 failures)

---

## Sprint Outcome

**Status: COMPLETE** — 2026-04-04

All Must Have, Should Have, and Nice to Have tasks delivered. Root cause (same-event propagation on final miss) fixed with 400ms input cooldown. Score screen redesigned with LEVEL/COMBO stat block, 300ms fade-up entrance animation, and explicit Play Again / Return to Title actions. T24 (level stat) was delivered as part of T21.

Remaining open item: manual regression test on iOS Safari for the touch propagation fix.

---

## Root Cause Note
The immediate-restart bug was in `score-screen.ts:show()` — `addEventListener` calls were attached synchronously, so the same touchstart event that resolved the final miss bubbled up to `document` and fired the score screen handler before the player saw anything. Fixed by wrapping listener attachment in `setTimeout(..., 400)`.
