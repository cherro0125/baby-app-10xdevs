<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sleep Log

- **Plan**: context/changes/sleep-log/plan.md
- **Scope**: Phase 3 of 5 (commit `a1a6846`)
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 6 observations

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
- Plan adherence: every planned item matches. The acceptable drifts are: `ServerRow` gained `startedAt` (needed for the purge window and the legacy match); partner rows always take the server version, even when `synced = 2` (they already carry server ids); `useEntitySync` doesn't log itself, and `use-feedings` logs with `[useFeedings]` and rethrows instead.
- Success criteria: `npm test` passes 72/72 (20 of them engine tests). `npx tsc --noEmit` is clean. `npm run lint` shows only the 1 warning that was already there. The grep returns 0. Manual checks 3.5–3.7 were confirmed by the user on the iPhone and the simulator with linked accounts.
- Checked and not a finding: legacy contractions whose server copy has no end can't be `synced = 2`. The old upload only marked a row synced after its PATCH succeeded, so a failed PATCH left it at `synced = 0`.

## Findings

### F1 — Legacy rows outside a full page window are re-uploaded as duplicates

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:156-162
- **Detail**: Legacy rows are matched only against the 200-row shared page, which mixes both partners' rows. When the page is full, a `synced = 2` row older than `windowStart` can never match. It is then set to `synced = 0` and PUT under its local id, which creates a duplicate on the server. The own purge already respects the window; the legacy step doesn't. For contractions (Phase 4), one labour plus the partner's entries can fill a page. No test covers this.
- **Fix**: When `windowStart` is set, resolve only legacy rows with `julianday(started_at) >= julianday(windowStart)` and leave older ones at `synced = 2`. Add a test next to the full-page window test.
- **Decision**: FIXED: the window condition is added to the `UPDATE … SET synced = 0` (the match DELETE stays global, because a match is correct at any age), plus the test `keeps an unmatched legacy row older than a full page window`.

### F2 — The partner purge deletes other accounts' unsynced and legacy rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:137
- **Detail**: `DELETE FROM t WHERE user_id != ?` removes every row of any other account on the device, including that account's `synced = 0` rows that haven't been uploaded. This existed before the refactor, and the code already expects several accounts per device (see the tombstone comment). After the v2 migration in Phase 4, it would also remove another account's unresolved `synced = 2` contractions, which may exist only on the phone.
- **Fix**: Purge only downloaded rows: add `AND synced = 1` to the partner purge (partner rows are always stored with `synced = 1`). Add a test.
- **Decision**: FIXED: the partner purge is now limited to `synced = 1`, plus the test `keeps pending and legacy rows of another account that used this device`.

### F3 — The engine's helpers are copied into three files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/sync/entity-sync.ts:37-46, src/hooks/use-feedings.ts:8-17, src/hooks/use-contractions.ts:9-19
- **Detail**: `uuid()` and `nowIso()` now exist in three files, and Phase 5 would add a fourth copy in `use-sleeps.ts`.
- **Fix**: Export them from one module (e.g. `src/sync/ids.ts`) and import them; do it in Phase 4, when contractions move onto the engine anyway.
- **Decision**: FIXED: added `src/sync/ids.ts`, now imported by `entity-sync.ts` and `use-feedings.ts`. `use-contractions.ts` switches to it in Phase 4.

### F4 — Every poll rewrites all rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:110-131
- **Detail**: Each 5 s poll runs about 200 autocommit writes per entity even when nothing changed: the own upsert always fires, and partner rows are replaced. With three entities that is about 600 writes every 5 s. The plan lists this under "What We're NOT Doing", and it is already tracked as a follow-up (`context/archive/2026-10-21-feeding-edit-details/follow-ups/review-fixes.md`). New detail for that follow-up: the batching has to use `withExclusiveTransactionAsync`. Plain `withTransactionAsync` shares the connection, so a concurrent `deleteEntry` transaction would hit a nested BEGIN.
- **Fix**: No change now; add the exclusive-transaction note to the existing follow-up.
- **Decision**: FIXED (no code change): queued in `context/changes/sleep-log/follow-ups/review-fixes.md`, because the archived follow-up can't be edited.

### F5 — A broken download blocks all uploads

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:97-99
- **Detail**: If `res.json()` throws, the outer catch skips the upload. This existed before the refactor.
- **Fix**: Wrap the download block in its own try/catch so uploads still run.
- **Decision**: FIXED: the download processing moved into `applyDownload`, and only that call sits in its own try/catch. `api.request` stays outside it, so a 401 or a network error still stops the whole sync (no repeated `signOut`). Test added: `still uploads when the download body is malformed`.

### F6 — Deleting an unresolved legacy row brings it back

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:196-215
- **Detail**: A `synced = 2` row deleted before its first successful sync gets a tombstone under its local id. The server answers 404, the tombstone is cleared, and the server copy comes back on the next download. The window is narrow, and the plan accepts the same outcome for pre-update deletions (line 78).
- **Fix**: No change; mention it in the Phase 4 migration notes.
- **Decision**: FIXED (no code change): added to the plan's Migration Notes, in the Local section.

### F7 — A failing reload hides the partner-edit error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/use-entity-sync.ts:136-139
- **Detail**: If `reload()` throws inside `finally`, its error replaces the original `editPartnerEntry` error.
- **Fix**: `await reload().catch(console.error)` in the `finally`.
- **Decision**: FIXED

### F8 — The null-end filter lets a missing field through

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/sync/entity-sync.ts:102
- **Detail**: `r.endedAt !== null` keeps a row whose `endedAt` is `undefined`.
- **Fix**: Use `r.endedAt != null`.
- **Decision**: FIXED
