<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Sleep Log (revised 2026-10-23)

- **Plan**: context/changes/sleep-log/plan.md
- **Mode**: Deep
- **Date**: 2026-10-23
- **Verdict**: SOUND (after triage; was REVISE)
- **Findings**: 1 critical, 5 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding
- Paths: 14/14 existing ✓, 6/6 new paths are free ✓.
- Symbols: `insertIfAbsent`, `user_version`, `buildEditTimes`, `parseAmountMl` ✓.
- Brief↔plan ✓.
- `node:sqlite` under jest-expo ✓ (verified during planning).
- `no-explicit-any` is not enabled in the lint config ✓.
- The narrowed jest `testMatch` keeps all 6 current suites ✓.

## Findings

### F1 — The one-time contraction reconciliation deletes contractions the server doesn't have

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 §1, Critical Implementation Details (reconciliation ordering), Migration Notes
- **Detail**: The `user_version` 2 step runs `DELETE FROM contractions WHERE synced = 1` on the assumption that every synced row comes back on the next download. The dev server has **0 contractions** (`select count(*) from contractions` → 0 rows), so locally synced contractions on the phones are not on the server, likely because the database was reset. Deleting them loses them permanently. The feeding v1 step made the same assumption.
- **Fix A ⭐ Recommended**: Replace the blind delete with a reconcile on the first contraction sync after v2. v2 only sets a marker in `sync_queue` or a pragma-adjacent table. On the first successful download:
  - for each own local `synced = 1` contraction, if a server row of the same user with the same `started_at` (compared with `julianday`) exists, delete the local row, because the server copy is downloaded under its id;
  - otherwise set `synced = 0`, so it uploads under its local id;
  - legacy queue rows are still dropped in v2.
  - Strength: No data loss in either case (server has the row / server lost it). No duplicates for rows the server has.
  - Tradeoff: More logic in a one-time path; matching by start time assumes one contraction per user per start instant.
  - Confidence: MED — start instants are unique in practice (the timer starts at "now"), but the server stores microseconds while legacy uploads sent milliseconds.
  - Blind spot: Server rows created by the legacy POST store the client's `startedAt` verbatim; precision not verified on a real row (dev server currently empty).
- **Fix B**: v2 sets `synced = 0` on all own contractions (no delete), so every local contraction re-uploads under its local id.
  - Strength: Trivial, one statement, never loses local data.
  - Tradeoff: Contractions that *are* on the server under a server id get duplicated, both for the partner and back on my device.
  - Confidence: HIGH — behaviour is obvious.
  - Blind spot: How many contractions production users have on the server (none today in dev).
- **Decision**: FIXED via Fix A. v2 marks synced contractions `synced = 2` instead of deleting them. The engine resolves `synced = 2` rows after a successful download: a match by user + `started_at` → drop local; no match → `synced = 0` (re-upload). These rows are protected from overwrite, purge and upload until resolved. Updated: Critical Implementation Details, Phase 3 §1 + tests, Phase 4 §1, Migration Notes, brief.

### F2 — Server contractions without an end time take over the running timer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1 (download), Phase 4 §2
- **Detail**: `Contraction.endedAt` is nullable and `/shared` doesn't filter. The legacy upload leaves such orphans whenever its POST succeeds and its PATCH fails (`use-contractions.ts:122-134`).
  - The engine downloads them. Because `activeContraction` / `initialActiveId` are computed over all rows (`use-contractions.ts:184,364`), an own orphan shows as running with the crash modal.
  - A partner orphan gets stuck: `finalize` filters `user_id = me` and silently does nothing.
  - Feedings and sleeps have non-null `ended_at` on the server, so they are unaffected.
- **Fix**: The engine download skips server rows with a null end, matching the finished-only upload. The active row and `initialActiveId` are computed from own rows only, so `TLocal` gains `userId`.
- **Decision**: FIXED. The download ignores server rows with a null end; `initialActiveId` and the active row come from own rows only (`TLocal` has `userId`). Engine test added. Updated: sync rules, hook contract, Phase 3 §3.

### F3 — The engine contract as written doesn't compile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details (shared engine contract)
- **Detail**: Three problems:
  - `syncEntity<T>` / `deleteEntry<T>` / `editPartnerEntry<T>` use an unconstrained `T` with `EntitySyncConfig<TServer extends {...}>`, which is TS2344 (confirmed with tsc on a scratch copy).
  - `ApiClient` isn't exported anywhere: `src/api/client.ts` exports only `createApiClient`.
  - `AppDatabase` is the full expo `SQLiteDatabase`, so the five-method `node:sqlite` adapter can't be passed without casts.
- **Fix**:
  - Constrain the functions' `T` like the config.
  - Add `export type ApiClient = ReturnType<typeof createApiClient>` to `src/api/client.ts`.
  - The engine takes a narrow `SyncDb` interface (`runAsync`, `getAllAsync`, `getFirstAsync`, `execAsync`, `withTransactionAsync`), which `AppDatabase` satisfies and the adapter implements.
- **Decision**: FIXED. The contract constrains `T extends ServerRow`, adds `export type ApiClient = ReturnType<typeof createApiClient>` to `src/api/client.ts`, and the engine takes `SyncDb` (a `Pick` of five `AppDatabase` methods).

### F4 — The hook helper leaves current feeding behaviour to guesswork

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2–§3
- **Detail**: Phase 3 promises "no behaviour change", but several current behaviours aren't stated:
  - After a partner-edit 404 the dropped row must be reloaded. The engine can't, because it isn't React-aware, so the hook's `editPartner` must reload in `finally`.
  - The `edit()` guards (`endedAt > startedAt`, missing row → throw, own vs partner by `userId`) stay in every entity hook.
  - Sync uses the session token getter with sign-out on 401.
  - Polling is gated on `hasPartner && session`.
  - The initial load sets `isLoading`/`initialActiveId` before the first sync.
  - The upload selects raw snake_case columns including `updated_at` for the guard.
  - A partner-edit success writes `updated_at` = local now, as today.
- **Fix**: Add these as explicit bullets under Phase 3 §2 (hook) and §3 (feedings) so "no behaviour change" is checkable.
- **Decision**: FIXED. Phase 3 §2 spells out the init sequence, polling gate, link-change sync, client construction, and remove/editPartner reload+rethrow. Phase 3 §3 spells out the `edit()` guards per entity, the partner-edit write, and raw columns with `updated_at` for upload.

### F5 — The in-flight guard test needs a React hook harness the plan doesn't specify

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §4 (last test case)
- **Detail**: "Overlapping syncEntity calls through the hook guard run one sync" means rendering `useEntitySync` with `useSession` mocked, which isn't a plain `node:sqlite` test.
- **Fix**: Export the guard from the engine as a pure `createSyncRunner()` (shares one in-flight promise, cleared on settle). Use it in the hook and test it directly next to the other engine tests.
- **Decision**: FIXED. `createSyncRunner()` exported from the engine, used by the hook, and tested directly.

### F6 — Sleep tab icon and web href not specified; typed routes must regenerate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 §4
- **Detail**: The tab icons are PNGs in `assets/images/tabIcons/` (contractions, home, partner). Settings uses SF Symbol + Material names (`app-tabs.tsx:41`), and there is no sleep asset. The web trigger needs `href`. `tsc` rejects `'/sleep-log'` until the generated `.expo/types/router.d.ts` is refreshed by Metro.
- **Fix**:
  - Native: `sf={{ default: 'moon', selected: 'moon.fill' }} md="bedtime"`, like the settings tab.
  - Web: `<TabTrigger name="sleep-log" href="/sleep-log">`.
  - Note that Metro (`npx expo start --dev-client`) must have run once after adding the screen, before `npx tsc --noEmit`.
- **Decision**: FIXED. Phase 5 §4 specifies the native icon `sf moon / moon.fill, md bedtime` (Settings pattern, no asset), the web `href="/sleep-log"`, and the typed-routes regeneration note.

### F7 — Small precision gaps: renamed-file importers, "Cancel only" is a change

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §3–§4
- **Detail**:
  - The rename `feeding-edit.ts` → `entry-edit.ts` affects four importers: `feeding-log.tsx:9`, `feeding-completion-sheet.tsx:6`, `use-feedings.ts:5` and the test. The plan only says "Feeding imports are updated".
  - Today's sheet for a running contraction also has a Confirm button that sends an empty patch, so "Cancel only" is a small behaviour change, not "today's behaviour".
  - `timeEdit.title` becomes unused, while `timeEdit.stopFirst` moves to the new sheet.
- **Fix**: Name the four importers. Reword to "Cancel only (Confirm is removed; it only re-saved the same values)". Remove `timeEdit.title`.
- **Decision**: FIXED. The four importers of the renamed file are named; the running-contraction sheet is reworded as "Cancel only, Confirm removed"; `timeEdit.title` is removed while `stopFirst`/`endAfterStart` stay. Also noted: `index.tsx` is the only caller of `edit`, and the active contraction comes from own rows.
