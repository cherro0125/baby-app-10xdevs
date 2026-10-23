# Feeding Edit Details Implementation Plan

## Overview

Let users edit every field of an existing feeding — start/end time, milk type, amount and note — from one sheet, and make the feeding sync identity-stable so those edits update the same record on the server and on the partner's device instead of creating copies. Reported during `language-switch` manual testing: "Jak edytuję aktualnie istniejące karmienia to mogę tylko edytować czas. Nie mogę edytować typu karmienia ani notatek."

## Current State Analysis

- **Edit is times-only.** `useFeedings().edit` (`src/hooks/use-feedings.ts:287`) takes `{ startedAt?, endedAt? }`. Own rows: local `UPDATE` of times + `synced = 0`. Partner rows: direct `PATCH /api/feedings/{id}` with times only. Tapping a row opens `FeedingTimeEditSheet` (`src/components/feeding-time-edit-sheet.tsx`, times only). Milk type / amount / note are set once, in `FeedingCompletionSheet` (`src/components/feeding-completion-sheet.tsx`).
- **Backend PATCH already accepts details but cannot clear them.** `UpdateFeedingRequest` (`backend/.../feeding/FeedingController.kt:30-36`) has `milkType`, `amountMl`, `note`, but `FeedingService.update` (`FeedingService.kt:63-65`) treats `null` as "no change" — an amount or note can never be removed.
- **Sync identity is broken for own feedings.** `start()` creates a local UUID; the upload (`use-feedings.ts:105-123`) `POST`s without an id, so the server assigns a different one (`Feeding.id` is `@GeneratedValue`, `Feeding.kt:22-23`). Consequences:
  - Editing an own feeding sets `synced = 0`, the next sync `POST`s again → a second server row; the partner sees two feedings and the stale one never goes away.
  - The download (`use-feedings.ts:73-85`) inserts own server rows "if new" by server id, which never matches the local id → own feedings can duplicate locally.
  - Own server rows never overwrite local ones, so a partner's edit of *my* feeding is invisible to me and my next edit silently overwrites it.
  - Same pattern exists in contractions (`use-contractions.ts:85-139`) and is being copied by `sleep-log` (in progress). The archived `feeding-log` plan explicitly deferred "server-side UUID round-tripping" (`context/archive/2026-09-14-feeding-log/plan.md:37`).
- **Local schema has no versioning.** `runMigrations` (`src/db/schema.ts:9`) is a single `CREATE TABLE IF NOT EXISTS` block; no `PRAGMA user_version` is used anywhere.
- **The feeding list only shows completed feedings** (`feeding-list.tsx:19`), so the "active feeding" branch of `FeedingTimeEditSheet` is unreachable for feedings.
- **Save failures are silent.** `handleEditConfirm` (`feeding-log.tsx:79-86`) only `console.error`s; the sheet stays open with no feedback.

## Desired End State

- Tapping a feeding opens one **Edit feeding / Edytuj karmienie** sheet prefilled with start/end time, milk type, amount and note. Every field can be changed; amount and note can be cleared.
- Saving an own feeding updates it locally at once and, after sync, the same server record (no duplicates). Saving a partner's feeding updates the server record directly.
- A partner's edit of my feeding appears on my device within one sync (~5 s with a partner linked), unless I have an unsynced local edit of that feeding (then mine wins on upload — last write wins).
- If saving fails (e.g. partner feeding while offline), the sheet stays open with a translated error and the user can retry.
- After updating the app, previously synced feedings are re-downloaded once so local ids match server ids; feedings that were never synced are uploaded with their local id.
- All new strings are in `en.ts` and `pl.ts`; `npm test`, `npx tsc --noEmit`, `npm run lint` and `./gradlew test` pass.

Verify: automated suites above, then the manual steps in Testing Strategy on the iPhone with two linked accounts.

### Key Discoveries:

- `FeedingService.update` already does owner-or-partner authorisation and server-side `durationMinutes` (`FeedingService.kt:52-67`) — the new upsert reuses the same rules.
- `Feeding.id` already defaults to `UUID.randomUUID()` (`Feeding.kt:24`); dropping `@GeneratedValue` keeps `POST` working while letting the client supply ids. With an assigned id Spring Data `save` does a merge (one extra `SELECT`), which is acceptable at this volume.
- `GlobalExceptionHandler` already maps `FeedingNotFoundException` → 404 and `IllegalArgumentException` → 400 (`config/GlobalExceptionHandler.kt:45,85`).
- `FeedingServiceTest` uses Mockito with `feedingRepository.save` answering its argument (`FeedingServiceTest.kt:48-49`) — new tests follow it.
- `FeedingCompletionSheet` already holds the milk-type segmented control, amount and note inputs (`feeding-completion-sheet.tsx:50-89`) — extract them rather than duplicate.
- Jest runs `src/**/__tests__`; the hardcoded-string guard skips `__tests__` and scans only `.tsx` (`src/__tests__/no-hardcoded-strings.test.ts:16-21`).
- Lessons: every user-visible string via `t()` with EN + PL keys and `src/i18n/format.ts` for times; typed routes (not relevant — no navigation changes).

## What We're NOT Doing

- Fixing the same sync-identity bug for **contractions** (and not touching `time-edit-sheet.tsx`) — separate change if wanted.
- Editing the `sleep-log` plan or code; only a note is added to its `change.md`.
- Removing `POST /api/feedings` or `PATCH /api/feedings/{id}` — they stay for compatibility; the app stops calling them.
- Cleaning up duplicate feedings already on the server from past edits.
- Offline queueing of edits to a **partner's** feeding — still online-only, now with a visible error.
- Editing an **active** (running) feeding from the list, or changing the feeding's date (times stay on the original day, with the existing midnight-crossing rule).
- Syncing deletions of own feedings to the server (pre-existing gap, unchanged).

## Implementation Approach

Make the client UUID the feeding's identity everywhere and replace the create-then-patch split with one idempotent, full-replacement endpoint: `PUT /api/feedings/{id}`. Full replacement gives "clear amount/note" for free (`null` means empty, not "unchanged"), makes re-uploading an edited feeding update the same row, and makes retries after a lost response safe. The client uses `PUT` for both own-feeding upload and partner-feeding edits. The download treats the server as the source of truth for any row without pending local changes. A one-time local reconciliation (guarded by `PRAGMA user_version`) drops previously synced rows so the next sync re-downloads them under their server ids. The UI merges the time sheet and the details form into one edit sheet, with the details form shared with the completion sheet.

Order: backend first (the client depends on `PUT`), then the data layer, then the UI.

## Critical Implementation Details

- **Shared edit contract.** Phases 2 and 3 meet at a full-replacement edit object; `edit()` sends every field so the hook never merges partial patches:

  ```ts
  export interface FeedingEdit {
    startedAt: Date;
    endedAt: Date;
    milkType: MilkType;
    amountMl: number | null; // null = no amount
    note: string | null;     // null = no note
  }
  ```

- **Upload race.** Mark a row synced only if it hasn't changed since it was read for upload (`UPDATE feedings SET synced = 1 WHERE id = ? AND updated_at = ?`); otherwise an edit made while the `PUT` is in flight would be marked synced and never uploaded.
- **Reconciliation ordering.** The one-time `DELETE FROM feedings WHERE synced = 1` must run before the first sync after the update and only once (`PRAGMA user_version` bumped in the same step). It deletes partner rows too — they are re-downloaded by the same sync. If the device is offline at that moment, the list shows only unsynced feedings until the next successful sync.
- **`PRAGMA user_version` is shared app-wide.** This change claims version `1`. `sleep-log` (in progress) must bump past it if it adds its own local migration — recorded in its `change.md`.

## Phase 1: Backend — idempotent feeding upsert

### Overview

Add `PUT /api/feedings/{id}` that creates a feeding with a client-supplied UUID or fully replaces an existing one, with the same owner-or-partner access rule as `update`/`delete`.

### Changes Required:

#### 1. Client-assignable feeding id

**File**: `backend/src/main/kotlin/com/babytrack/feeding/Feeding.kt`

**Intent**: Let the service persist a feeding under an id chosen by the client.

**Contract**: Remove `@GeneratedValue` from `Feeding.id`; keep `val id: UUID = UUID.randomUUID()` so `create` (POST) still gets a fresh id. No schema change (`id` already has `DEFAULT gen_random_uuid()` but is always set by the app).

#### 2. Upsert service method

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt`

**Intent**: One transactional operation that creates or fully replaces a feeding.

**Contract**: `fun upsert(id: UUID, requesterId: UUID, startedAt: Instant, endedAt: Instant, milkType: MilkType, amountMl: Int?, note: String?): UpsertResult` where `data class UpsertResult(val feeding: Feeding, val created: Boolean)`.
- Validates `endedAt.isAfter(startedAt)` (`IllegalArgumentException` → 400).
- Id not found → create owned by `requesterId` (same fields and server-derived `durationMinutes` as `create`), `created = true`.
- Id found and owner is requester or requester's partner → overwrite `startedAt`, `endedAt`, `milkType`, `amountMl`, `note` (null clears), recompute `durationMinutes`, bump `updatedAt`, `created = false`. Ownership (`userId`) never changes.
- Id found but owned by someone else → `FeedingNotFoundException` (404), same as `update`/`delete`.

#### 3. PUT endpoint

**File**: `backend/src/main/kotlin/com/babytrack/feeding/FeedingController.kt`

**Intent**: Expose the upsert.

**Contract**: `PUT /api/feedings/{id}` with body `UpsertFeedingRequest(startedAt: Instant, endedAt: Instant, milkType: MilkType, @Positive amountMl: Int?, @Size(max = 2000) note: String?)` — all of `startedAt`, `endedAt`, `milkType` required (`@NotNull`, like `CreateFeedingRequest`). Responds `201` with `FeedingDto` when created, `200` when replaced. Existing `POST`, `PATCH`, `GET`, `DELETE` unchanged.

#### 4. Service tests

**File**: `backend/src/test/kotlin/com/babytrack/feeding/FeedingServiceTest.kt`

**Intent**: Cover the upsert contract.

**Contract**: New tests in the existing Mockito style:
- upsert on unknown id creates with that id, requester as owner, derived duration, `created = true`;
- upsert by owner replaces all fields and clears `amountMl` / `note` when null, `created = false`;
- upsert by partner succeeds and keeps the original owner;
- upsert by non-partner on an existing id throws `FeedingNotFoundException`;
- upsert with `endedAt` not after `startedAt` throws `IllegalArgumentException`.

### Success Criteria:

#### Automated Verification:

- Backend tests pass: `cd backend && ./gradlew test`
- Backend compiles and starts in dev profile: `cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'` (restart the running instance)

#### Manual Verification:

- `PUT /api/feedings/{new uuid}` with a valid token returns 201 and the row exists with that id; repeating the same request returns 200 and no second row appears (curl against the dev backend)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Frontend — identity-stable feeding sync and full edit

### Overview

Upload own feedings with their local id via `PUT`, let the server win for rows without local changes, reconcile existing data once, and widen `edit()` to the full `FeedingEdit`.

### Changes Required:

#### 1. One-time local reconciliation

**File**: `src/db/schema.ts`

**Intent**: Drop previously synced feedings once so they are re-downloaded under server ids, removing local duplicates and id mismatches.

**Contract**: After the `CREATE TABLE IF NOT EXISTS` block, read `PRAGMA user_version`; if `< 1`, run `DELETE FROM feedings WHERE synced = 1` and set `PRAGMA user_version = 1`. Unsynced rows (`synced = 0`) and contractions are untouched.

#### 2. Feeding sync and edit

**File**: `src/hooks/use-feedings.ts`

**Intent**: Make the local id the feeding's identity on the server and support editing all fields.

**Contract**:
- Upload: for each own `synced = 0 AND ended_at IS NOT NULL` row, `PUT /api/feedings/{row.id}` with `{ startedAt, endedAt, milkType, amountMl, note }`; on success mark synced only if `updated_at` is unchanged (see Critical Implementation Details).
- Download: partner rows unchanged (`INSERT OR REPLACE`, `synced = 1`). Own rows: skip if a local row with that id has `synced = 0`; otherwise `INSERT OR REPLACE` with `synced = 1` (server wins).
- `edit(id: string, changes: FeedingEdit): Promise<void>` replaces the times-only signature (`UseFeedingsResult.edit` updated). Validates `endedAt > startedAt` (throws). Own row → local `UPDATE` of `started_at`, `ended_at`, `milk_type`, `amount_ml`, `note`, recomputed `duration_minutes`, `updated_at`, `synced = 0`. Partner row → `PUT /api/feedings/{id}` with all fields, throw on non-OK, then write the returned `FeedingDto` fields into the local row.
- `FeedingEdit` exported from `src/components/feeding-edit.ts` (item 3) and imported here.

#### 3. Pure edit helpers

**File**: `src/components/feeding-edit.ts` (new)

**Intent**: Keep the form-to-edit logic testable outside React and SQLite.

**Contract**:
- `export interface FeedingEdit` (shape in Critical Implementation Details).
- `parseAmountMl(text: string): number | null | 'invalid'` — trimmed empty → `null`; positive integer of digits → number; anything else (zero, decimals, letters) → `'invalid'`.
- `buildEditTimes(feeding: { startedAt: string; endedAt: string }, start: { h: number; m: number }, end: { h: number; m: number }): { startedAt: Date; endedAt: Date } | 'endBeforeStart'` — moves the existing rule from `feeding-time-edit-sheet.tsx:54-79`: hours/minutes applied on the original days, end advanced one day if it falls before start (feedings < 24 h), `'endBeforeStart'` if still not after start.

#### 4. Helper tests

**File**: `src/components/__tests__/feeding-edit.test.ts` (new)

**Intent**: Lock the parsing and time rules.

**Contract**: Cases for `parseAmountMl` (`''`, `'  '`, `'120'`, `' 90 '`, `'0'`, `'12.5'`, `'abc'`) and `buildEditTimes` (same-day edit, midnight crossing, end equal to start → `'endBeforeStart'`).

### Success Criteria:

#### Automated Verification:

- Jest passes: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Lint passes with no new warnings: `npm run lint`

#### Manual Verification:

- After reloading the app, the feeding list shows each feeding once, and the dev database (`select count(*) from feedings`) does not grow on further reloads
- A new feeding logged on the iPhone appears on the server with the same id as locally (no second row after the next sync)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI — single feeding edit sheet

### Overview

Replace the times-only sheet with one edit sheet for times and details, share the details form with the completion sheet, and show save errors.

### Changes Required:

#### 1. Shared details fields

**File**: `src/components/feeding-details-fields.tsx` (new)

**Intent**: One component for milk type, amount and note, used by both sheets.

**Contract**: Controlled props `{ milkType: MilkType; onMilkTypeChange; amountText: string; onAmountTextChange; note: string; onNoteChange }`. Renders the segmented control (`MILK_TYPES`, `feeding.milkType.*`, `numberOfLines={1} adjustsFontSizeToFit`), amount input (`feeding.amountPlaceholder`, numeric keyboard) and multiline note (`common.addNote`) exactly as today's completion sheet.

#### 2. Completion sheet uses shared fields

**File**: `src/components/feeding-completion-sheet.tsx`

**Intent**: Remove the duplicated form markup; behaviour unchanged.

**Contract**: Same props and save/cancel/reset behaviour; amount parsed with `parseAmountMl`, and `'invalid'` shows the `feeding.edit.invalidAmount` error instead of silently saving `null`.

#### 3. Edit sheet

**File**: `src/components/feeding-edit-sheet.tsx` (new, replaces `src/components/feeding-time-edit-sheet.tsx`, which is deleted)

**Intent**: Edit all fields of a completed feeding in one place.

**Contract**:
- Props `{ feeding: LocalFeeding | null; onClose: () => void; onSave: (id: string, changes: FeedingEdit) => Promise<void> }`; `Modal` wrapper + keyed inner component as in today's sheet; wrapped in `KeyboardAvoidingView` like the completion sheet so the note stays visible.
- Title `feeding.edit.title`. Start and End `TimeRow` steppers (moved from the old sheet) prefilled from the feeding, then `FeedingDetailsFields` prefilled with `milkType` (falls back to `BREAST` if null), amount and note.
- Save: `buildEditTimes` (`'endBeforeStart'` → `timeEdit.endAfterStart`), `parseAmountMl` (`'invalid'` → `feeding.edit.invalidAmount`), empty note → `null`, then `await onSave`. While saving, the Save button is disabled. If `onSave` rejects, keep the sheet open and show `feeding.edit.saveFailed`. Errors are stored as keys/flags and translated at render.

#### 4. Screen wiring

**File**: `src/app/(app)/feeding-log.tsx`

**Intent**: Use the new sheet and surface failures.

**Contract**: `FeedingEditSheet` replaces `FeedingTimeEditSheet`; `handleEditSave(id, changes)` awaits `edit(id, changes)`, closes on success and rethrows on failure so the sheet can show the error (still `console.error`s).

#### 5. Translations

**Files**: `src/i18n/locales/en.ts`, `src/i18n/locales/pl.ts`

**Intent**: New strings in both languages.

**Contract**: `feeding.edit.title` ("Edit feeding" / "Edytuj karmienie"), `feeding.edit.saveFailed` ("Couldn't save changes. Try again." / "Nie udało się zapisać zmian. Spróbuj ponownie."), `feeding.edit.invalidAmount` ("Enter the amount as a whole number of ml" / "Podaj ilość jako liczbę całkowitą ml"). Reuse `timeEdit.endAfterStart`, `common.start|end|cancel|save`.

### Success Criteria:

#### Automated Verification:

- Jest passes, including key parity and the hardcoded-string guard: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Lint passes with no new warnings: `npm run lint`
- Old sheet is gone: `test ! -f src/components/feeding-time-edit-sheet.tsx`

#### Manual Verification:

- Tapping a feeding opens the edit sheet prefilled with its times, milk type, amount and note
- Changing milk type, amount and note and saving updates the row (badge, amount, note) immediately
- Clearing amount and note removes them from the row, also after an app reload
- End before start shows the translated error; a non-numeric amount shows the amount error; nothing is saved
- With a linked partner: editing my feeding shows the change on the partner's device within ~5 s as one row; editing the partner's feeding updates it on both devices
- Editing a partner's feeding in airplane mode shows the save-failed error and the sheet stays open
- Completion sheet after Stop still works as before
- All new texts appear correctly in both English and Polish

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Backend `FeedingServiceTest`: upsert create/replace/clear/partner/stranger/invalid times.
- Jest `feeding-edit.test.ts`: `parseAmountMl` and `buildEditTimes` incl. midnight crossing.
- Existing guards: locale key parity and hardcoded-string test cover the new UI strings.

### Integration Tests:

- None automated; `useFeedings` sync (SQLite + API) is verified manually, as in earlier feeding work.

### Manual Testing Steps:

1. Reload the app after updating: each feeding appears once; server count stays stable across reloads.
2. Log a feeding, wait for sync, edit its milk type / amount / note: local row updates at once; server row with the same id changes; no new server row.
3. Clear amount and note, save, reload: both stay empty.
4. With two linked accounts: edit my feeding on device A → device B shows the change in ~5 s; edit A's feeding on device B → A shows it after its next sync.
5. Airplane mode: edit own feeding (saves locally, uploads when back online); edit partner's feeding (error shown, sheet stays open).
6. Switch language to Polish and repeat one edit to check texts.

## Performance Considerations

Download now writes every own row on each sync (`INSERT OR REPLACE`) instead of only new ones — at most 200 rows every 5 s with a partner, same order as partner rows today. Server upsert adds one `SELECT` per uploaded feeding. Both negligible.

## Migration Notes

- No Flyway migration: the `feedings` table already fits.
- Local: `PRAGMA user_version` 0 → 1 runs the one-time `DELETE FROM feedings WHERE synced = 1`; synced data is restored from the server on the next successful sync.
- Feedings created before this change keep their server-generated ids; server duplicates from earlier edits are not removed.
- Old app builds keep using `POST`/`PATCH`, which still work.

## References

- Change notes: `context/changes/feeding-edit-details/change.md`
- Original feeding slice: `context/archive/2026-09-14-feeding-log/plan.md`
- Final review that deferred this (F5, F10): `context/archive/2026-10-20-language-switch/reviews/impl-review.md`
- Current edit path: `src/hooks/use-feedings.ts:287`, `src/components/feeding-time-edit-sheet.tsx`
- Backend: `backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt:43-68`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — idempotent feeding upsert

#### Automated

- [x] 1.1 Backend tests pass: `cd backend && ./gradlew test` — 0d10e42
- [x] 1.2 Backend compiles and starts in dev profile — 0d10e42

#### Manual

- [x] 1.3 PUT on a new uuid returns 201 with that id; repeating returns 200 with no second row — 0d10e42

### Phase 2: Frontend — identity-stable feeding sync and full edit

#### Automated

- [x] 2.1 Jest passes: `npm test` — 91fc688
- [x] 2.2 Type checking passes: `npx tsc --noEmit` — 91fc688
- [x] 2.3 Lint passes with no new warnings: `npm run lint` — 91fc688

#### Manual

- [x] 2.4 After reload each feeding appears once and the server count does not grow — 91fc688
- [x] 2.5 A new feeding appears on the server with the same id as locally — 91fc688

### Phase 3: UI — single feeding edit sheet

#### Automated

- [x] 3.1 Jest passes, including key parity and the hardcoded-string guard: `npm test` — fc83cff
- [x] 3.2 Type checking passes: `npx tsc --noEmit` — fc83cff
- [x] 3.3 Lint passes with no new warnings: `npm run lint` — fc83cff
- [x] 3.4 Old sheet is gone: `test ! -f src/components/feeding-time-edit-sheet.tsx` — fc83cff

#### Manual

- [x] 3.5 Edit sheet opens prefilled with times, milk type, amount and note — fc83cff
- [x] 3.6 Changing milk type, amount and note updates the row immediately — fc83cff
- [x] 3.7 Clearing amount and note persists after reload — fc83cff
- [x] 3.8 End-before-start and invalid amount show translated errors and save nothing — fc83cff
- [x] 3.9 Partner sync: edits appear on the other device within ~5 s as one row, both directions — fc83cff
- [x] 3.10 Editing a partner's feeding offline shows the save-failed error and keeps the sheet open — fc83cff
- [x] 3.11 Completion sheet after Stop still works as before — fc83cff
- [x] 3.12 New texts correct in English and Polish — fc83cff
