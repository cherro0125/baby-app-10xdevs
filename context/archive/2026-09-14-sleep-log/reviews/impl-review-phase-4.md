<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sleep Log

- **Plan**: context/changes/sleep-log/plan.md
- **Scope**: Phase 4 of 5 (commit `0109090`)
- **Date**: 2026-10-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes:
- Plan adherence: every planned item matches. Two extras are acceptable:
  - `ContractionEdit` lives in `entry-edit.ts` next to `FeedingEdit`;
  - `src/db/__tests__/schema.test.ts` covers the v2 migration.
- Success criteria:
  - `npm test` passes 78/78.
  - `npx tsc --noEmit` is clean.
  - `npm run lint` shows only the 1 warning that was already there.
  - Check 4.4 passes.
  - The user confirmed manual checks 4.5–4.9 on the iPhone and the Galaxy with linked accounts. Before that, both phones needed a full reload: after Fast Refresh, contractions weren't syncing between the phones.
- Checked and not a finding:
  - **v2 step:** it is atomic and runs once. `synced = 0` rows, feedings and feeding tombstones are untouched.
  - **Backend contract:** the PUT body matches `UpsertContractionRequest`, with whole-second durations and `?create=false` for partner edits.
  - **Seconds kept:** `buildEditTimes` keeps the original instant, also when an hour is changed and then changed back, and in a DST fall-back hour.

## Findings

### F1 — Own legacy rows stored under their server id disappear on the first sync

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:84-92, src/sync/entity-sync.ts:126-134 (with src/db/schema.ts:73)
- **Detail**:
  - The old contraction download inserted own server rows that were new to the device, keyed by server id. So a device that uploaded contraction L also holds the downloaded copy S. Both were `synced = 1`, and v2 marks both `synced = 2`.
  - On the first sync, the own-row upsert skips S (`WHERE synced = 1`). The legacy step then deletes both L and S, because their `started_at` matches.
  - The contraction disappears until the next sync. Without a partner, that is the next app start, so until then the history and the 5-1-1 banner are empty. This contradicts the plan ("a match is replaced by the server copy").
  - If the server copy is gone (wiped server), L and S both become `synced = 0` and are uploaded twice.
  - Our devices didn't hit this, because the dev server had 0 contractions and the legacy starts differed. A subagent reproduced it on node:sqlite.
- **Fix**:
  - Let the own-row upsert also overwrite `synced = 2` rows (`WHERE synced IN (1, 2)`). A legacy row whose id is in the page is the server copy, so it becomes `synced = 1` and only L is dropped by the start match.
  - Before the unmatched legacy rows are released for upload, delete own `synced = 2` duplicates that share `julianday(started_at)`.
  - Add the L+S case to the engine tests.
  - Strength: fixes the vanishing and the double upload in one place (the engine), without a new migration.
  - Tradeoff: the engine's legacy rule gains a second step, which is slightly more to reason about.
  - Confidence: HIGH — the code path is unambiguous and was reproduced.
  - Blind spot: S whose `startedAt` a partner changed with the old PATCH. With the fix S takes the server version, but L stays unmatched and is uploaded as a duplicate. This is rare and already in the plan's accepted "duplicates from earlier edits".
- **Decision**: FIXED:
  - The own-row upsert now also resolves `synced = 2` rows (`WHERE synced IN (1, 2)`).
  - Before release, own legacy twins with the same start are reduced to one.
  - Two new tests:
    - `keeps the server copy when the device holds both the local and the server-id copy` fails without the fix;
    - `uploads only one of two legacy copies the server lacks`.

### F2 — Partner rows marked legacy are never purged and can't be deleted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:101, src/sync/entity-sync.ts:235-236 (with src/db/schema.ts:73)
- **Detail**:
  - v2 marks every `synced = 1` contraction, including partner rows, as `synced = 2`. The partner purge only removes `synced = 1`, and legacy resolution only touches the current user's rows.
  - So a partner row missing from the server stays forever. This happens when the partner deleted it, after an unlink, or for a legacy partner row with a null end that the old download stored.
  - Deleting such a row gets a 404, and `deleteEntry` throws. A null-end ghost even opens the "stop first" sheet and can't be resolved.
  - `loadContractions` has no user filter, so these ghosts also count in 5-1-1.
- **Fix**:
  - Partner purge: delete `user_id != ? AND synced IN (1, 2)`. A `synced = 2` row was `synced = 1` before v2, so it is on the server and re-downloads if it still exists.
  - Partner delete: treat 404 as already gone and delete the row locally.
  - Update the "keeps pending and legacy rows of another account" test to keep only pending rows.
- **Decision**: FIXED:
  - The partner purge now covers `synced IN (1, 2)`.
  - `deleteEntry` treats a partner 404 as already deleted.
  - The test `keeps pending rows of another account that used this device` was narrowed to pending rows only.
  - New tests, both failing without the fix:
    - `purges legacy partner rows missing from the server, including ones without an end`;
    - `deletes a partner row locally when the server no longer has it`.

### F3 — The contraction edit sheet shows a feeding-specific error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/contraction-edit-sheet.tsx:43
- **Detail**: `tooLong` maps to `feeding.edit.tooLong`: "A feeding can't last 24 hours or more" / "Karmienie nie może trwać…". The plan prescribed this key, so the slip is in the plan. Sleep (Phase 5) would repeat it. `feeding.edit.saveFailed` is worded generically, so it reads fine.
- **Fix**: Add `contractions.edit.tooLong` in EN and PL, use it in the sheet, and give Phase 5 a matching `sleep.edit.tooLong`.
- **Decision**: FIXED: added `contractions.edit.tooLong` ("A contraction can't last 24 hours or more" / "Skurcz nie może trwać 24 godzin lub dłużej") and used it in the sheet. The sleep key is queued for Phase 5 in `follow-ups/review-fixes.md`.

### F4 — An entry the server rejects is retried forever

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:113-118, src/sync/entity-sync.ts:188-203
- **Detail**: `finalize` doesn't enforce `endedAt > startedAt`. If the clock moves back between start and stop, the server answers 400 and the row stays `synced = 0` with a negative duration. It is then re-sent on every sync. Legacy notes over 2000 characters behave the same way, because the old timer had no `maxLength`. Feedings have the same gap.
- **Fix**: No change now; queue a follow-up to validate in `finalize` and stop retrying a 4xx upload.
- **Decision**: FIXED (no code change): queued in `follow-ups/review-fixes.md`.

### F5 — The migration test can't hold a second case and doesn't cover the first sync

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/db/__tests__/schema.test.ts:7
- **Detail**: `runMigrations` is memoised at module level, so a second test in this file would silently skip the migration. No test runs the v2 migration followed by a first sync, which would have caught F1 and F2.
- **Fix**: Run each case through `jest.isolateModules`, and add a v2-then-`syncEntity` case with an L+S pair and a missing partner row (covers F1 and F2).
- **Decision**: FIXED: each case loads `runMigrations` through `jest.isolateModules`. New test `leaves exactly the server copies after the first sync` covers an L+S pair plus a deleted partner row without an end, and fails without the F1 fix.

### F6 — Pre-update deletions and edits can come back or duplicate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/db/schema.ts:74
- **Detail**:
  - v2 drops the old `DELETE {id, userId}` queue rows. A contraction deleted just before the update therefore comes back once. The plan accepts this (line 78).
  - The deletions could be kept instead: rewrite those rows to `{contractionId: id, userId}`. A local id then just gets a 404 and is dropped.
  - Separately, a contraction uploaded under the old sync and edited before the update is still `synced = 0`. It is uploaded under its local id and may duplicate its server copy. This is the same class as the plan's accepted "legacy row edited before its first sync".
- **Fix**: No change; the plan already accepts both outcomes.
- **Decision**: ACCEPTED: both outcomes are already accepted in the plan (What We're NOT Doing, Migration Notes).

### F7 — `edit` is copied between hook files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/hooks/use-contractions.ts:136-169
- **Detail**: The guards and the own-vs-partner branch are about 90% the same as `use-feedings.ts` `edit`. Phase 5 adds a third copy in `use-sleeps.ts`. The plan keeps these guards in the entity hook on purpose.
- **Fix**: No change in this change; revisit after Phase 5 if the third copy drifts.
- **Decision**: ACCEPTED: kept per the plan; revisit after Phase 5.
