# Sprint 2 — 2026-04-03 to 2026-04-04

## Sprint Goal
Ship the jam build. Close the remaining milestone exit criteria: mobile support,
high score persistence, and final polish. Build must be submittable by end of day.

## Capacity
- Total days: 1
- Buffer (20%): absorbed into task estimates
- Available: 1 day

---

## Tasks

### Must Have (Milestone blockers)

| ID | Task | Agent | Est. | Dependencies | Acceptance Criteria |
|----|------|-------|------|-------------|---------------------|
| T13 | Mobile touch support — `touchstart` input, viewport meta tag, safe area insets | gameplay-programmer | 0.25d | — | Playable on iOS Safari and Chrome Android; rings tappable; no input lag vs desktop |
| T15 | High score persistence — `localStorage` best score, shown on score screen | gameplay-programmer | 0.15d | — | Persists across page reloads; shows "NEW BEST" when beaten; handles missing storage gracefully |

**Must Have total: 0.4 days**

---

### Should Have

| ID | Task | Agent | Est. | Dependencies | Acceptance Criteria |
|----|------|-------|------|-------------|---------------------|
| T14 | Screen shake on Miss | technical-artist | 0.1d | — | Subtle camera shake; does not interfere with ring readability; skippable if motion concern |
| T16 | Combo break visual — rings flash red briefly when combo resets | technical-artist | 0.1d | — | Visible but not distracting; consistent with grade flash timing |
| T17 | Production build — `pnpm build`, verify bundle, check for console errors | devops-engineer | 0.1d | T13, T15 | `dist/` builds cleanly; no runtime errors in production bundle |

**Should Have total: 0.3 days**

---

### Nice to Have

| ID | Task | Agent | Est. | Acceptance Criteria |
|----|------|-------|------|---------------------|
| T18 | Level advance SFX — short ascending tone when difficulty increases | sound-designer | 0.1d | Fires once per level-up; distinct from hit SFX |
| T19 | Favicon and page title | ui-programmer | 0.05d | `<title>Orbit Snap</title>` set; favicon visible in browser tab |

---

## Definition of Done for Sprint 2
- [x] T13 complete — mobile playable on iOS Safari and Chrome Android
- [x] T14 complete — screen shake on Miss
- [x] T15 complete — high score persists across reloads
- [x] T16 complete — combo break visual (red ring fade + orb flash, covered by existing VFX)
- [x] T17 complete — production build succeeds (dist/ 254 kB, gzip 80 kB)
- [x] All milestone exit criteria satisfied
- [x] 66 unit tests passing, 0 failures
- [x] No console errors in production build

## Sprint Outcome

**Status: COMPLETE** — 2026-04-03

All Must Have and Should Have tasks delivered. `vite.config.ts` added to fix
top-level await in production build (target: es2022). All milestone exit criteria
satisfied. Game is submittable.
