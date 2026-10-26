# Review follow-ups: sleep-log

## Sync write load (from impl-review-phase-3, F4)

- **Source**: `reviews/impl-review-phase-3.md` F4. This extends the existing follow-up in `context/archive/2026-10-21-feeding-edit-details/follow-ups/review-fixes.md`.
- **Problem**: each 5 s poll runs about 200 autocommit writes per entity (`src/sync/entity-sync.ts`, download loop), even when nothing changed. The own upsert always fires, and partner rows are replaced. With feedings, contractions and sleeps on the engine, that is about 600 writes every 5 s while a partner is linked.
- **Direction**: one change in `syncEntity`:
  - skip unchanged rows (compare the data columns in the `DO UPDATE … WHERE`, and use a conditional upsert instead of `INSERT OR REPLACE` for partner rows);
  - and/or batch the download in one transaction.
- **Constraint**: batch with `withExclusiveTransactionAsync`, not `withTransactionAsync`. The latter runs on the shared connection, so a concurrent `deleteEntry` transaction would hit a nested `BEGIN`. The node:sqlite test adapter (`src/sync/__tests__/node-sqlite-db.ts`) would need that method too.

## Sleep edit sheet error text (from impl-review-phase-4, F3)

- **Source**: `reviews/impl-review-phase-4.md` F3.
- **Problem**: Phase 5 prescribes `feeding.edit.tooLong` for the sleep edit sheet, which would show "A feeding can't last 24 hours or more" for a sleep. The contraction sheet had the same slip and now uses `contractions.edit.tooLong`.
- **Direction**: in Phase 5, add `sleep.edit.tooLong` (EN "A sleep can't last 24 hours or more" / PL "Sen nie może trwać 24 godzin lub dłużej") and use it in `sleep-edit-sheet.tsx`.

## Uploads the server rejects are retried forever (from impl-review-phase-4, F4)

- **Source**: `reviews/impl-review-phase-4.md` F4.
- **Problem**:
  - `finalize` in `use-contractions.ts` and `use-feedings.ts` doesn't enforce `endedAt > startedAt`. If the device clock moves back between start and stop, the row gets a negative duration. The server rejects its `PUT` with 400, the row stays `synced = 0`, and it is re-sent on every sync (every 5 s with a partner).
  - Legacy contraction notes over 2000 characters, written before the timer had a `maxLength`, fail the same way.
- **Direction**:
  - Validate the end in `finalize` (clamp it or reject it).
  - In `syncEntity`'s upload loop, stop retrying a row after a 4xx other than 401/403/404, e.g. by moving it to a failed state that is shown in the UI.
