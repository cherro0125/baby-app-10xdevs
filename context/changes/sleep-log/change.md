---
change_id: sleep-log
title: Sleep log
status: impl_reviewed
created: 2026-09-14
updated: 2026-10-24
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
- i18n (from `language-switch`): every UI phase must render user-visible strings via `t()` and add EN + PL keys (`src/i18n/locales/en.ts` / `pl.ts`) from the start; use `src/i18n/format.ts` for times and durations. The hardcoded-string guard test will fail otherwise.
- Sync identity (from `feeding-edit-details`, 2026-10-21): the copied feeding sync POSTs without the local id, so the server assigns a different one — edits re-upload as duplicates and own rows can duplicate locally. `feeding-edit-details` replaces this for feedings with `PUT /api/feedings/{id}` (client UUID upsert via atomic `INSERT … ON CONFLICT (id) DO NOTHING` in `FeedingRepository.insertIfAbsent`, then owner/partner check + full replace — not JPA `save` with an assigned id, which races into 500s) and a one-time local reconcile guarded by `PRAGMA user_version = 1`; mirror that pattern here and use a higher `user_version` for any local migration.
- Re-plan (2026-10-23): the scope grew from sleep only to a shared sync engine (`src/sync/`), with feedings, contractions and sleeps all on it. Contractions get a `PUT` upsert, strength/note sync, a full edit sheet and a one-time re-download (`PRAGMA user_version` 2; later local migrations use 3+). Sleep needs no local migration (new table only). Phase 1 (`2832d8c`) is unchanged; the old Phases 2–3 are replaced by Phases 2–5.
