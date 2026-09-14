# Feeding Log Implementation Plan

## Overview

Add post-birth feeding tracking: a live timer that records feeding sessions (start/stop), with milk type, duration, and amount logged on completion. Partner sees new entries within seconds via 5-second polling. The architecture mirrors the contraction tracking domain end-to-end — same local-first SQLite + sync pattern on the frontend, same entity/repo/service/controller pattern on the backend.

## Current State Analysis

The app has a fully working contraction tracking domain (S-03, S-04) with:
- Backend: `Contraction` entity, `ContractionRepository`, `ContractionService`, `ContractionController`, `FeedingException` — all under `backend/src/main/kotlin/com/babytrack/contraction/`.
- Frontend: `use-contractions.ts` hook (local SQLite, 5-second polling, partner sync), contraction screen (`src/app/(app)/index.tsx`), timer/list/row components.
- Local DB: `contractions` + `sync_queue` tables in `src/db/schema.ts` via `CREATE TABLE IF NOT EXISTS`.
- Tab bar: two tabs (`index`, `partner`) registered in `app-tabs.tsx` (native) and `app-tabs.web.tsx` (web).

The partner linking infrastructure (`PartnerService.getPartnerId`) and the shared-feed pattern (`findTop200ByUserIdOrUserIdOrderByStartedAtDesc`) are already available for reuse.

## Desired End State

A parent can tap **Start** on the Feeding tab to begin a session. The elapsed timer runs while they nurse or bottle-feed. Tapping **Stop** opens a completion sheet where they pick milk type (Breast / Formula / Pumped / Other), enter amount in ml and/or a note, then save. The entry appears in the feeding log list below the timer. The partner's Feeding tab reflects the new entry within ~5 seconds. Either partner can edit (times only) or delete any entry.

### Key Discoveries

- `schema.ts` uses `CREATE TABLE IF NOT EXISTS` — adding the `feedings` table to `runMigrations` is safe for all installs.
- `use-contractions.ts:157` takes `hasPartner: boolean` from the caller. The caller gets this from `usePartner()` (see `src/app/(app)/index.tsx:22-25`). `use-feedings.ts` follows the same pattern.
- The upload sync (`syncWithBackend`) only uploads records where `synced = 0 AND ended_at IS NOT NULL`. In-progress (active) feedings are never uploaded until finalized — so the backend POST for a feeding can require all fields including `milkType` and `endedAt`.
- `GlobalExceptionHandler.kt` needs one new handler for `FeedingNotFoundException` — add it alongside the existing `ContractionNotFoundException` handler.
- Tab order: Feeding tab goes between `index` (Contractions) and `partner` in both `app-tabs.tsx` and `app-tabs.web.tsx`. Typed route string: `'/(app)/feeding-log'` (following expo-router typed routes lesson).

## What We're NOT Doing

- Push notifications for feeding events (open roadmap question, out of scope)
- Amount unit preference (ml/oz toggle) — ml only for MVP
- Rich editing of milk type, amount, note after the fact — time edit only (same scope as contractions)
- Pagination beyond 200 most recent feeding entries
- Feeding-specific analytics or signals (no equivalent of the 5-1-1 banner)
- Sleep log (S-06) or medicine log (S-07) — separate changes
- Sync queue processing improvements or server-side UUID round-tripping — existing pattern reused as-is

## Implementation Approach

Phase 1 adds the backend domain. Phase 2 wires the local data layer. Phase 3 builds the UI and registers the tab. Each phase is independently deployable and verifiable before the next begins.

The backend uses a single `POST /api/feedings` endpoint that receives a fully-finalized feeding (startedAt + endedAt + milkType required) — no separate create/finalize two-step. This simplifies the upload path because in-progress feedings only exist locally. `PATCH /api/feedings/:id` handles after-the-fact time edits. The ownership check (`requester = owner OR requester = partner`) mirrors `ContractionService` exactly.

## Critical Implementation Details

**Finalized-only upload:** Unlike contractions (which have a two-step POST+PATCH upload path), feedings are uploaded as a single POST only after finalization (`ended_at IS NOT NULL`). The backend `POST /api/feedings` therefore requires `milkType` and `endedAt` to be non-null. This is the key difference from the contraction upload shape.

**Milk type as `TEXT` in SQLite:** The local `feedings` table stores `milk_type` as `TEXT` (SQLite has no enum type). The TypeScript type alias `MilkType = 'BREAST' | 'FORMULA' | 'PUMPED' | 'OTHER'` enforces safety at the TS layer. In the backend JPA entity, `milkType` is `@Enumerated(EnumType.STRING)`.

**Crash recovery:** Because the feeding timer creates a local active record (with `ended_at NULL`), the same crash-recovery pattern from contractions applies: on app load, check for `ended_at IS NULL` in `useFeedings()`'s `initialActiveId`, and show a recovery modal if present. The `feeding-log.tsx` screen implements this identically to `index.tsx`.

---

## Phase 1: Backend — V5 migration + Feeding domain

### Overview

Create the `feedings` PostgreSQL table and the full Spring Boot domain (entity, repository, service, controller, exception). Exposes 5 endpoints under `/api/feedings` following the exact same pattern as `/api/contractions`.

### Changes Required

#### 1. Flyway V5 migration

**File**: `backend/src/main/resources/db/migration/V5__create_feedings.sql`

**Intent**: Create the `feedings` table with all columns needed for a feeding event. Index on `(user_id, started_at DESC)` mirrors the contractions index.

**Contract**: Table `feedings` with columns: `id UUID PK DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `milk_type VARCHAR(20) NOT NULL`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ NOT NULL`, `duration_minutes INT`, `amount_ml INT`, `note TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Note: `ended_at` is NOT NULL because the server only ever receives finalized feedings.

#### 2. Feeding entity + MilkType enum

**File**: `backend/src/main/kotlin/com/babytrack/feeding/Feeding.kt`

**Intent**: JPA entity mapping the `feedings` table. Define `MilkType` enum (`BREAST`, `FORMULA`, `PUMPED`, `OTHER`) in the same file, mapped via `@Enumerated(EnumType.STRING)`. Structure mirrors `Contraction.kt` — same `@ManyToOne(fetch = LAZY)` for `user`, same `userId` read-only column projection.

**Contract**: Class `Feeding` with fields `id: UUID`, `user: User`, `userId: UUID`, `milkType: MilkType`, `startedAt: Instant`, `endedAt: Instant`, `durationMinutes: Int?`, `amountMl: Int?`, `note: String?`, `createdAt: Instant`, `updatedAt: Instant`. Companion enum class `MilkType`.

#### 3. FeedingRepository

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingRepository.kt`

**Intent**: Spring Data JPA repository with the same two derived queries as `ContractionRepository` — one for own records, one for the shared two-user feed.

**Contract**: `FeedingRepository : JpaRepository<Feeding, UUID>` with methods:
- `findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Feeding>`
- `findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Feeding>`

#### 4. FeedingService

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt`

**Intent**: Business logic for create, update, shared list, own list, and delete. Partner ownership check (owner OR partner may edit/delete) is identical to `ContractionService`.

**Contract**: Methods:
- `create(userId, startedAt, endedAt, milkType, durationMinutes?, amountMl?, note?): Feeding` — creates and saves
- `update(id, requesterId, startedAt?, endedAt?, milkType?, durationMinutes?, amountMl?, note?): Feeding` — ownership check then partial update
- `listShared(userId): List<Feeding>` — resolves partner via `partnerService.getPartnerId`, falls back to own if no partner
- `list(userId): List<Feeding>` — own records only
- `delete(id, userId)` — ownership check then deletion

#### 5. FeedingController + DTOs

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingController.kt`

**Intent**: REST controller under `@RequestMapping("/api/feedings")`. Request/response DTOs defined in the same file. Auth via the same `principal()` helper pattern.

**Contract**: DTOs:
- `CreateFeedingRequest(startedAt: Instant, endedAt: Instant, milkType: MilkType, durationMinutes: Int?, amountMl: Int?, note: String?)`
- `UpdateFeedingRequest(startedAt: Instant?, endedAt: Instant?, milkType: MilkType?, durationMinutes: Int?, amountMl: Int?, note: String?)`
- `FeedingDto(id, userId, milkType, startedAt, endedAt, durationMinutes, amountMl, note, createdAt)` — `MilkType` serializes as its string name

Endpoints:
- `POST /` → `create()` → 201 Created
- `PATCH /{id}` → `update()` → 200 OK
- `GET /` → `list()` → 200 OK
- `GET /shared` → `shared()` → 200 OK
- `DELETE /{id}` → `delete()` → 204 No Content

#### 6. FeedingException

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingException.kt`

**Intent**: Domain exception thrown when a feeding is not found or not accessible by the requester (same obscure-404 pattern as `ContractionNotFoundException`).

**Contract**: Class `FeedingNotFoundException(message: String) : RuntimeException(message)`

#### 7. GlobalExceptionHandler update

**File**: `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`

**Intent**: Register `FeedingNotFoundException` as a 404 ProblemDetail response, following the identical pattern of the existing `handleContractionNotFound` handler.

**Contract**: Add `@ExceptionHandler(FeedingNotFoundException::class)` handler returning `ProblemDetail.forStatus(HttpStatus.NOT_FOUND)` with `type = "urn:babytrack:error:feeding-not-found"`.

### Success Criteria

#### Automated Verification

- `./gradlew bootRun` starts without errors; V5 migration appears in startup logs
- `POST /api/feedings` (with valid JWT + body) → 201 Created with FeedingDto
- `GET /api/feedings/shared` (with valid JWT) → 200 OK with list

#### Manual Verification

- Create a feeding via curl, verify it appears in `GET /api/feedings`
- Attempt to edit/delete a feeding as a non-partner → 404 (not 403)
- Two linked test users: user A creates feeding → user B's `GET /api/feedings/shared` includes it

---

## Phase 2: Frontend — local DB table + use-feedings hook

### Overview

Add the `feedings` SQLite table to the local schema, define `LocalFeeding` and `MilkType` types, and implement `use-feedings.ts` — the data hook that drives all feeding screen state, with local-first mutations and 5-second partner polling.

### Changes Required

#### 1. SQLite schema — add feedings table

**File**: `src/db/schema.ts`

**Intent**: Add the `feedings` table to the `runMigrations` function using `CREATE TABLE IF NOT EXISTS` so existing installs safely pick it up on next launch.

**Contract**: New table in the `execAsync` block:
```sql
CREATE TABLE IF NOT EXISTS feedings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  milk_type TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER,
  amount_ml INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);
```
`milk_type` is nullable locally (can be null for an in-progress feeding before the completion sheet is filled).

#### 2. Type definitions

**File**: `src/db/types.ts`

**Intent**: Add `LocalFeeding` interface and `MilkType` type alias alongside the existing `LocalContraction`.

**Contract**:
- `export type MilkType = 'BREAST' | 'FORMULA' | 'PUMPED' | 'OTHER'`
- `export interface LocalFeeding` with fields: `id: string`, `userId: string`, `milkType: MilkType | null`, `startedAt: string`, `endedAt: string | null`, `durationMinutes: number | null`, `amountMl: number | null`, `note: string | null`, `createdAt: string`, `updatedAt: string`, `synced: number`

#### 3. use-feedings hook

**File**: `src/hooks/use-feedings.ts`

**Intent**: Data hook for the feeding screen. Mirrors `use-contractions.ts` in structure: opens the DB, runs migrations, loads feedings, does a one-shot sync on init, and polls every 5 seconds when a partner is linked.

**Contract**: Exported interface:
```ts
export interface UseFeedingsResult {
  feedings: LocalFeeding[];
  activeFeeding: LocalFeeding | null;
  isLoading: boolean;
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (
    id: string,
    endedAt: Date,
    milkType: MilkType,
    durationMinutes?: number | null,
    amountMl?: number | null,
    note?: string | null,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => Promise<void>;
}

export function useFeedings(hasPartner: boolean): UseFeedingsResult
```

Implementation notes:
- `start()`: INSERT into `feedings` with `ended_at NULL`, `milk_type NULL`, `synced=0`. Enqueue `CREATE` to `sync_queue` (same pattern as contractions).
- `finalize()`: UPDATE local row with all fields, `synced=0`. Enqueue `FINALIZE`.
- `remove()`: Own entries → local DELETE + `DELETE` sync_queue entry. Partner entries → direct `DELETE /api/feedings/:id` (online-only).
- `edit()`: Own entries → local UPDATE + FINALIZE sync_queue. Partner entries → direct `PATCH /api/feedings/:id`.
- `syncWithBackend()`:
  - Download: `GET /api/feedings/shared` — partner rows `INSERT OR REPLACE`, own rows `insert-if-new`, purge stale partner rows not in server response.
  - Upload: find `synced=0 AND ended_at IS NOT NULL AND user_id = ?` rows → `POST /api/feedings` with full data (startedAt, endedAt, milkType, durationMinutes, amountMl, note) → mark `synced=1`.
- `FEEDING_COLS` constant: SQL column aliases for camelCase mapping (same fix as `CONTRACTION_COLS` in `use-contractions.ts` — prevents "Invalid Date" / undefined fields from SQLite snake_case columns).

A `ServerFeeding` interface mirrors the backend `FeedingDto` shape for typed API responses.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

#### Manual Verification

- (Deferred to Phase 3 — this phase has no UI)

---

## Phase 3: Frontend — feeding tab screen + UI components + tab registration

### Overview

Build the feeding screen and all its components, then register the new tab between Contractions and Partner. The screen layout mirrors `index.tsx` (contraction screen): timer card at top, history list below, crash-recovery modal.

### Changes Required

#### 1. Feeding timer component

**File**: `src/components/feeding-timer.tsx`

**Intent**: Timer card showing elapsed time for the active feeding, with a Start button (when no active feeding) or Stop button (when active). Mirrors `contraction-timer.tsx` but without strength rating — details are collected after stopping.

**Contract**: Props `{ active: LocalFeeding | null; onStart: () => void; onStop: (endedAt: Date) => void }`. Displays elapsed time since `active.startedAt` using a `setInterval(1000)` counter. Start/Stop buttons styled identically to their contraction equivalents. No strength UI.

#### 2. Feeding completion sheet

**File**: `src/components/feeding-completion-sheet.tsx`

**Intent**: Bottom-sheet modal shown immediately after the user taps Stop. Collects milk type (segmented control: Breast / Formula / Pumped / Other), optional amount in ml (numeric keyboard), and optional note (text input). Confirms with a Save button.

**Contract**: Props `{ visible: boolean; onSave: (milkType: MilkType, amountMl: number | null, note: string | null) => void; onCancel: () => void }`. Uses React Native `Modal` with a white/dark card anchored to the bottom (same pattern as `TimeEditSheet`). Milk type defaults to `'BREAST'`. Save calls `onSave` with the collected values; Cancel dismisses without saving (the local active feeding row remains for the next attempt).

#### 3. Feeding row component

**File**: `src/components/feeding-row.tsx`

**Intent**: Single feeding entry row in the history list. Shows: milk type badge (color-coded), start time, duration (if present), amount in ml (if present), note (if present), and author label when partner is linked. Swipe-right to delete (with inline confirm step, same pattern as `contraction-row.tsx`).

**Contract**: Props `{ feeding: LocalFeeding; onDelete: (id: string) => void; onEdit: (feeding: LocalFeeding) => void; currentUserId?: string; partnerLabel?: string | null }`. Author label shown only when `currentUserId` is provided and `feeding.userId !== currentUserId`. Milk type badge uses distinct colors: Breast = primary accent, Formula = green, Pumped = blue, Other = grey (`ThemedView type="backgroundElement"`).

#### 4. Feeding list component

**File**: `src/components/feeding-list.tsx`

**Intent**: Renders the scrollable list of `FeedingRow`s. Shows an empty-state message ("No feedings logged yet") when the list is empty.

**Contract**: Props `{ feedings: LocalFeeding[]; onDelete: (id: string) => void; onEdit: (feeding: LocalFeeding) => void; currentUserId?: string; partnerLabel?: string | null }`. Maps each feeding to a `FeedingRow`.

#### 5. Incomplete feeding modal

**File**: `src/components/incomplete-feeding-modal.tsx`

**Intent**: Crash-recovery modal shown when an active feeding (no `ended_at`) is detected at app startup — mirrors `IncompleteContractionModal`. Gives the user the choice to continue the timer or end it now.

**Contract**: Props `{ visible: boolean; onContinue: () => void; onEndNow: () => void }`. Same layout and button labels as the contraction equivalent.

#### 6. Feeding time edit sheet

**File**: `src/components/feeding-time-edit-sheet.tsx`

**Intent**: Bottom sheet to edit `startedAt` and `endedAt` on a completed feeding entry. Mirrors `time-edit-sheet.tsx` for contractions.

**Contract**: Props `{ feeding: LocalFeeding | null; onClose: () => void; onConfirm: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => void }`. Uses the same date/time picker pattern.

#### 7. Feeding log screen

**File**: `src/app/(app)/feeding-log.tsx`

**Intent**: Main feeding tab screen. Mirrors `index.tsx`: imports `usePartner` and `useFeedings`, renders the timer card, completion-sheet modal, crash-recovery modal, time-edit sheet, and the feeding list. Handles Start/Stop/finalize/edit/remove callbacks.

**Contract**: Default export `FeedingLogScreen`. Uses `usePartner()` for `partner` (derives `hasPartner` and `partnerLabel`). Passes `hasPartner` to `useFeedings`. The completion sheet appears when `pendingStop` state holds the `endedAt` Date from `FeedingTimer.onStop`; calling `finalize()` from the sheet clears `pendingStop`. Same `StyleSheet` pattern (`safeArea`, `scrollContent`, `container`) as `index.tsx`.

#### 8. Tab registration — native

**File**: `src/components/app-tabs.tsx`

**Intent**: Add the Feeding tab trigger between the Contractions and Partner triggers.

**Contract**: Add `<NativeTabs.Trigger name="feeding-log">` with label "Feeding" and an appropriate tab icon. Position it as the second trigger (after `index`, before `partner`).

#### 9. Tab registration — web

**File**: `src/components/app-tabs.web.tsx`

**Intent**: Add the Feeding tab trigger in the web tab bar, also between Contractions and Partner.

**Contract**: Add `<TabTrigger name="feeding-log" href="/feeding-log">` as the second entry. Use the same icon/label as the native tab.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

#### Manual Verification

- Feeding tab appears in the tab bar between Contractions and Partner
- Tap Start → elapsed timer counts up
- Tap Stop → completion sheet opens; pick milk type, enter optional amount/note, tap Save → entry appears in list below timer
- Entry shows correct milk type badge, duration, amount, time
- Force-close app with active feeding, reopen → crash-recovery modal offers Continue or End Now
- Partner device: create a feeding on device A → within ~5 seconds it appears on device B's Feeding tab
- Either partner can swipe-delete any entry; either partner can edit times via long-press (or swipe-left)
- No regressions on the Contractions tab or Partner tab

---

## Testing Strategy

### Manual Testing Steps

1. Start a feeding, verify timer increments every second
2. Stop feeding, complete the sheet with each milk type in turn
3. Verify the history list shows duration and amount correctly
4. Link two test accounts and verify partner sync (create on A → appears on B within 5s)
5. On device B, delete an entry logged by device A — should succeed
6. Force-kill app mid-feeding, reopen, verify recovery modal

## Migration Notes

The local SQLite schema change (`CREATE TABLE IF NOT EXISTS feedings`) is backward-compatible — existing installs simply gain the new table on next launch. No data loss.

The Flyway V5 migration is additive (no `ALTER TABLE` on existing tables) — no rollback concern.

## References

- Contraction tracking pattern: `backend/src/main/kotlin/com/babytrack/contraction/`
- Local-first hook: `src/hooks/use-contractions.ts`
- Tab registration: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`
- Partner resolution: `backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt`
- GlobalExceptionHandler: `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — V5 migration + Feeding domain

#### Automated

- [x] 1.1 `./gradlew bootRun` starts; V5 migration appears in startup logs — 33bbb9a
- [x] 1.2 POST /api/feedings → 201 with FeedingDto — 33bbb9a
- [x] 1.3 GET /api/feedings/shared → 200 with list — 33bbb9a

#### Manual

- [x] 1.4 Create feeding via curl, verify it appears in GET /api/feedings — 33bbb9a
- [x] 1.5 Non-partner edit attempt → 404 — 33bbb9a
- [x] 1.6 Two linked users: user A creates feeding → user B's shared feed includes it — 33bbb9a

### Phase 2: Frontend — local DB table + use-feedings hook

#### Automated

- [x] 2.1 npm run lint passes
- [x] 2.2 TypeScript compiles

### Phase 3: Frontend — feeding tab screen + UI components + tab registration

#### Automated

- [ ] 3.1 npm run lint passes
- [ ] 3.2 TypeScript compiles

#### Manual

- [ ] 3.3 Feeding tab appears between Contractions and Partner
- [ ] 3.4 Start → timer counts up; Stop → completion sheet opens and saves entry
- [ ] 3.5 Crash-recovery modal works after force-close with active feeding
- [ ] 3.6 Partner sync: feeding created on device A appears on device B within ~5 seconds
- [ ] 3.7 Either partner can delete or time-edit any entry
- [ ] 3.8 No regressions on Contractions tab or Partner tab
