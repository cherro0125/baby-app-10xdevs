# Plan: Contraction Tracking (S-03)

- **Change ID**: contraction-tracking
- **Status**: planned
- **Created**: 2026-09-11

## Overview

Full implementation of S-03 contraction tracking: backend REST API, local SQLite persistence, timer UI, history list with delete, manual time entry, crash recovery, and the 5-1-1 signal banner. All 7 FRs delivered in one change.

## What We're NOT Doing

- Backend 5-1-1 computation (S-04)
- Partner-sharing / multi-user (S-05)
- Push notifications
- Export / PDF report
- Anything to the Google auth flow

---

## Decisions Locked

1. **Scope**: Full S-03 (all 7 FRs + 5-1-1 rule) in one change
2. **Offline persistence**: `expo-sqlite` (`expo-sqlite/next`)
3. **Navigation**: Contractions replaces Home tab; Explore removed entirely
4. **Backend API**: Single resource — `POST /api/contractions` (startedAt, endedAt null), `PATCH /api/contractions/{id}` (sets endedAt), `GET /api/contractions`, `DELETE /api/contractions/{id}`
5. **5-1-1 computation**: Frontend only for S-03
6. **Crash recovery**: "Incomplete contraction" prompt on launch when an endedAt=null row exists in SQLite
7. **Strength scale**: 1-10 numeric
8. **Manual time entry**: Native DateTimePicker (from `@react-native-community/datetimepicker`)
9. **Delete UX**: Swipe-to-delete with second-tap confirmation (Reanimated + Gesture Handler)
10. **Explore tab**: Removed entirely
11. **5-1-1 signal**: Persistent status banner at top of log screen; "May be time to go to the hospital" copy when threshold met
12. **History display**: Compact rows — timestamp, duration, gap to previous, strength inline
13. **Offline saves**: SQLite-first + background sync queue designed for S-04 reuse

---

## Phase 1: Backend API

### Overview

Add V2 Flyway migration and the full `/api/contractions` REST resource: `Contraction` entity, repository, service, controller. Four endpoints. JWT-authenticated (falls through Spring Security's `.anyRequest().authenticated()` gate already in place).

### Changes Required

**New files**

- `backend/src/main/resources/db/migration/V2__create_contractions.sql`
  - Table `contractions`: `id UUID PK`, `user_id UUID FK→users.id NOT NULL`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ`, `duration_seconds INT` (computed at finalize), `strength INT`, `note TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
  - Index on `(user_id, started_at DESC)`

- `backend/src/main/kotlin/com/babytrack/contraction/Contraction.kt`
  - JPA `@Entity` mirroring the schema; `@ManyToOne(fetch = FetchType.LAZY)` to `User`
  - Follow the `User.kt` pattern: `@Column` names match snake_case DB names, `Instant` for timestamps

- `backend/src/main/kotlin/com/babytrack/contraction/ContractionRepository.kt`
  - `JpaRepository<Contraction, UUID>` + `findAllByUserIdOrderByStartedAtDesc`

- `backend/src/main/kotlin/com/babytrack/contraction/ContractionService.kt`
  - `start(userId, startedAt): Contraction` — creates with `endedAt = null`
  - `finalize(id, userId, endedAt): Contraction` — verifies ownership, sets `endedAt`, computes `durationSeconds = ChronoUnit.SECONDS.between(startedAt, endedAt)`; throws `ContractionNotFoundException` if not found or wrong owner
  - `list(userId): List<Contraction>` — delegates to repo
  - `delete(id, userId)` — verifies ownership; throws `ContractionNotFoundException` if not found or wrong owner

- `backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt`
  - `@RestController @RequestMapping("/api/contractions")`
  - Extract `AuthenticatedUser` from `SecurityContextHolder` (same pattern as `AuthController`)
  - `POST /` — body: `{ startedAt: ISO-8601 string }` → 201 Created + `ContractionDto`
  - `PATCH /{id}` — body: `{ endedAt: ISO-8601 string }` → 200 OK + `ContractionDto`
  - `GET /` — 200 OK + `List<ContractionDto>`
  - `DELETE /{id}` — 204 No Content
  - DTOs: `ContractionDto(id, userId, startedAt, endedAt, durationSeconds, strength, note, createdAt)`

- `backend/src/main/kotlin/com/babytrack/contraction/ContractionException.kt`
  - `class ContractionNotFoundException(message: String) : RuntimeException(message)`

**Modified files**

- `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`
  - Add `@ExceptionHandler(ContractionNotFoundException::class)` → 404 ProblemDetail; follow the existing pattern

### Success Criteria

**Automated**
- `./gradlew bootRun` starts without error
- `POST /api/contractions` with a valid JWT returns 201 with `endedAt: null`
- `PATCH /api/contractions/{id}` returns 200 with `endedAt` and `durationSeconds` set
- `GET /api/contractions` returns the user's contractions in descending order
- `DELETE /api/contractions/{id}` returns 204
- `PATCH`/`DELETE` with another user's ID returns 404

**Manual**
- Flyway V2 migration applied cleanly (check logs on startup)
- Confirm the `contractions` table exists in the DB

---

## Phase 2: Local data layer

### Overview

Install `expo-sqlite`, create the SQLite schema, build the `useContractions` hook (the app's single source of truth for contraction data), and set up the background sync queue for later use in S-04.

### Changes Required

**Install**
- `npx expo install expo-sqlite` — adds `expo-sqlite` to `package.json` and `package-lock.json`

**New files**

- `src/db/schema.ts`
  - `openDatabase()` — opens `babytrack.db`
  - `runMigrations(db)` — runs `CREATE TABLE IF NOT EXISTS contractions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER, strength INTEGER, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0)`
  - `CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, operation TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`

- `src/db/types.ts`
  - `interface LocalContraction { id: string; userId: string; startedAt: string; endedAt: string | null; durationSeconds: number | null; strength: number | null; note: string | null; createdAt: string; updatedAt: string; synced: number }`
  - `interface SyncQueueItem { id: string; operation: 'CREATE' | 'FINALIZE' | 'DELETE'; payload: string; createdAt: string; attempts: number }`

- `src/hooks/use-contractions.ts`
  - Opens DB, runs migrations on mount
  - Returns: `{ contractions: LocalContraction[], activeContraction: LocalContraction | null, start, finalize, remove, isLoading }`
  - `start(startedAt: Date)` — inserts row with `ended_at = null`, `synced = 0`; enqueues `CREATE` to `sync_queue`
  - `finalize(id: string, endedAt: Date)` — updates row, computes `duration_seconds`; enqueues `FINALIZE`
  - `remove(id: string)` — deletes row; enqueues `DELETE`
  - `activeContraction` = first row where `ended_at IS NULL`
  - `contractions` = all rows ordered by `started_at DESC`
  - Sync is no-op in S-03 (queue items accumulate); S-04 will drain the queue

### Success Criteria

**Automated**
- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

**Manual**
- Dev build launched; SQLite DB initialised (no crash on startup)
- `start()` / `finalize()` / `remove()` calls produce the expected rows when inspected via the Expo SQLite plugin in the Expo dev tools

---

## Phase 3: Navigation + timer UI

### Overview

Replace the Home tab with Contractions, remove the Explore tab entirely, and build the timer screen: Start / Stop button, elapsed timer, strength picker (1-10), and note input.

### Changes Required

**Modified files**

- `src/components/app-tabs.tsx`
  - Remove the `<NativeTabs.Trigger name="explore">` block
  - Rename the `index` trigger label from "Home" to "Contractions"
  - Update icon `src` to a contraction/pulse icon from `@/assets/images/tabIcons/` (create `contractions.png` placeholder identical to `home.png` for now — can be replaced with a proper icon in S-04)

- `src/app/(app)/index.tsx`
  - Replace entirely with the Contractions screen shell:
    - Shows `<ContractionTimer />` (new component) and `<ContractionList />` (Phase 4) placeholder
    - Uses `useContractions()` from Phase 2
    - Reads `activeContraction` to determine timer state

- `src/app/(app)/explore.tsx` — **delete this file** (or replace contents with a redirect to `/`; since typed routes are active, deletion is safest if the file exists)

**New files**

- `src/components/contraction-timer.tsx`
  - Props: `{ active: LocalContraction | null; onStart: () => void; onStop: (endedAt: Date) => void }`
  - When `active === null`: large Start button; no strength/note inputs visible
  - When `active !== null`: elapsed time display (updates every second via `setInterval`), Stop button, strength slider (1-10 `<Slider>` from `@react-native-community/slider` or a row of 10 pressable pips), note `<TextInput>`
  - On Stop: calls `onStop(new Date())` with current time
  - Elapsed timer: `Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000)`
  - Uses `ThemedText`, `ThemedView`, `Colors`, `Spacing` from theme constants

### Success Criteria

**Automated**
- `npm run lint` passes
- TypeScript compiles

**Manual**
- Explore tab is gone from the tab bar
- Contractions tab shows the timer screen
- Tapping Start begins the timer; elapsed seconds count up
- Tapping Stop records the contraction in SQLite (verify via hook state)
- Strength input and note input are visible while timer is running

---

## Phase 4: History list + delete

### Overview

Render the list of past contractions below the timer with compact rows showing time, duration, gap, and strength. Swipe-to-delete with a second-tap confirmation.

### Changes Required

**New files**

- `src/components/contraction-list.tsx`
  - Props: `{ contractions: LocalContraction[]; onDelete: (id: string) => void }`
  - `<FlatList>` of `<ContractionRow>` items
  - `keyExtractor` = item id
  - Empty state: "No contractions recorded yet" centred text

- `src/components/contraction-row.tsx`
  - Displays: start time (localised via `toLocaleTimeString`), duration (formatted as `Xm Ys`), gap to previous contraction (passed as prop or computed in list), strength (if set)
  - Swipe-to-delete using `react-native-gesture-handler` `Swipeable` component (already a transitive dep via `expo-router`)
  - On swipe: reveals a red Delete action area
  - On tap Delete: shows an inline "Confirm delete?" row (second-tap confirmation — replaces the row in place; tapping again calls `onDelete`); tapping elsewhere cancels
  - Uses theme tokens throughout

**Modified files**

- `src/app/(app)/index.tsx`
  - Wire `<ContractionList>` below the timer; pass `contractions` and `remove` from `useContractions()`

### Success Criteria

**Automated**
- `npm run lint` passes
- TypeScript compiles

**Manual**
- Completed contractions appear in the list in descending order
- Each row shows time, duration, gap to previous, strength
- Swipe-left on a row reveals the Delete action
- Tapping Delete once shows confirmation; tapping again removes the row
- Tapping elsewhere on confirmation cancels

---

## Phase 5: Manual time entry + crash recovery

### Overview

Allow users to edit the start/end time of a contraction after recording. Show a prompt on app launch if an incomplete contraction (endedAt = null) was left from a previous session.

### Changes Required

**New files**

- `src/components/incomplete-contraction-modal.tsx`
  - Shown at the root of `src/app/(app)/index.tsx` when `activeContraction !== null` on initial mount (i.e., the app was killed mid-contraction)
  - Two actions: "Continue timing" (dismiss modal — timer resumes normally) and "End now" (calls `finalize(active.id, new Date())`)
  - Uses `Modal` from `react-native`

- `src/components/time-edit-sheet.tsx`
  - Bottom sheet (or simple modal) triggered by tapping a row's timestamp
  - Shows native `DateTimePicker` (`@react-native-community/datetimepicker` — already a transitive dep)
  - Separate pickers for start time and (if ended) end time
  - On confirm: calls `useContractions().edit(id, { startedAt?, endedAt? })`

**Modified files**

- `src/hooks/use-contractions.ts`
  - Add `edit(id: string, patch: { startedAt?: Date; endedAt?: Date })` — updates the local row and recomputes `durationSeconds` if both timestamps are present; enqueues `FINALIZE` with the updated times

- `src/app/(app)/index.tsx`
  - Mount `<IncompleteContractionModal>` when `activeContraction !== null` and the component just mounted (use a `isInitialMount` ref pattern)
  - Wire row tap → `<TimeEditSheet>`

### Success Criteria

**Automated**
- `npm run lint` passes
- TypeScript compiles

**Manual**
- Kill the app mid-contraction; relaunch → incomplete contraction modal appears
- "Continue timing" dismisses the modal and the timer resumes
- "End now" finalises and the row appears in the list
- Tap a row timestamp → date/time picker opens
- Adjust time → row updates with new time and recomputed duration

---

## Phase 6: 5-1-1 signal + E2E gate

### Overview

Implement the 5-1-1 detection algorithm on the frontend and show a persistent status banner. Run a full manual E2E verification of all 7 FRs. Sync the contractions to the backend (one-shot sync on load using the API from Phase 1).

### Changes Required

**New files**

- `src/utils/five-one-one.ts`
  - `computeFiveOneOne(contractions: LocalContraction[]): { status: 'idle' | 'tracking' | 'alert' }`
  - "alert" = at least one window of ≥3 contractions exists in a continuous sequence where each contraction lasted ≥60 s AND the gap between consecutive contractions was ≤5 min AND the window spans ≥1 hour
  - "tracking" = contractions are being recorded but threshold not yet met
  - "idle" = no contractions today

- `src/components/five-one-one-banner.tsx`
  - Always visible at the top of the contractions screen
  - "idle": subtle grey chip — "No contractions yet"
  - "tracking": neutral chip — "Contractions recorded — keep timing"
  - "alert": prominent pink/red banner — "Pattern detected — may be time to go to the hospital"
  - Uses theme tokens; no hardcoded colors

**Modified files**

- `src/app/(app)/index.tsx`
  - Mount `<FiveOneOneBanner>` above the timer
  - Pass `computeFiveOneOne(contractions)` result as prop

- `src/hooks/use-contractions.ts`
  - Add a one-shot backend sync on mount: fetch `GET /api/contractions` using `createApiClient` and merge with local SQLite (server rows not in local DB are inserted; local `synced=0` rows are POSTed/PATCHed). This is best-effort — errors are silently swallowed; the local view is always authoritative.

### Success Criteria

**Automated**
- `npm run lint` passes
- TypeScript compiles

**Manual — full FR verification**
- FR-1: Start a contraction → timer counts up
- FR-2: Stop a contraction → duration computed and displayed
- FR-3: Strength (1-10) saved and shown in row
- FR-4: Note saved and shown in row (tap to expand or inline)
- FR-5: Manual time edit works via datetime picker
- FR-6: Delete via swipe + confirm works
- FR-7: 5-1-1 banner shows "alert" copy when threshold met (create 3+ contractions ≥1 min long with ≤5 min gaps spanning ≥1 hour, or mock the computation with a test fixture)
- Backend sync: contractions appear in the DB after the app sync

---

## Progress

### Phase 1: Backend API

#### Automated
- [x] 1.1 V2 migration applied cleanly — a600fd9
- [x] 1.2 POST /api/contractions → 201 — a600fd9
- [x] 1.3 PATCH /api/contractions/{id} → 200 with durationSeconds — a600fd9
- [x] 1.4 GET /api/contractions → ordered list — a600fd9
- [x] 1.5 DELETE /api/contractions/{id} → 204 — a600fd9
- [x] 1.6 PATCH/DELETE with wrong owner → 404 — a600fd9

#### Manual
- [x] 1.7 Flyway V2 migration visible in startup logs — a600fd9
- [x] 1.8 `contractions` table exists in DB — a600fd9

### Phase 2: Local data layer

#### Automated
- [x] 2.1 npm run lint passes — d114cc0
- [x] 2.2 TypeScript compiles — d114cc0

#### Manual
- [x] 2.3 Dev build starts without crash — d114cc0
- [x] 2.4 start/finalize/remove produce correct SQLite rows — d114cc0

### Phase 3: Navigation + timer UI

#### Automated
- [x] 3.1 npm run lint passes
- [x] 3.2 TypeScript compiles

#### Manual
- [x] 3.3 Explore tab removed
- [x] 3.4 Contractions tab shows timer screen
- [x] 3.5 Start begins timer; Stop records contraction

### Phase 4: History list + delete

#### Automated
- [x] 4.1 npm run lint passes
- [x] 4.2 TypeScript compiles

#### Manual
- [ ] 4.3 Contractions appear in descending order
- [ ] 4.4 Row shows time, duration, gap, strength
- [ ] 4.5 Swipe-to-delete + confirm works

### Phase 5: Manual time entry + crash recovery

#### Automated
- [ ] 5.1 npm run lint passes
- [ ] 5.2 TypeScript compiles

#### Manual
- [ ] 5.3 Incomplete contraction modal appears on relaunch
- [ ] 5.4 Continue / End now actions work correctly
- [ ] 5.5 Row timestamp tap opens datetime picker
- [ ] 5.6 Time edit updates row with recomputed duration

### Phase 6: 5-1-1 signal + E2E gate

#### Automated
- [ ] 6.1 npm run lint passes
- [ ] 6.2 TypeScript compiles

#### Manual
- [ ] 6.3 FR-1: timer starts
- [ ] 6.4 FR-2: duration recorded on stop
- [ ] 6.5 FR-3: strength saved and shown
- [ ] 6.6 FR-4: note saved and shown
- [ ] 6.7 FR-5: manual time edit works
- [ ] 6.8 FR-6: swipe-to-delete + confirm works
- [ ] 6.9 FR-7: 5-1-1 banner shows alert copy when threshold met
- [ ] 6.10 Backend sync: contractions appear in DB
