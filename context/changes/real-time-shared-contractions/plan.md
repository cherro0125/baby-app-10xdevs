# Real-time Shared Contractions Implementation Plan

## Overview

Add a shared, real-time contraction log for linked partners. When one partner logs a contraction,
the other's screen updates within ~5 seconds via polling. Each row shows who logged it ("You" vs
partner's name). Either partner can edit or delete any entry.

This is the S-04 north-star slice: the first moment the product's core thesis is verifiable.

## Current State Analysis

- `ContractionService.list(userId)` returns only the caller's contractions — no partner awareness.
- `finalize()` and `delete()` both filter `it.user.id == userId`, blocking partner mutations.
- `ContractionDto` already carries `userId` — attribution data is present but unused in the UI.
- `useContractions` performs a one-shot sync on mount; no polling loop exists.
- Local SQLite already has `user_id` per row — partner entries can be stored alongside own ones.
  The `loadContractions` query currently filters to `WHERE user_id = ?`; this must change.
- `edit()` and `remove()` check `AND user_id = ?` in local SQL — they silently ignore partner rows.
- `PartnerLinkRepository.findByUserAIdOrUserBId()` is the right primitive to resolve the partner ID.
- `usePartner` already fetches and caches partner name/email — no new API call needed for attribution.
- `computeFiveOneOne()` accepts any `LocalContraction[]`, so running it over the merged list is a
  zero-code-change consequence of merging.

## Desired End State

- `GET /api/contractions/shared` returns the top 200 contractions across both linked partners,
  ordered by `startedAt DESC`. If the caller has no partner, it returns only their own entries.
- `PATCH /api/contractions/{id}` accepts an optional `startedAt` alongside `endedAt`, allows
  already-finalized updates, and permits the request if the caller is the owner OR their partner.
- `DELETE /api/contractions/{id}` permits the request if the caller is the owner OR their partner.
- `useContractions` polls `/api/contractions/shared` every 5 seconds when a partner is linked.
  Partner rows are upserted (INSERT OR REPLACE); own rows use INSERT-if-new to preserve local
  unsynced state.
- Editing or deleting a partner's entry goes directly to the server (online-only, no sync queue).
  A failure surfaces an inline error.
- `ContractionList` shows a "You" / partner-name label per row. The 5-1-1 banner computes over the
  combined list. Solo users (no partner) see no behavior change.

### Key Discoveries

- `ContractionRepository` can use Spring Data's `In` keyword:
  `findTop200ByUserIdInOrderByStartedAtDesc(userIds: Collection<UUID>)` — no custom `@Query` needed.
- The early-return guard `if (contraction.endedAt != null) return contraction` in `finalize()` must
  be removed so that already-finalized entries can have their times edited (required for partner edits).
- The sync download logic currently uses INSERT-if-not-exists for all rows. For partner rows the
  correct strategy is INSERT OR REPLACE (always take server version). For own rows, keep INSERT-if-new
  to preserve locally unsynced edits. The distinction is `row.userId !== myUserId`.
- `createApiClient` pattern: `createApiClient(() => sessionRef.current, () => signOutRef.current())`.
  Follow this for direct API calls in `edit()`/`remove()`.

## What We're NOT Doing

- No push notifications (partner background notifications) — deferred to a future slice.
- No stale-data indicator — silent degradation on poll failure.
- No `strength`/`note` editing via PATCH — `TimeEditSheet` edits times only; strength/note are
  set at finalize time and are out of scope here.
- No polling for solo users (no partner linked).
- No sync-queue support for partner entry mutations — they are online-only.
- No simultaneous-active-contraction block — both partners may have an in-progress entry at once.
- No local SQLite schema changes — existing columns are sufficient.

## Implementation Approach

Three phases:
1. **Backend** — new shared endpoint, authz widening, PATCH expansion.
2. **Frontend data layer** — polling, shared sync with per-owner upsert strategy, edit/delete for
   partner entries.
3. **Frontend UI** — attribution label in contraction rows, wiring `usePartner` into the screen.

---

## Phase 1: Backend — shared feed, authz widening, PATCH expansion

### Overview

Add `GET /api/contractions/shared`, widen PATCH and DELETE to allow the linked partner, and expand
PATCH to optionally accept `startedAt` and to allow editing already-finalized entries.

### Changes Required

#### 1. `ContractionRepository.kt` — add shared-query method

**File**: `backend/src/main/kotlin/com/babytrack/contraction/ContractionRepository.kt`

**Intent**: Add a Spring Data method that returns the top 200 contractions across any set of user IDs, ordered by `startedAt` descending. Used by the shared-feed service method.

**Contract**: New method `findTop200ByUserIdInOrderByStartedAtDesc(userIds: Collection<UUID>): List<Contraction>` added to the repository interface. Spring Data's `In` keyword handles the `IN (...)` clause.

---

#### 2. `PartnerService.kt` — expose partner-ID lookup

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt`

**Intent**: Add a public method `getPartnerId(userId: UUID): UUID?` so `ContractionService` can resolve the caller's partner without duplicating the link-lookup logic.

**Contract**: New `@Transactional(readOnly = true)` method. Calls `partnerLinkRepository.findByUserAIdOrUserBId(userId, userId)` and returns the other side of the link, or `null` if no partner.

---

#### 3. `ContractionService.kt` — inject PartnerService, add `listShared`, widen `update`/`delete`

**File**: `backend/src/main/kotlin/com/babytrack/contraction/ContractionService.kt`

**Intent**: Add three capabilities:
- `listShared(userId)` — returns merged top-200 contractions for the caller and their partner.
- `update(id, requesterId, startedAt?, endedAt)` — replaces `finalize()`: applies time edits to any contraction owned by the requester or their partner; no early-return if already finalized.
- Widen `delete(id, userId)` — allow delete if contraction belongs to the caller OR their partner.

**Contract**:
- Constructor gains `private val partnerService: PartnerService`.
- `listShared(userId: UUID): List<Contraction>` — calls `partnerService.getPartnerId(userId)`. If a partner exists, calls `findTop200ByUserIdInOrderByStartedAtDesc(listOf(userId, partnerId))`; otherwise falls back to `findTop200ByUserIdOrderByStartedAtDesc(userId)`.
- `update(id: UUID, requesterId: UUID, startedAt: Instant?, endedAt: Instant): Contraction` — authz: `contraction.userId == requesterId || contraction.userId == partnerService.getPartnerId(requesterId)`. Applies `endedAt` (always), applies `startedAt` if non-null, recomputes `durationSeconds`, sets `updatedAt`. Validates `endedAt.isAfter(effectiveStartedAt)`.
- `delete(id: UUID, userId: UUID)` — same authz pattern as `update`.
- Remove the original `finalize()` method (callers in controller updated in next change).

---

#### 4. `ContractionController.kt` — new endpoint + updated PATCH + request type

**File**: `backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt`

**Intent**: Wire the three new service methods into HTTP endpoints and update the request DTO.

**Contract**:
- Replace `FinalizeContractionRequest` with `UpdateContractionRequest(val startedAt: Instant?, @field:NotNull val endedAt: Instant)`.
- Rename the `@PatchMapping("/{id}")` handler to `update`; call `contractionService.update(id, user.id, request.startedAt, request.endedAt)`. Return `200 OK` with the DTO.
- Add `@GetMapping("/shared")` handler `shared()`: calls `contractionService.listShared(user.id)`, returns `200 OK` with `List<ContractionDto>`.
- `DELETE` handler: call `contractionService.delete(id, user.id)` (signature unchanged in controller; service now permits partner).

---

### Success Criteria

#### Automated Verification

- `./gradlew bootRun` starts without errors after the changes.
- `./gradlew test` passes (no existing tests break).
- `npm run lint` passes on backend Kotlin sources.

#### Manual Verification

- `GET /api/contractions/shared` with a linked-partner JWT returns contractions for both users.
- `GET /api/contractions/shared` with a solo (unlinked) JWT returns only the caller's own contractions.
- `PATCH /api/contractions/{id}` with a partner's JWT and `{startedAt, endedAt}` returns 200 and updates the contraction.
- `PATCH /api/contractions/{id}` with a stranger's JWT returns 404.
- `DELETE /api/contractions/{id}` with a partner's JWT returns 204.
- `DELETE /api/contractions/{id}` with a stranger's JWT returns 404.
- `PATCH` on an already-finalized contraction with new times updates the entry (no early-return).

**Phase gate**: pause after automated verification and await manual confirmation before proceeding.

---

## Phase 2: Frontend — data layer (polling + shared sync)

### Overview

Modify `useContractions` to: accept a `hasPartner` flag, poll `/api/contractions/shared` every 5s
when a partner is linked, upsert partner rows correctly, and handle edit/delete for partner entries
via direct API calls.

### Changes Required

#### 1. `use-contractions.ts` — refactor sync + add polling

**File**: `src/hooks/use-contractions.ts`

**Intent**: Switch sync to the shared endpoint, add a 5s poll loop when `hasPartner === true`, fix the upsert strategy per row owner, and reroute `edit()`/`remove()` for partner entries to direct API calls.

**Contract** — key changes only (all other behavior preserved):

- Export signature: `export function useContractions(hasPartner: boolean): UseContractionsResult`
- Replace the `syncWithBackend` download section: call `GET /api/contractions/shared` (not `/api/contractions`). For each returned row:
  - If `row.userId !== myUserId` (partner row): use `INSERT OR REPLACE` so updated server versions overwrite stale local data.
  - If `row.userId === myUserId` (own row): keep INSERT-if-not-exists to preserve unsynced local state.
  
- Add a poll loop effect:
  ```
  useEffect:
    deps: [hasPartner, session]
    if (!hasPartner || !session) return
    setInterval(() => syncShared(), 5_000)
    return clearInterval
  ```
  Where `syncShared()` calls the shared endpoint and upserts as above, then calls `reload()`.

- `loadContractions` SQL: change `WHERE user_id = ?` → remove the filter (no user_id param); add `LIMIT 200`. All rows in the local DB belong to the current device's account (own or partner).

- `edit(id, patch)`:
  - Read the local row first (no `AND user_id = ?` filter).
  - If `row.userId === user.id.toString()` → existing flow (local DB + sync queue).
  - If `row.userId !== user.id.toString()` (partner entry):
    - Call `PATCH /api/contractions/{id}` with `{startedAt, endedAt}`.
    - On success: update local DB row directly (no sync queue entry).
    - On failure (non-ok or network error): re-throw so the caller can surface an error.

- `remove(id)`:
  - Read the local row first (no `AND user_id = ?` filter).
  - If own → existing flow.
  - If partner → call `DELETE /api/contractions/{id}` → on success, `DELETE FROM contractions WHERE id = ?` locally → `reload()`. On failure: re-throw.

- `start()` unchanged — own entries only.
- `finalize()` unchanged — own entries only.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes.

#### Manual Verification

- On a device with a linked partner: open the contractions screen; partner logs a contraction on their device; within 10s it appears on this screen without manual refresh.
- Partner's entry shows in the list with the correct `userId` (verify in-app after Phase 3).
- On a solo device (no partner): screen behavior is unchanged; no polling API calls appear in logs.
- Edit a partner's contraction: confirm the change is reflected on the partner's device within 10s.
- Delete a partner's contraction: confirm it disappears from both devices within 10s.
- Simulate offline (airplane mode): editing a partner's contraction shows an error rather than silently failing.

**Phase gate**: pause after lint and await manual confirmation before proceeding.

---

## Phase 3: Frontend — attribution UI

### Overview

Wire `usePartner` into the contractions screen and add a "You" / partner-name label to each
contraction row. Pass the combined list (own + partner) to `computeFiveOneOne`.

### Changes Required

#### 1. `index.tsx` — add `usePartner`, pass attribution props

**File**: `src/app/(app)/index.tsx`

**Intent**: Call `usePartner` alongside `useContractions` and derive the attribution context (current userId + partner display label) to pass into `ContractionList`.

**Contract**:
- Add `const { partner } = usePartner()` call.
- Pass `hasPartner={partner !== null}` to `useContractions`.
- Derive `partnerLabel: string | null = partner ? (partner.displayName ?? partner.email) : null`.
- Pass `currentUserId={user?.id?.toString() ?? ''}` and `partnerLabel` to `ContractionList`.
- `computeFiveOneOne(contractions)` already operates on the merged list since `contractions` state now holds both own and partner rows — no change needed here.

---

#### 2. `contraction-list.tsx` — add attribution props + forward to row

**File**: `src/components/contraction-list.tsx`

**Intent**: Extend `ContractionListProps` with attribution context and forward it per-row.

**Contract**:
- New optional props: `currentUserId?: string` and `partnerLabel?: string | null`.
- Pass `authorLabel={item.userId === currentUserId ? 'You' : (partnerLabel ?? null)}` to each `ContractionRow`.

---

#### 3. `contraction-row.tsx` — add attribution label to row

**File**: `src/components/contraction-row.tsx`

**Intent**: Render a small "You" or partner-name label on each row to satisfy FR-023 ("see who logged each entry").

**Contract**:
- New optional prop: `authorLabel?: string | null`.
- When non-null, render a `ThemedText type="small" themeColor="textSecondary"` beside the time — e.g., inline inside `rowMain` after the existing duration/gap line.
- No layout change when `authorLabel` is null (solo users see no regression).

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes.

#### Manual Verification

- Each row shows "You" for own entries and partner's display name (or email) for partner entries.
- Rows logged by the partner but not yet visible become visible within 10s of the partner logging them.
- On a solo device: no "You" label appears (solo rows show no attribution label when no partner is linked).
- 5-1-1 banner updates correctly when the partner logs a contraction that crosses the threshold.

**Phase gate**: pause after lint and await manual confirmation before proceeding.

---

## References

- Roadmap: `context/foundation/roadmap.md` — S-04 entry
- Partner linking implementation: `context/archive/2026-09-13-partner-linking/`
- Contraction tracking implementation: `context/archive/2026-09-11-contraction-tracking/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — shared feed, authz widening, PATCH expansion

#### Automated

- [x] 1.1 Backend starts without errors (`./gradlew bootRun`) — a9296f2
- [x] 1.2 Existing tests pass (`./gradlew test`) — a9296f2
- [x] 1.3 Lint passes (`npm run lint` or Kotlin linter) — a9296f2

#### Manual

- [x] 1.4 GET /api/contractions/shared returns combined entries for linked partners — a9296f2
- [x] 1.5 GET /api/contractions/shared returns own-only entries for unlinked users — a9296f2
- [x] 1.6 PATCH by partner JWT updates contraction; stranger JWT returns 404 — a9296f2
- [x] 1.7 DELETE by partner JWT returns 204; stranger JWT returns 404 — a9296f2
- [x] 1.8 PATCH on already-finalized contraction updates times (no early-return) — a9296f2

### Phase 2: Frontend — data layer (polling + shared sync)

#### Automated

- [x] 2.1 Lint passes (`npm run lint`) — ef24c11

#### Manual

- [x] 2.2 Partner's new contraction appears on screen within 10s (no refresh) — ef24c11
- [x] 2.3 Solo device: no polling API calls, unchanged behavior — ef24c11
- [x] 2.4 Edit partner contraction: change visible on partner's device within 10s — ef24c11
- [x] 2.5 Delete partner contraction: disappears from both devices within 10s — ef24c11
- [x] 2.6 Offline partner edit shows error rather than silently failing — ef24c11

### Phase 3: Frontend — attribution UI

#### Automated

- [x] 3.1 Lint passes (`npm run lint`) — bc3bfa2

#### Manual

- [x] 3.2 Own entries labeled "You"; partner entries labeled with partner's name/email — bc3bfa2
- [x] 3.3 Solo device: no attribution label on any row — bc3bfa2
- [x] 3.4 5-1-1 banner updates when partner logs a qualifying contraction — bc3bfa2
