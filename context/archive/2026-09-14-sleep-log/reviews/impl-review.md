<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sleep Log

- **Plan**: context/changes/sleep-log/plan.md
- **Scope**: Full plan (Phases 1–5; Phases 2–4 were also reviewed per phase, so this pass is mainly Phase 5 plus cross-phase effects)
- **Date**: 2026-11-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

**Success criteria (re-run 2026-11-18):**
- `npm test`: 83/83 pass.
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors. The 1 warning was already there, in `src/i18n/index.ts`.
- `./gradlew test`: pass.
- Phase 3: `use-feedings.ts` no longer contains `api/feedings/shared`.
- Phase 4: `time-edit-sheet.tsx` and `enqueueSync` are gone.
- Manual rows 1.4–5.9 are all confirmed by the user.

**Plan adherence:**
- Every Phase 5 contract matches the plan.
- The engine contract names and signatures are as specified.
- All three hooks use the engine in the same way.
- Three files in the diff are not listed in the plan: `src/sync/ids.ts`, `InsertIfAbsentRepositoryTest.kt` and `schema.test.ts`. Each was added by a recorded phase-review decision.

## Findings

### F1 — Sleep recovery modal: "End now" records a NAP without asking

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/sleep-log.tsx:71-78
- **Detail**:
  - The recovery modal shows whenever my own running row exists at first load. For feedings that means a crash. For sleeps it is normal: a sleep runs for hours, and iOS often kills the app in the background, so the modal appears on most relaunches during a sleep.
  - "End now" calls `finalize(id, new Date(), 'NAP', null)` without the completion sheet, so a night sleep is saved as NAP.
  - The plan prescribes this behaviour (lines 478 and 5.5), so the issue is in the plan, not a slip in the code.
- **Fix A ⭐ Recommended**: "End now" opens the completion sheet (`setPendingStop(new Date())`), so the type and note are chosen as with Stop.
  - Strength: A one-line change. The modal and plan step 5.5 stay as they are, and a night sleep can no longer be saved as a nap by accident.
  - Tradeoff: One extra tap.
  - Confidence: HIGH. `handleSave` already finalizes `activeSleep` with `pendingStop`.
  - Blind spot: The modal still appears on every relaunch during a long sleep.
- **Fix B**: Drop the recovery modal for sleeps. On relaunch the timer just keeps running.
  - Strength: Fits how sleep is used: a relaunch during a sleep isn't an error.
  - Tradeoff: It departs from the plan (5.5) and the feeding and contraction pattern. A sleep that really was forgotten gets no prompt.
  - Confidence: MED. This is a product call.
  - Blind spot: The FR wording for crash recovery hasn't been checked.
- **Decision**: FIXED via Fix A: `handleEndNow` closes the modal and sets `pendingStop` to now, so the completion sheet asks for the type and note. Cancelling the sheet leaves the timer running.

### F2 — A sleep of 24 h or more can be saved but never edited

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/entry-edit.ts:75; src/hooks/use-sleeps.ts:100-125
- **Detail**:
  - Neither `finalize` nor the server (`SleepService.upsert` only requires end > start) limits the duration. A forgotten timer that is stopped after more than 24 h is saved and synced.
  - `buildEditTimes` then always returns `'tooLong'`, even when the times are untouched. So the type or note of that entry can't be changed without first shortening both times.
  - Sleep is the entity where a forgotten timer is most likely.
- **Fix A ⭐ Recommended**: In `buildEditTimes`, return `'tooLong'` only when a time was changed. When neither changed, return the original times.
  - Strength: One condition in the shared helper. It fixes sleeps, feedings and contractions, and keeps the rule for real edits.
  - Tradeoff: An entry of 24 h or more stays as it is until the user changes its times.
  - Confidence: HIGH. `nearestTo` already returns the original instant for an untouched time, so "unchanged" is easy to detect. Add a test in `entry-edit.test.ts`.
  - Blind spot: None significant.
- **Fix B**: Stop the entry from being saved: `finalize` rejects 24 h or more, and the completion sheet shows `sleep.edit.tooLong`.
  - Strength: The bad entry is never stored.
  - Tradeoff: The completion sheet has no time fields, so the user would have nothing to correct there. It needs more UI work.
  - Confidence: MED.
  - Blind spot: How to finish a forgotten timer without time inputs.
- **Decision**: FIXED via Fix A: `buildEditTimes` returns `'tooLong'` only when a time was changed. New test `keeps an entry of 24 hours or more editable while its times are untouched`, which fails without the fix.

### F3 — Plan and follow-up docs are stale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/sleep-log/plan.md:397, :465; context/changes/sleep-log/follow-ups/review-fixes.md:13-16, F4 entry
- **Detail**:
  - The plan still prescribes `feeding.edit.tooLong` for the contraction sheet (line 397) and the sleep sheet (line 465). The code uses `contractions.edit.tooLong` and `sleep.edit.tooLong`.
  - The follow-up "Sleep edit sheet error text" is done in `64ce6b5` but isn't marked as resolved.
  - The follow-up "Uploads the server rejects…" lists only the feeding and contraction `finalize`. `use-sleeps.ts` `finalize` has the same gap: no `endedAt > startedAt` check.
- **Fix**: Update the two plan lines, mark the sleep-text follow-up as resolved in `64ce6b5`, and add `use-sleeps.ts` to the F4 follow-up.
- **Decision**: FIXED: plan.md (Phase 4 and Phase 5 error keys) and follow-ups/review-fixes.md (sleep text marked RESOLVED; `use-sleeps.ts` added to the rejected-upload entry) updated.

### F4 — OTHER sleep badge has low contrast

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/sleep-row.tsx:23-27
- **Detail**:
  - The badge colours are hardcoded hex values, following `feeding-row.tsx`.
  - OTHER `#9E9E9E` with white 10 px text gives about 2.7:1 contrast, below WCAG AA.
- **Fix**: Change OTHER to `#757575` (about 4.6:1). Moving the badge colours into theme tokens can wait for a shared pass over the feeding badges too.
- **Decision**: FIXED: OTHER is now `#757575`.

### F5 — Three pollers share one connection and re-render the lists every 5 s

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/use-entity-sync.ts:88-90; src/sync/entity-sync.ts:241
- **Detail**:
  - expo-sqlite shares one native connection, and each hook has its own sync runner. Autocommit writes from one entity's poll can land inside another entity's `deleteEntry` transaction. It heals on the next sync.
  - Each poll also calls `setRows` with a new array even when nothing changed. Up to 3 × 200 swipeable rows re-render every 5 s, including on hidden tabs.
- **Fix**: Add both to the existing write-load follow-up in `review-fixes.md`, as part of the `withExclusiveTransactionAsync` direction plus skipping `setRows` when nothing changed.
- **Decision**: FIXED (no code change): both added to the "Sync write load" entry in `follow-ups/review-fixes.md`.

### F6 — The partner can't see a sleep in progress

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/sync/entity-sync.ts:188
- **Detail**:
  - Running entries are never uploaded, by design (What We're NOT Doing).
  - For sleeps, which last hours, the partner doesn't know a sleep is running and may start a duplicate timer.
- **Fix**: Record it as a roadmap candidate in `review-fixes.md`. No code change in this change.
- **Decision**: FIXED (no code change): added "Partner can't see a running sleep" to `follow-ups/review-fixes.md` as a roadmap candidate.
