# Feeding Edit Details — Plan Brief

> Full plan: `context/changes/feeding-edit-details/plan.md`

## What & Why

Users can only change the times of a logged feeding; milk type, amount and note are fixed once the completion sheet is saved (user report during `language-switch` testing). While tracing the edit path we found that own feedings get a different id on the server than locally, so every edit re-uploads a second copy and partners see duplicates. Adding detail editing on top of that would make the bug far more visible, so this change fixes both.

## Starting Point

`useFeedings().edit` accepts only `startedAt`/`endedAt`; the backend `PATCH` accepts details but treats `null` as "unchanged" (no clearing). Uploads `POST` without an id, the server generates its own, and own server rows never overwrite local ones.

## Desired End State

Tapping a feeding opens one sheet with times, milk type, amount and note, all editable (amount and note clearable). Edits update the same record locally, on the server and on the partner's device (~5 s). Failed saves show a translated error in the sheet. Existing data is reconciled once after the update.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Sync id bug | Fix for feedings in this change | Without it, detail edits create duplicates for the partner from day one. |
| Contractions / sleep-log | Not touched; note added to sleep-log | Keeps scope to the reported feature; sleep-log inherits the pattern and must know. |
| Server API | New `PUT /api/feedings/{id}` upsert (client UUID, full replacement) | One idempotent path for upload, re-upload and partner edits; `null` clears fields. |
| Edit UX | One sheet: times + details, details form shared with completion sheet | One place for all corrections, no duplicated form code. |
| Clearing fields | Allowed for amount and note everywhere | The form must not silently ignore an emptied field. |
| Existing data | One-time local reconcile (drop `synced = 1` rows, re-download) | Fixes local duplicates and id mismatches on old feedings. |
| Conflicts | Server wins for rows without local changes; unsynced local edit wins on upload | Partner edits become visible without losing my offline edits. |
| Save errors | Translated error inside the sheet, retry possible | Today Save silently does nothing on failure. |
| Tests | Backend service tests + Jest for pure helpers | Covers the contract and form rules cheaply; sync hook verified manually. |

## Scope

**In scope:** `PUT` upsert + tests; client-id upload, server-wins download, one-time reconcile; `edit()` with all fields; single edit sheet with shared details form; error states; EN/PL strings.

**Out of scope:** contractions sync fix; sleep-log code; removing `POST`/`PATCH`; server-side duplicate cleanup; offline queue for partner edits; editing active feedings or the feeding's date; syncing own deletions.

## Architecture / Approach

The local UUID becomes the feeding's identity everywhere. Own feedings upload via `PUT /api/feedings/{id}` (create or replace, owner-or-partner access); partner feedings are edited with the same `PUT` directly. The download overwrites own rows unless they have pending local changes. `PRAGMA user_version = 1` guards a one-time `DELETE FROM feedings WHERE synced = 1`. UI: `FeedingEditSheet` (time steppers + `FeedingDetailsFields`) replaces `FeedingTimeEditSheet`; pure helpers in `src/components/feeding-edit.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend upsert | `PUT /api/feedings/{id}` + service tests | Assigned ids change JPA save semantics (merge) |
| 2. Sync + full edit | Client-id upload, server-wins download, reconcile, `edit(FeedingEdit)` | Reconcile while offline briefly hides synced feedings |
| 3. Edit sheet | One sheet for all fields, shared form, error states, EN/PL | Taller sheet + keyboard on small screens |

**Prerequisites:** dev backend + Postgres running, dev client on iPhone, second account linked as partner for sync checks.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Server duplicates created by past edits remain (dev/test data only).
- `PRAGMA user_version` is shared; `sleep-log` must use a higher version if it adds a local migration.
- Concurrent offline edits of the same feeding resolve as last write wins.

## Success Criteria (Summary)

- Every field of a feeding can be edited (and amount/note cleared) from one sheet, in EN and PL.
- Edits never create duplicate feedings, locally or for the partner.
- A failed save is visible and retryable.
