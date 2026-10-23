# Sleep Log Implementation Plan

## Overview

Add post-birth sleep tracking. A live timer records a sleep session; on stop the parent picks a type (Nap / Night / Other) and can add a note. The partner sees new entries within seconds, and either partner can edit every field or delete any entry.

The plan first builds one shared, identity-stable sync engine and moves feedings and contractions onto it. Sleep then gets the same guarantees as feedings (no duplicates, server wins for clean rows, deletions sync) without a third copy of the sync code. Contractions also get the identity fix, sync of strength and note, and full editing.

Phase 1 (backend sleep domain) is already implemented in `2832d8c`. This revision (2026-10-23) replaces the original Phases 2–3, which copied the old POST-based sync, and adds the engine and contraction work decided in planning.

## Current State Analysis

- **Sleep backend exists** (`backend/src/main/kotlin/com/babytrack/sleep/`, migrations V7/V8, `SleepServiceTest`). It has POST/PATCH/GET/DELETE but no `PUT /api/sleeps/{id}` upsert, and no `insertIfAbsent`. `SleepService.create` builds `Sleep(user = …)` without the `userId` mirror (`SleepService.kt:27-33`), so the POST response carries a random `userId`. The feeding review fixed the same bug in `FeedingService.create` (`FeedingService.kt:30-33`).
- **No sleep code on the frontend.** There is no `sleeps` table in `src/db/schema.ts`, no types, hook, screen or tab.
- **Feedings already have the correct sync**, embedded in `src/hooks/use-feedings.ts` (443 lines):
  - tombstones with `{ feedingId, userId }` in `sync_queue`;
  - atomic own-row upsert that skips `synced = 0` and tombstoned rows;
  - partner purge, and own purge windowed to the 200-row page;
  - `PUT` upload with the `updated_at` guard;
  - partner edit via `PUT ?create=false` (404 drops the local row);
  - `syncInFlightRef`, 5 s polling, and a sync on link change.
- **Contractions use the old, broken sync** (`src/hooks/use-contractions.ts:66-142`):
  - Upload is `POST {startedAt}` + `PATCH {endedAt}`, so the server assigns its own id (duplicates after edits) and **strength and note are never uploaded**.
  - Own server rows are only inserted when new, never refreshed.
  - `enqueueSync` writes `CREATE` / `FINALIZE` / `DELETE {id, userId}` rows that nothing processes, so `sync_queue` grows forever and own deletions never reach the server.
  - Durations use `Math.round` while the server floors (`ContractionService.kt` `SECONDS.between`).
  - `ContractionService.start` has the same missing `userId` mirror. There is no `ContractionServiceTest`.
- **Contraction edit is times-only** (`src/components/time-edit-sheet.tsx`). Strength (1–10) and note are entered only in the timer (`src/components/contraction-timer.tsx:23,65-100`). The contraction list also renders the running contraction (`src/app/(app)/index.tsx:110`), and the sheet shows a read-only start time with "stop first" for it.
- **Edit helpers:** `src/components/feeding-edit.ts` has the generic `buildEditTimes` (nearest-day ±12 h, `'endBeforeStart'` / `'tooLong'`) and `parseAmountMl`. `TimeRow` / `Stepper` are private in `feeding-edit-sheet.tsx` and duplicated in `time-edit-sheet.tsx`. `buildEditTimes` rebuilds both times at minute precision even when untouched. For feedings this only loses seconds; for contractions it would change a 55 s contraction to 60 s whenever only the strength or note is edited.
- **Local migrations:** `runMigrations` (`src/db/schema.ts`) is memoised per process and uses `PRAGMA user_version` (v1 = feeding re-download). A new `sleeps` table needs only `CREATE TABLE IF NOT EXISTS`, no version bump.
- **Tests:** Jest (`jest-expo`) runs every file under `__tests__/`. Node's built-in `node:sqlite` (Node 25) works under `jest-expo`. Verified during planning: `json_extract`, `ON CONFLICT … DO UPDATE … WHERE` and `julianday` with microsecond timestamps all behave as on device.

## Desired End State

- A **Sleep** tab sits between Feeding and Partner.
  - Start runs a timer. Stop opens a sheet with type (Nap default / Night / Other) and an optional note.
  - Saved entries show a type badge, start time, duration, note and author.
  - Tapping an entry opens an edit sheet for start/end, type and note (the note can be cleared).
  - Swipe deletes the entry, both for my own and for my partner's.
  - A force-closed running sleep offers Continue / End now.
- **Sync is identical for all three entities** and lives in one engine:
  - Own entries are uploaded with their local id via `PUT`, so there are no duplicates.
  - The server wins for rows without pending local changes.
  - Partner and own deletions propagate.
  - Partner edits go through `PUT ?create=false`.
  - With a partner linked, changes appear on the other device within ~5 s.
- **Contractions:**
  - Strength and note reach the server and the partner.
  - Editing covers times, strength and note.
  - Seconds are kept when the times are not touched.
  - Durations match the server.
  - After the update, synced contractions are re-downloaded once under server ids, and the dead legacy queue rows are removed.
- **Feedings behave exactly as before.** Only their sync code now lives in the engine.
- All new strings are in `en.ts` and `pl.ts`. These pass:
  - `npm test`, including the new engine tests on real SQLite;
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - `./gradlew test`.

Verify: the automated suites, then the manual steps in Testing Strategy on the iPhone and the Galaxy S25 Ultra with two linked accounts.

### Key Discoveries:

- The feeding upsert to mirror is in `FeedingRepository.insertIfAbsent` (native `INSERT … ON CONFLICT (id) DO NOTHING`), `FeedingService.upsert(…, allowCreate)` and `FeedingController` `@PutMapping("/{id}")` with `?create=true|false`, returning 201 or 200.
- `GlobalExceptionHandler` needs no change. `spring.mvc.problemdetails.enabled: true` already maps validation and type errors to 400, and `SleepNotFoundException` / `ContractionNotFoundException` → 404 handlers exist.
- Feeding tombstones already queued on devices use payload key `feedingId`. The engine must keep that key for feedings.
- `node:sqlite` needs no new dependency. The existing `/// <reference types="node" />` pattern (`src/__tests__/no-hardcoded-strings.test.ts:1-2`) types it.
- Lessons:
  - every user-visible string goes through `t()` with EN + PL keys, and times/durations through `src/i18n/format.ts`;
  - navigation uses typed routes (`'/(app)/sleep-log'`).

## What We're NOT Doing

- Uploading **running** contractions or sleeps. Only finished entries are uploaded, as today.
- Push notifications, sleep analytics, quality ratings.
- Pagination beyond the 200 most recent entries per entity.
- The sync write-load optimisation (single-transaction download, write only changed rows). It stays a follow-up (`context/archive/2026-10-21-feeding-edit-details/follow-ups/review-fixes.md`); the engine just makes it a one-place change later.
- Restoring contractions deleted locally before this update. Those deletions never reached the server and the legacy queue only holds local ids, so after the one-time re-download they reappear once. Accepted (see Migration Notes).
- Removing the legacy `POST`/`PATCH` endpoints for contractions and sleeps. Old app builds keep working; the app stops calling them.
- Generic shared timer/row/list components. Only `TimeRow`/`Stepper`, `buildEditTimes` and the per-entity details fields are shared.
- Medicine log (S-07).

## Implementation Approach

Backend first (Phase 2), so the client can rely on `PUT` for sleeps and contractions. Then the engine is extracted from the verified feeding sync and feedings are switched to it with no behaviour change (Phase 3). Real-SQLite tests lock the behaviour before any device test, and a feeding regression check on both phones gates the next phase. Contractions move onto the proven engine with their one-time reconciliation and full edit (Phase 4). Sleep is then mostly configuration plus UI (Phase 5).

## Critical Implementation Details

- **Shared engine contract.** Phases 3–5 depend on this module surface. Names are binding; internals are the implementer's.

  ```ts
  // src/sync/entity-sync.ts
  export interface EntitySyncConfig<TServer extends { id: string; userId: string; createdAt: string }> {
    table: 'feedings' | 'contractions' | 'sleeps';
    endpoint: string;              // '/api/feedings' — PUT/DELETE `${endpoint}/{id}`, GET `${endpoint}/shared`
    tombstoneKey: string;          // sync_queue payload key: 'feedingId' (existing), 'contractionId', 'sleepId'
    dataColumns: readonly string[]; // columns besides id, user_id, created_at, updated_at, synced
    fromServer: (row: TServer) => unknown[];             // values in dataColumns order
    uploadBody: (row: Record<string, unknown>) => object; // full-replacement PUT body from a local snake_case row
  }
  export function syncEntity<T>(db: AppDatabase, config: EntitySyncConfig<T>, userId: string, api: ApiClient): Promise<void>;
  export function deleteEntry<T>(db: AppDatabase, config: EntitySyncConfig<T>, api: ApiClient, id: string, userId: string): Promise<void>;
  export function editPartnerEntry<T>(db: AppDatabase, config: EntitySyncConfig<T>, api: ApiClient, id: string, body: object): Promise<void>;

  // src/sync/use-entity-sync.ts
  export function useEntitySync<TLocal extends { id: string; endedAt: string | null }>(
    config: EntitySyncConfig<any>, hasPartner: boolean, load: (db: AppDatabase) => Promise<TLocal[]>,
  ): {
    rows: TLocal[]; isLoading: boolean; initialActiveId: string | null | undefined;
    dbRef: React.RefObject<AppDatabase | null>; reload: () => Promise<void>;
    remove: (id: string) => Promise<void>; editPartner: (id: string, body: object) => Promise<void>;
  };
  ```

- **Sync order and invariants**, moved verbatim from `use-feedings.ts`:
  1. Tombstones of the current user go first: `DELETE`; OK or 404 clears the tombstone.
  2. Download: partner rows `INSERT OR REPLACE`. Own rows use one conditional upsert that skips `synced = 0` and tombstoned ids. Then the partner purge, then the own-synced purge windowed by the oldest `startedAt` when the page is full.
  3. Upload: finished own `synced = 0` rows via `PUT` with the default `create=true`. Mark synced only `WHERE updated_at = ?`.

  The in-flight guard makes overlapping callers join the running sync. Timestamps are compared with `julianday()`.
- **Untouched times stay exact.** `buildEditTimes` must return the original instant for a time whose hour and minute were not changed. Otherwise editing a contraction's strength rounds its seconds away. This also changes feedings: an untouched time keeps its seconds.
- **Contraction reconciliation ordering.** `user_version` 1 → 2 runs inside the memoised `runMigrations` before any sync: `DELETE FROM contractions WHERE synced = 1`, then delete every `sync_queue` row without a `$.feedingId` (legacy contraction `CREATE` / `FINALIZE` / `DELETE`). It runs once, in one transaction, after the v1 step. Sleep tombstones cannot exist yet at that point.
- **`PRAGMA user_version` is shared app-wide.** This change claims `2`. Later local migrations (e.g. medicine-log) must use `3+`.

## Phase 1: Backend — V7/V8 migrations + Sleep domain

Implemented in `2832d8c`. Kept for history.

### Overview

Create the `sleeps` PostgreSQL table with CHECK constraints, and implement the Spring Boot domain (entity, repository, service, controller, exception) with 5 endpoints under `/api/sleeps`, following `/api/feedings`.

### Changes Required:

- `backend/src/main/resources/db/migration/V7__create_sleeps.sql`: `sleeps` table (`id`, `user_id` FK, `sleep_type VARCHAR(20) NOT NULL`, `started_at`, `ended_at NOT NULL`, `duration_minutes`, `note`, `created_at`, `updated_at`) + `(user_id, started_at DESC)` index.
- `backend/src/main/resources/db/migration/V8__add_sleeps_constraints.sql`: `sleep_type IN ('NAP','NIGHT','OTHER')`, `ended_at > started_at`.
- `backend/src/main/kotlin/com/babytrack/sleep/{Sleep,SleepRepository,SleepService,SleepController,SleepException}.kt`: entity + `SleepType`, top-200 queries, create/update/listShared/list/delete with owner-or-partner check, DTOs and endpoints `POST /`, `PATCH /{id}`, `GET /`, `GET /shared`, `DELETE /{id}`.
- `GlobalExceptionHandler`: `SleepNotFoundException` → 404.

### Success Criteria:

#### Automated Verification:

- `./gradlew bootRun` starts without errors; V7 and V8 migrations appear in startup logs
- `POST /api/sleeps` (with valid JWT + body) → 201 Created with SleepDto
- `GET /api/sleeps/shared` (with valid JWT) → 200 OK with list

#### Manual Verification:

- Create a sleep via curl, verify it appears in `GET /api/sleeps`
- Attempt to edit/delete a sleep as a non-partner → 404
- Two linked test users: user A creates sleep → user B's `GET /api/sleeps/shared` includes it

---

## Phase 2: Backend — idempotent upserts for sleeps and contractions

### Overview

Add `PUT /api/sleeps/{id}` and `PUT /api/contractions/{id}`. Each creates under a client-supplied UUID or fully replaces, with the owner-or-partner rule, and `?create=false` for partner edits. Also fix the `userId` mirror on create/start.

### Changes Required:

#### 1. Sleep upsert

**Files**: `backend/src/main/kotlin/com/babytrack/sleep/SleepRepository.kt`, `SleepService.kt`, `SleepController.kt`

**Intent**: Same identity-stable write path as feedings.

**Contract**:
- `SleepRepository.insertIfAbsent(id, userId, sleepType: String, startedAt, endedAt, durationMinutes, note, now): Int`: native `INSERT INTO sleeps … ON CONFLICT (id) DO NOTHING`.
- `SleepService.upsert(id, requesterId, startedAt, endedAt, sleepType, note, allowCreate = true): SleepUpsertResult(sleep, created)` behaves like `FeedingService.upsert`:
  - `require(endedAt > startedAt)`;
  - insert-if-absent when `allowCreate`;
  - otherwise, or on conflict, run the owner-or-partner check, then do a full replace where a null note clears it, recompute duration and bump `updatedAt`;
  - stranger → `SleepNotFoundException`;
  - `allowCreate = false` on a missing id → `SleepNotFoundException`.
- `PUT /api/sleeps/{id}?create=true|false`: body `UpsertSleepRequest(@NotNull startedAt, @NotNull endedAt, @NotNull sleepType, @Size(max = 2000) note?)`; responds 201 (created) or 200 (replaced) with `SleepDto`.
- `SleepService.create` sets `userId = userId` on the entity, like `FeedingService.create`.

#### 2. Contraction upsert

**Files**: `backend/src/main/kotlin/com/babytrack/contraction/ContractionRepository.kt`, `ContractionService.kt`, `ContractionController.kt`

**Intent**: Give contractions the same write path and finally carry strength and note to the server.

**Contract**:
- `ContractionRepository.insertIfAbsent(id, userId, startedAt, endedAt, durationSeconds, strength, note, now): Int`.
- `ContractionService.upsert(id, requesterId, startedAt, endedAt, strength, note, allowCreate = true): ContractionUpsertResult(contraction, created)`, with the same rules as above. `durationSeconds = ChronoUnit.SECONDS.between(...)`. A null strength or note clears it.
- `PUT /api/contractions/{id}?create=…`: body `UpsertContractionRequest(@NotNull startedAt, @NotNull endedAt, @Min(1) @Max(10) strength?, @Size(max = 2000) note?)`; 201 or 200 with `ContractionDto`.
- `ContractionService.start` sets the `userId` mirror.
- Existing `POST` / `PATCH` / `GET` / `DELETE` stay unchanged.

#### 3. Service tests

**Files**: `backend/src/test/kotlin/com/babytrack/sleep/SleepServiceTest.kt`, `backend/src/test/kotlin/com/babytrack/contraction/ContractionServiceTest.kt` (new)

**Intent**: Lock the upsert contracts, in the Mockito style of `FeedingServiceTest`.

**Contract**: For each entity:
- unknown id is created with that id and the requester as owner (`created = true`);
- owner replace clears the nullable fields;
- partner replace keeps the owner;
- stranger → not found;
- `allowCreate = false` on a missing id → not found;
- end not after start → `IllegalArgumentException`;
- create/start returns the requester's `userId`.

### Success Criteria:

#### Automated Verification:

- Backend tests pass: `cd backend && ./gradlew test`
- Backend starts in dev profile: `cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'`

#### Manual Verification:

- `PUT /api/sleeps/{new uuid}` and `PUT /api/contractions/{new uuid}` return 201 with that id; repeating returns 200 and no second row (curl against the dev backend)
- `PUT …/{missing uuid}?create=false` returns 404 for both; a contraction PUT with `strength: 11` returns 400

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Shared sync engine, feedings on it

### Overview

Extract the entity-agnostic sync from `use-feedings.ts` into `src/sync/`, switch feedings to it without changing behaviour, and cover the engine with real-SQLite tests.

### Changes Required:

#### 1. Sync engine

**File**: `src/sync/entity-sync.ts` (new)

**Intent**: One implementation of the identity-stable sync for every entity.

**Contract**: `EntitySyncConfig`, `syncEntity`, `deleteEntry`, `editPartnerEntry` as in Critical Implementation Details. Behaviour is the current feeding sync with the table, endpoint, columns and tombstone key taken from the config:
- `syncEntity` never throws (best effort, as today).
- `deleteEntry`: own row → tombstone `{ [tombstoneKey]: id, userId }` plus local delete in one transaction. Partner row → online `DELETE`; throws on non-OK, then deletes the local row.
- `editPartnerEntry`: `PUT ?create=false`. 404 → drop the local row and throw. Other non-OK → throw. OK → write the returned server row into the local row (`synced = 1`).

#### 2. Hook helper

**File**: `src/sync/use-entity-sync.ts` (new)

**Intent**: The React side shared by all entity hooks.

**Contract**: `useEntitySync(config, hasPartner, load)` as in Critical Implementation Details. It owns:
- opening the database and `runMigrations`, the initial load and the initial sync;
- `initialActiveId`;
- the in-flight guard;
- 5 s polling while `hasPartner`, and one sync when `hasPartner` changes.

It uses refs for session, sign-out and the latest sync callback (no `eslint-disable`, see `use-feedings.ts` today). `remove` and `editPartner` throw when the DB or user isn't ready, so sheets stay open on failure.

#### 3. Feedings on the engine

**File**: `src/hooks/use-feedings.ts`

**Intent**: Keep the public `UseFeedingsResult` and its behaviour; delegate sync, remove and partner edit to the engine.

**Contract**:
- A `FEEDING_SYNC` config with `table: 'feedings'`, `endpoint: '/api/feedings'`, `tombstoneKey: 'feedingId'`, and data columns `milk_type, started_at, ended_at, duration_minutes, amount_ml, note`.
- `start`, `finalize` and the own-row branch of `edit` stay local SQL (floor durations).
- The partner branch of `edit` calls `editPartner`; `remove` calls the engine's `remove`.
- No other hook or screen changes.

#### 4. Engine tests

**Files**: `src/sync/__tests__/entity-sync.test.ts` (new), `src/sync/__tests__/node-sqlite-db.ts` (new), `package.json` (jest `testMatch`)

**Intent**: Prove the sync rules on real SQLite before any device test.

**Contract**:
- `node-sqlite-db.ts` adapts `node:sqlite` `DatabaseSync` to the expo-sqlite subset the engine uses: `runAsync`, `getAllAsync`, `getFirstAsync`, `execAsync`, `withTransactionAsync`.
- Jest `testMatch` is narrowed to `**/__tests__/**/*.test.[jt]s?(x)`, so the adapter isn't run as a suite.
- `fetch` is mocked per test.
- Cases:
  - upload uses `PUT /api/feedings/{localId}` and doesn't mark synced when `updated_at` changed in flight;
  - a pending local edit survives a download;
  - a server change overwrites a clean row;
  - a tombstoned id isn't re-inserted;
  - tombstones are sent only for the current user, and legacy ones without `userId` are sent too;
  - partner rows missing from the server are purged;
  - own synced rows missing from the server are purged, but only inside the window of a full 200-row page;
  - partner edit 404 drops the row and rejects;
  - overlapping `syncEntity` calls through the hook guard run one sync.

### Success Criteria:

#### Automated Verification:

- Jest passes, including the new engine tests: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Lint passes with no new warnings: `npm run lint`
- `use-feedings.ts` no longer contains its own sync loop: `grep -c "api/feedings/shared" src/hooks/use-feedings.ts` returns 0

#### Manual Verification:

- Feeding regression on both phones with a linked partner: log, edit (all fields), delete own, delete partner's — each shows up on the other device within ~5 s as one row
- Deleting my feeding on the partner's phone removes it from mine; editing a partner feeding offline shows the save error
- Unlink/link still clears/brings the partner's feedings

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Contractions on the engine, with full edit

### Overview

Move contractions onto the engine, re-download them once under server ids, upload strength and note, and replace the times-only sheet with a full edit sheet.

### Changes Required:

#### 1. One-time contraction reconciliation

**File**: `src/db/schema.ts`

**Intent**: Align local contraction ids with the server and drop dead queue rows.

**Contract**: After the v1 step, if `user_version < 2`, in one transaction run `DELETE FROM contractions WHERE synced = 1`, `DELETE FROM sync_queue WHERE json_extract(payload, '$.feedingId') IS NULL`, and `PRAGMA user_version = 2`.

#### 2. Contractions hook on the engine

**File**: `src/hooks/use-contractions.ts`

**Intent**: Same sync guarantees as feedings; strength and note reach the server.

**Contract**:
- `CONTRACTION_SYNC` config: `table: 'contractions'`, `endpoint: '/api/contractions'`, `tombstoneKey: 'contractionId'`, data columns `started_at, ended_at, duration_seconds, strength, note`, upload body `{ startedAt, endedAt, strength, note }`.
- `enqueueSync` and all `CREATE` / `FINALIZE` writes are removed.
- `edit(id, changes: ContractionEdit)` replaces the times-only signature. `ContractionEdit = { startedAt: Date; endedAt: Date; strength: number | null; note: string | null }`.
  - Own row → local full update + `synced = 0`.
  - Partner row → `editPartner`.
- Durations use `Math.floor` (seconds), like the server.
- `UseContractionsResult.edit` is updated accordingly.

#### 3. Shared edit pieces

**Files**: `src/components/time-row.tsx` (new), `src/components/feeding-edit.ts` → `src/components/entry-edit.ts` (renamed), `src/components/__tests__/feeding-edit.test.ts` → `entry-edit.test.ts`, `src/components/feeding-edit-sheet.tsx`

**Intent**: One implementation of the hour/minute steppers and the time rule, for all edit sheets.

**Contract**:
- `TimeRow` (with its `Stepper`) moves out of `feeding-edit-sheet.tsx` unchanged and is exported from `time-row.tsx`.
- `entry-edit.ts` keeps `buildEditTimes`, `parseAmountMl` and `FeedingEdit`. `buildEditTimes` returns the original instant for a time whose hour and minute equal the original local hour and minute.
- New test cases: an untouched time keeps its seconds; changing only the end keeps the start exact.
- Feeding imports are updated.

#### 4. Contraction details fields and edit sheet

**Files**: `src/components/contraction-details-fields.tsx` (new), `src/components/contraction-timer.tsx`, `src/components/contraction-edit-sheet.tsx` (new, replaces deleted `src/components/time-edit-sheet.tsx`), `src/app/(app)/index.tsx`

**Intent**: Edit times, strength and note of a finished contraction in one sheet; share the strength/note inputs with the timer.

**Contract**:
- `ContractionDetailsFields` is a controlled component for strength (1–10, tap again to clear) and note (`maxLength 2000`), extracted from the timer markup.
- `ContractionEditSheet` mirrors `FeedingEditSheet`:
  - `KeyboardAvoidingView`, title `contractions.edit.title`;
  - `TimeRow` start/end, then `ContractionDetailsFields`;
  - errors stored as keys: `timeEdit.endAfterStart`, `feeding.edit.tooLong`, `feeding.edit.saveFailed`;
  - Save is disabled while saving; a rejection keeps the sheet open.
- For the running contraction the sheet keeps today's behaviour: read-only start time with `timeEdit.stopFirst`, Cancel only.
- `index.tsx` wires `handleEditSave(id, changes)`, which awaits `edit`, closes on success, logs and rethrows on failure.
- New EN/PL key `contractions.edit.title` ("Edit contraction" / "Edytuj skurcz"). `timeEdit.title` is removed if no longer referenced.

### Success Criteria:

#### Automated Verification:

- Jest passes, including key parity, the hardcoded-string guard and the new time cases: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Lint passes with no new warnings: `npm run lint`
- Old pieces are gone: `test ! -f src/components/time-edit-sheet.tsx && ! grep -rq "enqueueSync" src/hooks`

#### Manual Verification:

- After reloading the updated app each contraction appears once, and the server count does not grow on further reloads
- A contraction logged with strength and note shows both on the partner's device within ~5 s
- Editing a contraction's strength or note leaves its duration unchanged; editing times, strength and note updates both devices as one row
- Deleting my contraction removes it on the partner's device and stays deleted after reload; 5-1-1 banner still behaves as before
- Tapping the running contraction shows the "stop first" sheet

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Sleep — data and UI

### Overview

Add the local `sleeps` table and `use-sleeps.ts` on the engine, build the sleep screen and components, and register the Sleep tab.

### Changes Required:

#### 1. Local table and types

**Files**: `src/db/schema.ts`, `src/db/types.ts`

**Intent**: Local-first storage for sleeps.

**Contract**:
- `CREATE TABLE IF NOT EXISTS sleeps` (`id`, `user_id`, `sleep_type` nullable while running, `started_at`, `ended_at`, `duration_minutes`, `note`, `created_at`, `updated_at`, `synced`), added to the existing block, with no `user_version` change.
- `SleepType = 'NAP' | 'NIGHT' | 'OTHER'`; `LocalSleep` mirrors `LocalFeeding` without amount and with `sleepType`.

#### 2. Sleep hook

**Files**: `src/hooks/use-sleeps.ts` (new), `src/components/entry-edit.ts`

**Intent**: Data hook for the sleep screen on the engine.

**Contract**:
- `SLEEP_SYNC` config: `table: 'sleeps'`, `endpoint: '/api/sleeps'`, `tombstoneKey: 'sleepId'`, data columns `sleep_type, started_at, ended_at, duration_minutes, note`, upload body `{ startedAt, endedAt, sleepType, note }`.
- `useSleeps(hasPartner)` returns `{ sleeps, activeSleep, isLoading, initialActiveId, start(startedAt), finalize(id, endedAt, sleepType, note), remove(id), edit(id, changes: SleepEdit) }`.
- `SleepEdit = { startedAt: Date; endedAt: Date; sleepType: SleepType; note: string | null }`, exported from `entry-edit.ts`.
- Floor durations. Own edit is local; partner edit goes through `editPartner`.

#### 3. Sleep components

**Files**: `src/components/sleep-types.ts`, `sleep-timer.tsx`, `sleep-details-fields.tsx`, `sleep-completion-sheet.tsx`, `sleep-edit-sheet.tsx`, `sleep-row.tsx`, `sleep-list.tsx`, `incomplete-sleep-modal.tsx` (all new)

**Intent**: Sleep UI following the feeding components.

**Contract**:
- `sleep-types.ts` holds the `SLEEP_TYPES` options with i18n keys `sleep.type.{nap,night,other}` and badge keys `sleep.typeShort.*`, like `milk-types.ts`.
- `SleepDetailsFields` is a controlled type segmented control plus note (`maxLength 2000`). It is used by the completion sheet (Nap default) and the edit sheet (falls back to Nap if null).
- The edit sheet behaves like `FeedingEditSheet`:
  - `TimeRow` + `SleepDetailsFields`;
  - `buildEditTimes` with errors `timeEdit.endAfterStart`, `feeding.edit.tooLong`, `feeding.edit.saveFailed`;
  - Save is disabled while saving; a rejection keeps the sheet open.
- Badge colours come from theme tokens or the row's existing colour approach, mirroring `feeding-row.tsx`: NAP blue, NIGHT purple, OTHER grey.
- Row and list behave like feeding row and list (swipe delete with confirm, author label, completed rows only).
- Timer and modal mirror `feeding-timer.tsx` and `incomplete-feeding-modal.tsx`.

#### 4. Screen and tabs

**Files**: `src/app/(app)/sleep-log.tsx` (new), `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: The Sleep tab.

**Contract**:
- `SleepLogScreen` mirrors `feeding-log.tsx`: `pendingStop`, crash-recovery modal ("End now" finalizes as Nap), edit sheet with a rethrowing `handleEditSave`, and the list.
- A tab trigger `sleep-log` with label `tabs.sleep` sits between `feeding-log` and `partner` on native and web.

#### 5. Translations

**Files**: `src/i18n/locales/en.ts`, `src/i18n/locales/pl.ts`

**Intent**: All sleep strings in both languages.

**Contract**:
- `tabs.sleep`: "Sleep" / "Sen".
- `sleep.startButton`: "Start Sleep" / "Rozpocznij sen".
- `sleep.empty`: "No sleep sessions logged yet" / "Nie zapisano jeszcze snu".
- `sleep.details`: "Sleep details" / "Szczegóły snu".
- `sleep.type.{nap,night,other}`: "Nap / Night / Other" / "Drzemka / Noc / Inne".
- `sleep.typeShort.{nap,night,other}`: "NAP / NGT / OTH" / "DRZ / NOC / INN".
- `sleep.incomplete.{title,body}`: "Sleep in progress" / "Sen w toku", plus a body mirroring the feeding one.
- `sleep.edit.title`: "Edit sleep" / "Edytuj sen".

### Success Criteria:

#### Automated Verification:

- Jest passes, including key parity and the hardcoded-string guard: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Lint passes with no new warnings: `npm run lint`

#### Manual Verification:

- Sleep tab appears between Feeding and Partner; Start runs the timer, Stop opens the completion sheet and Save adds the entry with the right badge, duration and note
- Force-closing with a running sleep and reopening offers Continue / End now
- A sleep logged on one phone appears on the other within ~5 s as one row; editing times, type and note on either phone updates both; clearing the note persists after reload
- A night sleep crossing midnight can be edited without jumping a day; end before start and ≥ 24 h show their errors
- Swipe-delete works for own and partner sleeps on both devices
- New texts correct in English and Polish; no regressions on Contractions, Feeding or Partner

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Backend `SleepServiceTest` / `ContractionServiceTest`: upsert create, replace and clear; partner; stranger; `allowCreate = false`; invalid times; create/start `userId`.
- Jest `src/sync/__tests__/entity-sync.test.ts` on `node:sqlite`: every sync rule listed in Phase 3.
- Jest `entry-edit.test.ts`: the existing parse and time cases, plus untouched-time precision.
- Existing guards: locale key parity and the hardcoded-string test.

### Integration Tests:

- None beyond the engine tests; native expo-sqlite behaviour is verified on devices.

### Manual Testing Steps:

1. After updating, each feeding and contraction appears once, and server counts stay stable across reloads.
2. With two linked phones, for each of feeding, contraction and sleep:
   - log an entry;
   - edit all fields on the other phone;
   - delete it from the partner side.
   Each step shows on both phones within ~5 s as one row.
3. Contraction: edit only strength and check the duration is unchanged; check the partner sees strength and note.
4. Sleep: run a night sleep across midnight and edit its end; force-close mid-sleep and recover.
5. Airplane mode: an own edit saves locally and uploads later; a partner edit shows the save error.
6. Switch to Polish and repeat one edit per entity.

## Performance Considerations

Three entities now sync every 5 s while a partner is linked. Each sync writes up to 200 rows per entity, as feedings do today. This is acceptable at current volumes. The queued write-load follow-up becomes a single engine change.

## Migration Notes

- **Backend:** no Flyway migration. `sleeps` and `contractions` tables already fit; `PUT` is additive.
- **Local:**
  - `user_version` 1 → 2 deletes synced contractions (they are re-downloaded on the next sync) and the legacy contraction queue rows.
  - Own contractions deleted locally before the update reappear once and can be deleted again. Their deletions were never sent and the queue held only local ids.
  - Contractions already on the server keep their server-generated ids and get duplicates from earlier edits; those duplicates are not cleaned up.
- **Old app builds** keep using `POST` / `PATCH`, which still work.

## References

- Original plan revision (Phases 2–3 copying the POST sync), superseded on 2026-10-23: see git history of this file.
- Feeding sync and edit pattern: `context/archive/2026-10-21-feeding-edit-details/` (plan, reviews, follow-ups)
- Engine source today: `src/hooks/use-feedings.ts`
- Contraction sync today: `src/hooks/use-contractions.ts:66-142`
- Backend upsert pattern: `backend/src/main/kotlin/com/babytrack/feeding/{FeedingRepository,FeedingService,FeedingController}.kt`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — V7/V8 migrations + Sleep domain

#### Automated

- [x] 1.1 `./gradlew bootRun` starts; V7 and V8 migrations appear in startup logs
- [x] 1.2 POST /api/sleeps → 201 with SleepDto
- [x] 1.3 GET /api/sleeps/shared → 200 with list

#### Manual

- [x] 1.4 Create sleep via curl, verify it appears in GET /api/sleeps
- [x] 1.5 Non-partner edit attempt → 404
- [x] 1.6 Two linked users: user A creates sleep → user B's shared feed includes it

### Phase 2: Backend — idempotent upserts for sleeps and contractions

#### Automated

- [ ] 2.1 Backend tests pass: `cd backend && ./gradlew test`
- [ ] 2.2 Backend starts in dev profile

#### Manual

- [ ] 2.3 PUT on a new uuid returns 201 with that id for sleeps and contractions; repeating returns 200 with no second row
- [ ] 2.4 PUT ?create=false on a missing id returns 404; contraction strength 11 returns 400

### Phase 3: Shared sync engine, feedings on it

#### Automated

- [ ] 3.1 Jest passes, including the new engine tests: `npm test`
- [ ] 3.2 Type checking passes: `npx tsc --noEmit`
- [ ] 3.3 Lint passes with no new warnings: `npm run lint`
- [ ] 3.4 use-feedings.ts no longer contains its own sync loop

#### Manual

- [ ] 3.5 Feeding regression on both phones: log, edit, delete own and partner's sync as one row within ~5 s
- [ ] 3.6 Partner deleting my feeding removes it on mine; offline partner edit shows the save error
- [ ] 3.7 Unlink/link still clears/brings the partner's feedings

### Phase 4: Contractions on the engine, with full edit

#### Automated

- [ ] 4.1 Jest passes, including key parity, the hardcoded-string guard and the new time cases: `npm test`
- [ ] 4.2 Type checking passes: `npx tsc --noEmit`
- [ ] 4.3 Lint passes with no new warnings: `npm run lint`
- [ ] 4.4 Old pieces are gone: time-edit-sheet.tsx and enqueueSync

#### Manual

- [ ] 4.5 After reload each contraction appears once and the server count does not grow
- [ ] 4.6 Strength and note of a new contraction appear on the partner's device within ~5 s
- [ ] 4.7 Editing only strength or note keeps the duration; full edit updates both devices as one row
- [ ] 4.8 Deleting my contraction removes it on the partner's device and after reload; 5-1-1 banner unchanged
- [ ] 4.9 Tapping the running contraction shows the "stop first" sheet

### Phase 5: Sleep — data and UI

#### Automated

- [ ] 5.1 Jest passes, including key parity and the hardcoded-string guard: `npm test`
- [ ] 5.2 Type checking passes: `npx tsc --noEmit`
- [ ] 5.3 Lint passes with no new warnings: `npm run lint`

#### Manual

- [ ] 5.4 Sleep tab between Feeding and Partner; Start/Stop/Save adds an entry with badge, duration and note
- [ ] 5.5 Force-close with a running sleep offers Continue / End now
- [ ] 5.6 Partner sync: sleep appears on the other phone within ~5 s as one row; full edit on either phone updates both; cleared note persists
- [ ] 5.7 Night sleep across midnight edits without a day jump; end-before-start and ≥ 24 h show errors
- [ ] 5.8 Swipe-delete works for own and partner sleeps on both devices
- [ ] 5.9 Texts correct in English and Polish; no regressions on other tabs
