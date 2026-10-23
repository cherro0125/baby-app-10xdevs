# Review follow-ups: feeding-edit-details

Queued from `reviews/impl-review.md` (full-plan review, 2026-10-22).

- [ ] **F6 (rest): reduce sync write load.** Today `syncWithBackend` (`src/hooks/use-feedings.ts`) writes up to 200 rows one by one every 5 s while a partner is linked. It also bumps `updated_at` on every own row and re-renders the list even when nothing changed.
  - Wrap the download in one transaction. Check expo-sqlite v56 for `withExclusiveTransactionAsync`.
  - Update only rows whose fields changed (`IS NOT` comparisons in the `DO UPDATE … WHERE`, plus a guard on the partner `INSERT OR REPLACE`).
  - Stop bumping `updated_at` on download.
  - Retest partner sync on two devices afterwards.
