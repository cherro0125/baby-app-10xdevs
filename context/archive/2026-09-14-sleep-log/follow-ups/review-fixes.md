# Review follow-ups: sleep-log

## Sync write load (from impl-review-phase-3, F4)

- **Source**: `reviews/impl-review-phase-3.md` F4. This extends the existing follow-up in `context/archive/2026-10-21-feeding-edit-details/follow-ups/review-fixes.md`.
- **Problem**: each 5 s poll runs about 200 autocommit writes per entity (`src/sync/entity-sync.ts`, download loop), even when nothing changed. The own upsert always fires, and partner rows are replaced. With feedings, contractions and sleeps on the engine, that is about 600 writes every 5 s while a partner is linked.
- **Direction**: one change in `syncEntity`:
  - skip unchanged rows (compare the data columns in the `DO UPDATE … WHERE`, and use a conditional upsert instead of `INSERT OR REPLACE` for partner rows);
  - and/or batch the download in one transaction.
- **Constraint**: batch with `withExclusiveTransactionAsync`, not `withTransactionAsync`. The latter runs on the shared connection, so a concurrent `deleteEntry` transaction would hit a nested `BEGIN`. The node:sqlite test adapter (`src/sync/__tests__/node-sqlite-db.ts`) would need that method too.
- **Also (from impl-review, F5)**:
  - Each entity has its own sync runner, so the three pollers run at once on the shared connection. Autocommit poll writes of one entity can land inside another entity's `deleteEntry` `withTransactionAsync` and would be rolled back with it; the next sync heals this. Moving `deleteEntry` to `withExclusiveTransactionAsync` closes it.
  - `useEntitySync` calls `setRows(await load(db))` after every poll with a new array, so up to 3 × 200 rows re-render every 5 s, also on hidden tabs (NativeTabs keeps them mounted). Skip `setRows` when nothing changed (e.g. same count and max `updated_at`, or the sync reports no writes).

## Sleep edit sheet error text (from impl-review-phase-4, F3)

- **Status**: RESOLVED in `64ce6b5` (Phase 5): `sleep.edit.tooLong` in EN and PL, used by `sleep-edit-sheet.tsx`.

- **Source**: `reviews/impl-review-phase-4.md` F3.
- **Problem**: Phase 5 prescribes `feeding.edit.tooLong` for the sleep edit sheet, which would show "A feeding can't last 24 hours or more" for a sleep. The contraction sheet had the same slip and now uses `contractions.edit.tooLong`.
- **Direction**: in Phase 5, add `sleep.edit.tooLong` (EN "A sleep can't last 24 hours or more" / PL "Sen nie może trwać 24 godzin lub dłużej") and use it in `sleep-edit-sheet.tsx`.

## Uploads the server rejects are retried forever (from impl-review-phase-4, F4)

- **Source**: `reviews/impl-review-phase-4.md` F4.
- **Problem**:
  - `finalize` in `use-contractions.ts`, `use-feedings.ts` and `use-sleeps.ts` (impl-review F3) doesn't enforce `endedAt > startedAt`. If the device clock moves back between start and stop, the row gets a negative duration. The server rejects its `PUT` with 400, the row stays `synced = 0`, and it is re-sent on every sync (every 5 s with a partner).
  - Legacy contraction notes over 2000 characters, written before the timer had a `maxLength`, fail the same way.
- **Direction**:
  - Validate the end in `finalize` (clamp it or reject it).
  - In `syncEntity`'s upload loop, stop retrying a row after a 4xx other than 401/403/404, e.g. by moving it to a failed state that is shown in the UI.

## Partner can't see a running sleep (from impl-review, F6)

- **Source**: `reviews/impl-review.md` F6.
- **Problem**: running entries are never uploaded (`ended_at IS NOT NULL` in the upload, null-end server rows ignored), as decided in the plan's What We're NOT Doing. For sleeps, which run for hours, the partner doesn't see that the baby is asleep and may start a second timer.
- **Direction**: roadmap candidate, not a fix in this change. Would need uploading running rows (server `ended_at` is NOT NULL for sleeps, so a schema change or a separate "active session" signal), and a rule for who stops a shared running sleep.
