<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Feeding Edit Details

- **Plan**: context/changes/feeding-edit-details/plan.md
- **Scope**: Full plan (Phases 1–3 of 3, plus out-of-plan commits b9c1ff3, dfb9db8)
- **Date**: 2026-10-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated criteria were re-run on 2026-10-22, all green:
- `npm test`: 45 tests
- `npx tsc --noEmit`: OK
- `npm run lint`: 0 errors; 1 warning in the untouched `src/i18n/index.ts`
- the old sheet file is gone
- `./gradlew test`: 41 tests, 0 failures

All 12 Phase 3 manual rows were confirmed by the user on two devices (iPhone and Galaxy S25 Ultra).

## Findings

### F1 — Editing a feeding that crosses midnight can silently save a ~24 h feeding

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/feeding-edit.ts:30-46
- **Detail**: `buildEditTimes` keeps each time on its original calendar day. Days only move forward, and nothing rejects 24 h or more. Take a night feed from 23:40 to 00:15 (next day):
  - changing the end to 23:58 saves a 24 h 18 min feeding;
  - changing the start to 00:05 saves a 24 h 10 min feeding.

  Both pass the client and server `endedAt > startedAt` checks and sync to the partner. The rule was carried over from the old times-only sheet, but it is now the main edit path, and the tests don't cover these cases.
- **Fix**: Anchor both times to the start's date. If the end is not after the start, add one day to the end. Reject results of 24 h or more as `'endBeforeStart'`, or add a new error key. Add the two scenarios to `feeding-edit.test.ts`.
- **Decision**: FIXED differently — each time goes on the day nearest its original value (±12 h) instead of the start's date. With the start's date, a start moved to after midnight would shift the whole feeding back a day, and a same-day end moved before the start would still save 23 h 50 min. ≥ 24 h returns `'tooLong'`, shown as `feeding.edit.tooLong` (EN + PL). Added 4 tests to `feeding-edit.test.ts`; jest 49/49, tsc and lint green.

### F2 — A feeding my partner deletes stays on my device, and editing it brings it back

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:112-122 (purge), :125-152 (upload)
- **Detail**: The download purge only removes rows with `user_id != me`. Own `synced = 1` rows that the server no longer returns are never removed, yet the backend and `remove()` let a partner delete my feeding.
  1. B deletes A's feeding X. It disappears for B but stays in A's list.
  2. If A later edits X, the upload sends `PUT` with the default `create=true`, and `insertIfAbsent` recreates X.
  3. B's next poll shows X again, so B's deletion is undone.

  Tombstones cover only my own deletions, and `?create=false` covers only partner edits. Now that ids are stable, "server wins" can also cover deletions.
- **Fix A ⭐ Recommended**: After a successful download, delete own rows that are `synced = 1`, not in the response, not tombstoned, and have `started_at >=` the oldest `startedAt` in the response (because of the 200-row limit).
  - Strength: Makes the server the source of truth for deletions as well. One statement in the existing download path.
  - Tradeoff: The window rule needs care. If the response is empty or truncated, the purge has to be skipped or bounded.
  - Confidence: MED — the same pattern as the partner-row purge, but the backend `GET` limit and order need checking.
  - Blind spot: Haven't verified that `GET /api/feedings` orders by `startedAt DESC` with the same 200 limit.
- **Fix B**: Record it in change.md as a known gap and schedule it as a follow-up change.
  - Strength: No new sync logic right before closing the change.
  - Tradeoff: The resurrection bug stays in the build being tested.
  - Confidence: HIGH — documentation only.
  - Blind spot: How often partners delete each other's feedings in practice.
- **Decision**: FIXED via Fix A. After the partner purge, `syncWithBackend` deletes own `synced = 1` rows missing from `/api/feedings/shared`. A full page (`SHARED_PAGE_SIZE` = 200) limits this to `julianday(started_at) >=` the oldest returned `startedAt`. Unsynced rows are kept for upload. If two syncs overlap (F6), an older GET can briefly drop a row that was just uploaded; the next sync downloads it again. tsc, lint, jest 49/49 green; not retested on devices.

### F3 — Invite polling never stops, and on a slow network it never succeeds

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/partner.tsx:37-44, src/hooks/use-partner.tsx:63-69
- **Detail**: The 3 s `setInterval` runs while `invite && !partner`. `invite` is never cleared, `expiresAt` (24 h) is thrown away, and tabs stay mounted. A code that is never accepted means about 1,200 `GET /api/partner` requests per hour for as long as the app is open, including after the code expires. Each `refresh()` also bumps `fetchSeqRef`, so with no fetch timeout, any response slower than 3 s is discarded and the screen never switches to "linked". This polling also adds an `eslint-disable react-hooks/exhaustive-deps` to the file.
- **Fix**: Keep `expiresAt` and stop polling after it. Poll only while the Partner screen is focused (`useIsFocused`). Chain polls with `setTimeout` so the next one starts after the previous one finishes.
- **Decision**: FIXED. `partner.tsx` keeps `expiresAt` and polls only while the Partner screen is focused (`useIsFocused` from expo-router), with a chained `setTimeout` so the next poll starts after the previous `refresh()` finishes. Polling stops when the code expires. tsc, lint, jest 49/49 green.

### F4 — `edit()` resolves without saving when the row is missing, and the sheet closes as if it worked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/hooks/use-feedings.ts:326, :335
- **Detail**: `if (!db || !user) return;` and `if (!existing) return;` resolve quietly. This breaks the cross-phase contract "if saving fails the sheet stays open with an error". Scenario: a partner edit gets a 404 because the partner deleted the feeding. The local row is dropped and the sheet shows "Couldn't save changes. Try again." while still open on a feeding that no longer exists. Tapping Save again resolves quietly and closes the sheet.
- **Fix**: Throw in both early returns. Optionally close the sheet when the feeding has disappeared from the list.
- **Decision**: FIXED. Both early returns in `edit()` now throw, so the sheet stays open with `saveFailed` instead of closing as if saved. tsc, lint, jest green.

### F5 — The client doesn't apply all the server's limits, so an edit can be saved locally but never sync

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/feeding-details-fields.tsx:56-72, src/components/feeding-edit.ts:13-19
- **Detail**: The server requires `@Size(max = 2000)` for the note, and the amount must fit in an `Int`. A longer note or an amount like `9999999999` is saved locally. Every `PUT` then returns 400, the row stays `synced = 0` forever, and nobody is told. This undercuts the reasoning behind skipping phase-2 F4.
- **Fix**: Add `maxLength={2000}` to the note input and an upper bound (e.g. ≤ 10,000 ml) in `parseAmountMl`, with a test.
- **Decision**: FIXED. The note input has `maxLength={2000}`. `parseAmountMl` rejects amounts above 10,000 ml as `'invalid'` (shown as `feeding.edit.invalidAmount`). 3 new test cases; jest 52/52, tsc and lint green.

### F6 — Syncs can overlap, and every 5 s poll rewrites every row

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:85-111, :222-234
- **Detail**: The 5 s `setInterval` has no in-flight guard, and fetch has no timeout, so syncs can overlap. A stale `GET` that lands after a fresh edit briefly reverts the row for one cycle, because partner rows use `INSERT OR REPLACE`. Each poll also writes up to 200 rows one at a time, bumps `updated_at` on every own row, and re-renders the list even when nothing changed.
- **Fix**: Add a `syncInFlight` ref guard, or chain polls with `setTimeout`. Wrap the download in a single transaction and only update rows whose fields actually changed (`IS NOT` comparisons).
  - Strength: Removes the flicker and most of the write load with local changes in one hook.
  - Tradeoff: Touches sync code that has just been manually verified, so it needs a retest.
  - Confidence: MED — the guard is simple; transaction support on expo-sqlite native needs checking against v56 docs.
  - Blind spot: How visible the flicker really is, since manual testing didn't hit it.
- **Decision**: FIXED (partly). `useFeedings` keeps the running sync in `syncInFlightRef`; the 5 s poll and the initial sync join it instead of overlapping. This also covers the F2 purge interaction. Not done yet: single-transaction download and writing only changed rows; queued in `follow-ups/review-fixes.md`. tsc, lint, jest 52/52 green.

### F7 — Feeding tombstones don't record the user

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/hooks/use-feedings.ts:63-79, :304-309
- **Detail**: The payload is `{ feedingId }`, while contraction deletes in the same `sync_queue` use `{ id, userId }`. Scenario: A deletes offline, signs out, and an unlinked B signs in on the same device. B's sync sends the DELETE with B's token, gets 404, and drops the tombstone. A's feeding comes back.
- **Fix**: Add `userId` to the payload and filter tombstones by the current user.
- **Decision**: FIXED. Tombstone payload is now `{ feedingId, userId }`. `syncWithBackend` sends only the current user's tombstones; legacy ones without `userId` are still sent by whoever syncs first. tsc, lint, jest green.

### F8 — Durations change by a minute after sync

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:277, :368; backend/.../FeedingService.kt:37, :68, :90
- **Detail**: The client uses `Math.round`, and the server uses `ChronoUnit.MINUTES.between`, which floors. Own rows now take the server version on download, so a 29 min 40 s feeding shows "30 min" and then "29 min" after the next sync.
- **Fix**: Use `Math.floor` on the client to match the server.
- **Decision**: FIXED. `finalize` and `edit` in `use-feedings.ts` now use `Math.floor`, matching `ChronoUnit.MINUTES.between`. tsc, lint, jest green.

### F9 — A malformed `{id}` or `?create=` returns 500

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt:97
- **Detail**: `MethodArgumentTypeMismatchException` (a non-UUID id, or `create=foo`) falls through to the generic 500 handler. This was already true for PATCH and DELETE. The new 400 handler covers only body errors.
- **Fix**: Add `MethodArgumentTypeMismatchException::class` to the existing 400 handler.
- **Decision**: FIXED. `MethodArgumentTypeMismatchException` was added to `handleInvalidRequest` (400), and its detail text now covers path and query values too. `./gradlew test` green. The live curl check is still pending: the dev backend on :8080 must be restarted first.

### F10 — change.md Notes don't mention the two backend extras from the phase-1 review

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/feeding-edit-details/change.md
- **Detail**: Two additions were approved in reviews/impl-review-phase-1.md (F2, F3) but are not in change.md Notes, unlike every other deviation:
  - `GlobalExceptionHandler` 400 for malformed or invalid bodies (`GlobalExceptionHandler.kt:97`), which applies to every endpoint;
  - `create()` setting `userId` (`FeedingService.kt:32-33`).
- **Fix**: Add one Notes line for both.
- **Decision**: FIXED. Notes lines added to change.md for the phase-1 backend extras and for this review's fixes.
