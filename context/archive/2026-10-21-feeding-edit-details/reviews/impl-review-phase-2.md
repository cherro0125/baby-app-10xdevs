<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Feeding Edit Details Implementation Plan

- **Plan**: context/changes/feeding-edit-details/plan.md
- **Scope**: Phase 2 of 3 (commit 91fc688)
- **Date**: 2026-10-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks re-run: `npm test` (6 suites, 45 tests pass), `npx tsc --noEmit` (exit 0), `npm run lint` (0 errors; 1 warning that was already there in untouched `src/i18n/index.ts`). Manual rows 2.4 and 2.5 were confirmed by the user on the iPhone against the dev Postgres database.

## Findings

### F1 — Sync download can overwrite a fresh local edit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:75
- **Detail**: For own rows, the download first runs `SELECT … WHERE id = ? AND synced = 0` and then, in a separate `await`, runs `INSERT OR REPLACE … synced = 1`. If `edit()` commits its `UPDATE … synced = 0` between those two calls, the server version overwrites the edit and marks it synced, so the edit is lost locally and never uploaded. With a partner linked this runs every 5 s for up to 200 rows. The same path also rewrites every own row (with `updated_at = now`) on every sync, even when nothing changed.
- **Fix**: Replace the SELECT and the INSERT OR REPLACE with one atomic statement, `INSERT … ON CONFLICT(id) DO UPDATE SET … WHERE feedings.synced = 1`, so a pending local edit can never be overwritten. This also drops the per-row SELECT.
- **Decision**: FIXED — the own-row download is now a single conditional upsert (`src/hooks/use-feedings.ts`); tests, tsc and lint re-run green

### F2 — A deleted own feeding comes back after the next sync

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:277
- **Detail**: `remove()` deletes an own feeding only locally. The server keeps the row under the same id, so the next download finds no local row and inserts it again: within ~5 s with a partner linked, otherwise on the next app start. The plan's "Not doing" list calls syncing own deletions a "pre-existing gap, unchanged", but before this change the server copy had a different id, so a deleted row did not visibly reappear. Now the exact row the user deleted comes back. Phase 3's manual checks do not cover deletion.
- **Fix A ⭐ Recommended**: For own rows, call `DELETE /api/feedings/{id}` before deleting locally, treat 404 as success, and throw on any other failure (same as the partner path).
  - Strength: Small change that reuses the existing endpoint and the partner-deletion pattern in the same function.
  - Tradeoff: Deleting your own feeding now needs a connection. Offline it fails, and right now the screen only logs the error.
  - Confidence: HIGH — the endpoint and its owner/partner check already exist.
  - Blind spot: The plan needs an addendum, because this moves an item out of "What We're NOT Doing".
- **Fix B**: Queue local deletions (tombstones) in the existing, currently unused `sync_queue` table. Upload sends DELETE, and download skips ids that are queued.
  - Strength: Stays local-first: deleting works offline and reaches the server later.
  - Tradeoff: More code (queue processing and a download filter), and the change grows past its original scope.
  - Confidence: MEDIUM — `sync_queue` and `SyncQueueItem` with `'DELETE'` exist, but nothing uses them yet.
  - Blind spot: Contractions have the same gap. A queue for feedings only would make the two hooks diverge further.
- **Decision**: FIXED via Fix B — tombstones in `sync_queue` (payload `{ feedingId }`): `remove()` writes tombstone + local delete in one transaction, sync sends `DELETE` before the download (OK/404 clears it), own-row download skips tombstoned ids in the same atomic upsert; noted in change.md

### F3 — A partner edit of a feeding missing on the server recreates it as the editor's own

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:308 (backend: FeedingService.kt:91)
- **Detail**: Partner edits switched from PATCH (404 if the row is missing) to PUT, whose upsert inserts a missing id owned by the requester. If the partner's feeding was already deleted on the server, editing it brings it back as my feeding. Today this is practically unreachable, because owners never delete their own feedings on the server. It becomes reachable if F2 Fix A or Fix B lands.
- **Fix**: If F2 is fixed, also give partner edits a path that cannot create rows (for example `PUT …?create=false` → 404), and write `user_id` from the response. Otherwise leave it as is.
- **Decision**: FIXED — `PUT /api/feedings/{id}?create=false` (`FeedingService.upsert(allowCreate = false)`) returns 404 instead of creating; new `FeedingServiceTest` case; partner edits in `use-feedings.ts` use it and drop the stale local row on 404. `./gradlew test` (41 tests), jest, tsc, lint green

### F4 — A permanently rejected upload retries forever and blocks the server version

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-feedings.ts:105
- **Detail**: If the server answers an upload with a 4xx (validation error, or 404 for an id owned by someone else), the row stays `synced = 0`. It is sent again every sync, and because the download skips pending rows, it never takes the server version. Unlikely: ids are client-generated UUIDs and the client validates the same rules.
- **Fix**: Accept for now. If it shows up, count failed attempts or mark 4xx rows as failed.
- **Decision**: SKIPPED — accepted for now (very unlikely in practice)

### F5 — Unplanned extras are not recorded in change.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/feeding-edit-details/change.md
- **Detail**: Two changes are not in the plan. (1) The temporary bridge in `src/app/(app)/feeding-log.tsx`, which builds a full `FeedingEdit` from the times-only sheet until Phase 3 replaces it. (2) `runMigrations` now runs only once per app process, so the one-time cleanup cannot interleave between the two hooks. Both are benign and were disclosed during implementation, but only in the conversation. Phase 1's deviation was recorded in change.md.
- **Fix**: Add a Phase 2 note to change.md covering both extras.
- **Decision**: FIXED — Phase 2 extras note added to change.md
