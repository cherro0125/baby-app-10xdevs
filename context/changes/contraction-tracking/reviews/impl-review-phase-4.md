<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Contraction Tracking (S-03)

- **Plan**: context/changes/contraction-tracking/plan.md
- **Scope**: Phase 4 of 6
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Delete tap is fire-and-forget; failure leaves row stuck

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/contraction-row.tsx:43
- **Detail**: `onPress={() => onDelete(contraction.id)}` calls `remove()` (passed down from `useContractions`), which does `throw e` on failure (`src/hooks/use-contractions.ts:141-144`). The call here has no `await`/`.catch()`, so a DB failure produces an unhandled promise rejection and the row is left stuck showing "Confirm delete?" with no visible error and no way back except a lucky retry.
- **Fix**: `onPress={() => onDelete(contraction.id).catch(() => setConfirming(false))}` so a failed delete resets the row instead of leaving it stuck silently.
- **Decision**: FIXED

### F2 — "Tapping elsewhere cancels" implemented as an explicit Cancel button, not a literal tap-anywhere

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/contraction-row.tsx:48-52
- **Detail**: The plan's manual criterion says "tapping elsewhere on confirmation cancels." The implementation instead adds an explicit "Cancel" `Pressable` next to "Confirm delete?" — there's no outside-tap/blur listener, so tapping another row, the timer, or blank space leaves the row stuck in confirm state. This was a deliberate, disclosed tradeoff (true global tap-outside detection needs a screen-wide overlay, disproportionate for one row's affordance) and is functionally reasonable, but it's a real deviation from a literal reading of the plan.
- **Fix**: Document this as a Decisions Locked addendum in plan.md ("second-tap confirm uses an explicit Cancel action, not tap-elsewhere") so future reviews don't re-flag it as drift.
- **Decision**: FIXED — added Decisions Locked item 14 to plan.md

### F3 — GestureHandlerRootView added to src/app/_layout.tsx, not in Phase 4's file contract

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/_layout.tsx:6,23,31
- **Detail**: Phase 4's "Changes Required" lists only `contraction-list.tsx`, `contraction-row.tsx`, and `index.tsx`. Wrapping the app root in `GestureHandlerRootView` wasn't listed, but it's necessary plumbing: nothing in the codebase used `react-native-gesture-handler` before this phase, and `Swipeable` needs a `GestureHandlerRootView` ancestor to work reliably (especially on Android). This is justified, minimal, correctly-scoped — not unrelated scope creep.
- **Fix**: Add a line to plan.md's Phase 4 "Changes Required" noting the root-layout change, so the plan stays an accurate record of what shipped.
- **Decision**: FIXED — added src/app/_layout.tsx to Phase 4's Changes Required

### F4 — FlatList nested in a ScrollView with scrollEnabled=false

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/contraction-list.tsx:35-47 (rendered inside the ScrollView at src/app/(app)/index.tsx:35)
- **Detail**: `scrollEnabled={false}` avoids the double-scroll UX problem, but React Native's "VirtualizedLists should never be nested inside plain ScrollViews" dev warning is triggered by scroll-context presence, not the child's own scroll state — so it still fires as console noise while providing none of FlatList's windowing benefit (it can't scroll itself). At realistic data volumes (contractions per labor session — well under a few hundred rows), this is not a real performance risk, just avoidable warning noise.
- **Fix**: Optional — replace with a plain `.map()` over a `View` to get identical rendering without the dev-warning noise. Not blocking.
- **Decision**: FIXED — swapped FlatList for View + .map() in contraction-list.tsx; documented in plan.md's Phase 4 file contract

## Notes (non-findings, for awareness)

- `contractions` (from `useContractions()`) is not filtered to exclude the in-progress (unended) contraction, so once a row renders for it, `ContractionRow` would show `formatDuration(null)` as "—" alongside the active timer. This is pre-existing Phase 2 hook behavior, not introduced by Phase 4, and doesn't currently manifest as a visible bug in phase 4's screens as tested — flagged here only because Phase 4 is the first phase where the list actually renders.
