# Sleep Log Implementation Plan

## Overview

Add post-birth sleep tracking: a live timer that records sleep sessions (start/stop), with sleep type (Nap / Night / Other) and an optional note collected on completion. Partner sees new entries within seconds via 5-second polling. The architecture is identical to the feeding-log domain — same local-first SQLite + sync pattern, same backend entity/repo/service/controller structure. Sleep-log is the simplest of the three post-birth slices: no amount field, no milk-type complexity, just start/end time + type + optional note.

## Current State Analysis

The feeding-log domain (S-05) is fully live and provides the direct template:
- Backend: `Feeding` entity, `FeedingRepository`, `FeedingService`, `FeedingController` under `backend/src/main/kotlin/com/babytrack/feeding/`.
- Frontend: `use-feedings.ts` hook, `feeding-log.tsx` screen, timer/completion-sheet/row/list components in `src/components/`.
- Local DB: `feedings` table lives in `src/db/schema.ts`.
- Tab bar: Contractions → Feeding → Partner. Sleep goes between Feeding and Partner.
- Flyway migrations V1–V6 are applied; sleep uses V7 (create table) and V8 (CHECK constraints).
- `GlobalExceptionHandler.kt` already has `FeedingNotFoundException` handler — `SleepNotFoundException` gets the same treatment.

## Desired End State

A parent taps **Start** on the Sleep tab to begin a session. The elapsed timer runs. Tapping **Stop** opens a completion sheet where they pick sleep type (Nap / Night / Other, defaulting to Nap) and optionally enter a note, then tap Save. The entry appears in the sleep log list. The partner's Sleep tab reflects it within ~5 seconds. Either partner can edit (times only) or delete any entry.

### Key Discoveries

- Flyway version V7 is the next available slot (V6 was added by feeding-log review fixes).
- Sleep type enum values: `NAP`, `NIGHT`, `OTHER` — stored as `VARCHAR(20)` in PostgreSQL, `TEXT` in SQLite.
- Backend upload: like feedings, the server only receives finalized sleeps (POST requires `sleepType` and `endedAt` non-null). No two-step upload.
- `durationMinutes` is server-derived from `ChronoUnit.MINUTES.between(startedAt, endedAt)` — not sent by client (same F1 fix from feeding-log review).
- Tab order: Contractions (index) → Feeding (feeding-log) → **Sleep (sleep-log)** → Partner. Insert the new trigger between feeding-log and partner in both `app-tabs.tsx` and `app-tabs.web.tsx`.
- Typed route: `'/(app)/sleep-log'` (expo-router typed routes lesson).

## What We're NOT Doing

- Push notifications for sleep events
- Sleep analytics or signals (no nap-count banner, no 5-1-1 equivalent)
- Sleep quality rating (e.g. 1–5 stars)
- Rich editing of sleep type or note after the fact — time edit only (same scope as contractions and feedings)
- Pagination beyond 200 most recent sleep entries
- Amount or feeding-related fields
- Medicine log (S-07) — separate change

## Implementation Approach

Same three-phase structure as feeding-log: Phase 1 adds the backend domain, Phase 2 wires the local data layer, Phase 3 builds the UI. Each phase is independently verifiable before the next begins.

The POST endpoint receives a finalized sleep (startedAt + endedAt + sleepType required), and the server derives `durationMinutes`. The PATCH endpoint handles time edits only (the edit sheet mirrors `FeedingTimeEditSheet`).

## Critical Implementation Details

**Finalized-only upload:** The server's `POST /api/sleeps` requires `sleepType` and `endedAt` non-null. In-progress sleeps (with `ended_at IS NULL` locally) are never uploaded — only rows where `synced = 0 AND ended_at IS NOT NULL` are sent.

**durationMinutes server-derived:** Do not include `durationMinutes` in `CreateSleepRequest` or `UpdateSleepRequest`. The service computes it via `ChronoUnit.MINUTES.between(startedAt, endedAt).toInt()`.

**Crash recovery:** The sleep timer creates a local active row with `ended_at NULL`. On app load, `useSleeps()` captures `initialActiveId` from the first row with `endedAt === null`. The `sleep-log.tsx` screen shows `IncompleteSleepModal` when that id matches the current `activeSleep`.

---

## Phase 1: Backend — V7/V8 migrations + Sleep domain

### Overview

Create the `sleeps` PostgreSQL table with CHECK constraints, and implement the full Spring Boot domain (entity, repository, service, controller, exception). Exposes 5 endpoints under `/api/sleeps` following the exact same pattern as `/api/feedings`.

### Changes Required

#### 1. Flyway V7 migration

**File**: `backend/src/main/resources/db/migration/V7__create_sleeps.sql`

**Intent**: Create the `sleeps` table with all columns needed for a sleep session. Index on `(user_id, started_at DESC)` mirrors the contractions and feedings indexes.

**Contract**: Table `sleeps` with columns: `id UUID PK DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `sleep_type VARCHAR(20) NOT NULL`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ NOT NULL`, `duration_minutes INT`, `note TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. `ended_at` is NOT NULL — the server only ever receives finalized sleeps.

#### 2. Flyway V8 migration

**File**: `backend/src/main/resources/db/migration/V8__add_sleeps_constraints.sql`

**Intent**: Add DB-level CHECK constraints for `sleep_type` enum values and temporal order — same defense-in-depth pattern as V6 for feedings.

**Contract**:
```sql
ALTER TABLE sleeps
    ADD CONSTRAINT sleep_type_valid CHECK (sleep_type IN ('NAP', 'NIGHT', 'OTHER')),
    ADD CONSTRAINT sleeps_temporal_order CHECK (ended_at > started_at);
```

#### 3. Sleep entity + SleepType enum

**File**: `backend/src/main/kotlin/com/babytrack/sleep/Sleep.kt`

**Intent**: JPA entity mapping the `sleeps` table. `SleepType` enum (`NAP`, `NIGHT`, `OTHER`) in the same file, mapped via `@Enumerated(EnumType.STRING)`. Structure mirrors `Feeding.kt` exactly, without the `amountMl` field.

**Contract**: `enum class SleepType { NAP, NIGHT, OTHER }`. Class `Sleep` with fields: `id: UUID`, `user: User` (`@ManyToOne(fetch = LAZY)`), `userId: UUID` (read-only column projection), `sleepType: SleepType`, `startedAt: Instant`, `endedAt: Instant`, `durationMinutes: Int?`, `note: String?`, `createdAt: Instant`, `updatedAt: Instant`.

#### 4. SleepRepository

**File**: `backend/src/main/kotlin/com/babytrack/sleep/SleepRepository.kt`

**Intent**: Spring Data JPA repository with the same two derived queries as `FeedingRepository`.

**Contract**: `SleepRepository : JpaRepository<Sleep, UUID>` with methods:
- `findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Sleep>`
- `findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Sleep>`

#### 5. SleepService

**File**: `backend/src/main/kotlin/com/babytrack/sleep/SleepService.kt`

**Intent**: Business logic for create, update, shared list, own list, and delete. Partner ownership check (owner OR partner may edit/delete) mirrors `FeedingService` exactly. `durationMinutes` is server-derived via `ChronoUnit.MINUTES.between(startedAt, endedAt).toInt()`.

**Contract**: Methods:
- `create(userId, startedAt, endedAt, sleepType, note?): Sleep`
- `update(id, requesterId, startedAt?, endedAt?, sleepType?, note?): Sleep` — ownership check then partial update; recalculates `durationMinutes`
- `listShared(userId): List<Sleep>` — resolves partner via `partnerService.getPartnerId`
- `list(userId): List<Sleep>` — own records only
- `delete(id, userId)` — ownership check then deletion

#### 6. SleepController + DTOs

**File**: `backend/src/main/kotlin/com/babytrack/sleep/SleepController.kt`

**Intent**: REST controller under `@RequestMapping("/api/sleeps")`. Request/response DTOs in the same file. Auth via the same `principal()` helper pattern.

**Contract**: DTOs:
- `CreateSleepRequest(@NotNull startedAt, @NotNull endedAt, @NotNull sleepType: SleepType, @Size(max=2000) note?)`
- `UpdateSleepRequest(startedAt?, endedAt?, sleepType?, @Size(max=2000) note?)` — with `@Valid` on PATCH handler
- `SleepDto(id, userId, sleepType, startedAt, endedAt, durationMinutes, note, createdAt)`

Endpoints:
- `POST /` → 201 Created
- `PATCH /{id}` → 200 OK
- `GET /` → 200 OK
- `GET /shared` → 200 OK
- `DELETE /{id}` → 204 No Content

#### 7. SleepException

**File**: `backend/src/main/kotlin/com/babytrack/sleep/SleepException.kt`

**Intent**: Domain exception for not-found / not-accessible cases (same obscure-404 pattern as `FeedingNotFoundException`).

**Contract**: `class SleepNotFoundException(message: String) : RuntimeException(message)`

#### 8. GlobalExceptionHandler update

**File**: `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`

**Intent**: Register `SleepNotFoundException` as a 404 ProblemDetail, identical to the existing `handleFeedingNotFound` handler.

**Contract**: Add `@ExceptionHandler(SleepNotFoundException::class)` returning `ProblemDetail.forStatus(HttpStatus.NOT_FOUND)` with `type = "urn:babytrack:error:sleep-not-found"`.

### Success Criteria

#### Automated Verification

- `./gradlew bootRun` starts without errors; V7 and V8 migrations appear in startup logs
- `POST /api/sleeps` (with valid JWT + body) → 201 Created with SleepDto
- `GET /api/sleeps/shared` (with valid JWT) → 200 OK with list

#### Manual Verification

- Create a sleep via curl, verify it appears in `GET /api/sleeps`
- Attempt to edit/delete a sleep as a non-partner → 404
- Two linked test users: user A creates sleep → user B's `GET /api/sleeps/shared` includes it

---

## Phase 2: Frontend — local DB table + use-sleeps hook

### Overview

Add the `sleeps` SQLite table to the local schema, define `LocalSleep` and `SleepType` types, and implement `use-sleeps.ts` — the data hook with local-first mutations and 5-second partner polling. Mirrors `use-feedings.ts` exactly minus the `amountMl` field.

### Changes Required

#### 1. SQLite schema — add sleeps table

**File**: `src/db/schema.ts`

**Intent**: Add the `sleeps` table to `runMigrations` using `CREATE TABLE IF NOT EXISTS`.

**Contract**:
```sql
CREATE TABLE IF NOT EXISTS sleeps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sleep_type TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);
```
`sleep_type` is nullable locally (null during an in-progress session before the completion sheet is filled).

#### 2. Type definitions

**File**: `src/db/types.ts`

**Intent**: Add `LocalSleep` interface and `SleepType` type alias alongside `LocalFeeding`.

**Contract**:
- `export type SleepType = 'NAP' | 'NIGHT' | 'OTHER'`
- `export interface LocalSleep` with fields: `id: string`, `userId: string`, `sleepType: SleepType | null`, `startedAt: string`, `endedAt: string | null`, `durationMinutes: number | null`, `note: string | null`, `createdAt: string`, `updatedAt: string`, `synced: number`

#### 3. use-sleeps hook

**File**: `src/hooks/use-sleeps.ts`

**Intent**: Data hook for the sleep screen. Mirrors `use-feedings.ts` in structure and sync logic, minus `amountMl`.

**Contract**: Exported interface:
```ts
export interface UseSleepsResult {
  sleeps: LocalSleep[];
  activeSleep: LocalSleep | null;
  isLoading: boolean;
  initialActiveId: string | null | undefined;
  start: (startedAt: Date) => Promise<void>;
  finalize: (id: string, endedAt: Date, sleepType: SleepType, note?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  edit: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => Promise<void>;
}

export function useSleeps(hasPartner: boolean): UseSleepsResult
```

Implementation notes:
- `SLEEP_COLS` constant: SQL column aliases mapping snake_case DB columns to camelCase fields (same pattern as `FEEDING_COLS`).
- `start()`: INSERT with `ended_at NULL`, `sleep_type NULL`, `synced=0`.
- `finalize()`: UPDATE local row with `ended_at`, `sleep_type`, `note`, `duration_minutes`, `synced=0`.
- `remove()`: Own → local DELETE. Partner → direct `DELETE /api/sleeps/:id`.
- `edit()`: Own → local UPDATE + `synced=0`. Partner → direct `PATCH /api/sleeps/:id`.
- `syncWithBackend()`:
  - Download: `GET /api/sleeps/shared` — partner rows `INSERT OR REPLACE`, own rows insert-if-new, purge stale partner rows not in response.
  - Upload: `synced=0 AND ended_at IS NOT NULL AND user_id=?` → `POST /api/sleeps` with `{startedAt, endedAt, sleepType, note}` → mark `synced=1`.
- `ServerSleep` interface mirrors `SleepDto` shape.
- 5-second polling interval when `hasPartner=true`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

#### Manual Verification

- (Deferred to Phase 3 — this phase has no UI)

---

## Phase 3: Frontend — sleep tab screen + UI components + tab registration

### Overview

Build the sleep screen and all components, then register the new Sleep tab between Feeding and Partner. Mirrors the feeding-log Phase 3 structure with two differences: `SleepCompletionSheet` has no amount field, and `SleepRow` uses NAP/NIGHT/OTHER badge colors instead of milk type colors.

### Changes Required

#### 1. Sleep timer component

**File**: `src/components/sleep-timer.tsx`

**Intent**: Timer card showing elapsed time, Start button (when idle) or Stop button (when active). Identical to `feeding-timer.tsx` — no strength or type UI during the session.

**Contract**: Props `{ active: LocalSleep | null; onStart: () => void; onStop: (endedAt: Date) => void }`. `setInterval(1000)` elapsed counter from `active.startedAt`. Label "Start Sleep" / "Stop".

#### 2. Sleep completion sheet

**File**: `src/components/sleep-completion-sheet.tsx`

**Intent**: Bottom sheet shown after Stop. Collects sleep type (Nap / Night / Other segmented control, defaulting to Nap) and optional note. Save calls `onSave`; Cancel dismisses without saving.

**Contract**: Props `{ visible: boolean; onSave: (sleepType: SleepType, note: string | null) => void; onCancel: () => void }`. Three-segment control (NAP / NIGHT / OTHER). Optional note `TextInput` (multiline, max 2000 chars). Same `Modal` + bottom-anchored sheet pattern as `FeedingCompletionSheet`, without the amount input row.

#### 3. Sleep row component

**File**: `src/components/sleep-row.tsx`

**Intent**: Single sleep entry row. Shows: sleep type badge (color-coded), start time, duration (if present), note (if present), author label when partner is linked. Swipe-right to delete with inline confirm step.

**Contract**: Props `{ sleep: LocalSleep; onDelete: (id: string) => Promise<void>; onEdit: (sleep: LocalSleep) => void; currentUserId?: string; partnerLabel?: string | null }`. Badge colors: NAP = `#2196F3` (blue), NIGHT = `#7B1FA2` (purple), OTHER = `theme.backgroundElement` (grey). Badge text = 3-char uppercase abbreviation (NAP / NGT / OTH). Same `Swipeable` + confirm-delete pattern as `FeedingRow`.

#### 4. Sleep list component

**File**: `src/components/sleep-list.tsx`

**Intent**: Renders completed `SleepRow`s. Empty state: "No sleep sessions logged yet".

**Contract**: Props `{ sleeps: LocalSleep[]; onDelete: (id: string) => Promise<void>; onEdit: (sleep: LocalSleep) => void; currentUserId?: string; partnerLabel?: string | null }`. Filters to `endedAt !== null` before rendering rows.

#### 5. Incomplete sleep modal

**File**: `src/components/incomplete-sleep-modal.tsx`

**Intent**: Crash-recovery modal when an active sleep is detected at app startup.

**Contract**: Props `{ visible: boolean; onContinue: () => void; onEndNow: () => void }`. Identical layout to `IncompleteFeedingModal` with text "Sleep session in progress" and buttons "Continue timing" / "End now".

#### 6. Sleep time edit sheet

**File**: `src/components/sleep-time-edit-sheet.tsx`

**Intent**: Bottom sheet to edit `startedAt` and `endedAt` on a completed sleep entry.

**Contract**: Props `{ sleep: LocalSleep | null; onClose: () => void; onConfirm: (id: string, patch: { startedAt?: Date; endedAt?: Date }) => void }`. Identical implementation to `FeedingTimeEditSheet` using `LocalSleep`.

#### 7. Sleep log screen

**File**: `src/app/(app)/sleep-log.tsx`

**Intent**: Main sleep tab screen. Mirrors `feeding-log.tsx`: `usePartner` + `useSleeps`, timer, completion sheet (`pendingStop` state), crash-recovery modal, time-edit sheet, sleep list.

**Contract**: Default export `SleepLogScreen`. `pendingStop: Date | null` state — set by `SleepTimer.onStop`, cleared after `finalize()` or Cancel. `handleEndNow()` finalizes with `sleepType = 'NAP'` as default. Same `StyleSheet` pattern (`safeArea`, `scrollContent`, `container`) as `feeding-log.tsx`.

#### 8. Tab registration — native

**File**: `src/components/app-tabs.tsx`

**Intent**: Insert the Sleep tab trigger between Feeding and Partner.

**Contract**: Add `<NativeTabs.Trigger name="sleep-log">` with label "Sleep" and `home.png` icon (same placeholder as Feeding), positioned after `feeding-log` and before `partner`.

#### 9. Tab registration — web

**File**: `src/components/app-tabs.web.tsx`

**Intent**: Insert the Sleep tab trigger in the web tab bar between Feeding and Partner.

**Contract**: Add `<TabTrigger name="sleep-log" href="/sleep-log" asChild>` after the `feeding-log` trigger.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

#### Manual Verification

- Sleep tab appears in the tab bar between Feeding and Partner
- Tap Start → elapsed timer counts up
- Tap Stop → completion sheet opens with Nap/Night/Other control and optional note; Save → entry appears in list
- Entry shows correct sleep type badge, duration, time
- Force-close app with active sleep, reopen → crash-recovery modal offers Continue or End now
- Partner device: sleep logged on device A appears on device B within ~5 seconds
- Either partner can swipe-delete or tap-to-edit times on any entry
- No regressions on Contractions, Feeding, or Partner tabs

---

## Testing Strategy

### Manual Testing Steps

1. Start a sleep, verify timer increments every second
2. Stop sleep — completion sheet opens; cycle through Nap / Night / Other; add a note; Save
3. Verify history list shows correct badge color, duration, note
4. Link two test accounts; log sleep on device A → verify it appears on device B within 5s
5. On device B, delete an entry from device A — should succeed
6. Force-kill app mid-sleep session; reopen; verify recovery modal

## Migration Notes

The local SQLite `CREATE TABLE IF NOT EXISTS sleeps` is backward-compatible. Flyway V7 and V8 are additive (no ALTER on existing tables).

## References

- Feeding log pattern: `context/archive/2026-09-14-feeding-log/plan.md`
- Feeding domain reference: `backend/src/main/kotlin/com/babytrack/feeding/`
- Local-first hook reference: `src/hooks/use-feedings.ts`
- Completion sheet reference: `src/components/feeding-completion-sheet.tsx`
- Tab registration: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

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

### Phase 2: Frontend — local DB table + use-sleeps hook

#### Automated

- [ ] 2.1 npm run lint passes
- [ ] 2.2 TypeScript compiles

### Phase 3: Frontend — sleep tab screen + UI components + tab registration

#### Automated

- [ ] 3.1 npm run lint passes
- [ ] 3.2 TypeScript compiles

#### Manual

- [ ] 3.3 Sleep tab appears between Feeding and Partner
- [ ] 3.4 Start → timer counts up; Stop → completion sheet opens and saves entry
- [ ] 3.5 Crash-recovery modal works after force-close with active sleep
- [ ] 3.6 Partner sync: sleep logged on device A appears on device B within ~5 seconds
- [ ] 3.7 Either partner can delete or time-edit any entry
- [ ] 3.8 No regressions on Contractions, Feeding, or Partner tabs
