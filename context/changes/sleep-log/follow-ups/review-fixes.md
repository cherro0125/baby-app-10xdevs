# Review follow-ups: sleep-log

## Sync write load (from impl-review-phase-3, F4)

- **Source**: `reviews/impl-review-phase-3.md` F4. This extends the existing follow-up in `context/archive/2026-10-21-feeding-edit-details/follow-ups/review-fixes.md`.
- **Problem**: each 5 s poll runs about 200 autocommit writes per entity (`src/sync/entity-sync.ts`, download loop), even when nothing changed. The own upsert always fires, and partner rows are replaced. With feedings, contractions and sleeps on the engine, that is about 600 writes every 5 s while a partner is linked.
- **Direction**: one change in `syncEntity`:
  - skip unchanged rows (compare the data columns in the `DO UPDATE … WHERE`, and use a conditional upsert instead of `INSERT OR REPLACE` for partner rows);
  - and/or batch the download in one transaction.
- **Constraint**: batch with `withExclusiveTransactionAsync`, not `withTransactionAsync`. The latter runs on the shared connection, so a concurrent `deleteEntry` transaction would hit a nested `BEGIN`. The node:sqlite test adapter (`src/sync/__tests__/node-sqlite-db.ts`) would need that method too.
