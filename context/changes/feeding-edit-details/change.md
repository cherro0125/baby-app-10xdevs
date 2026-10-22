---
change_id: feeding-edit-details
title: Edit milk type, amount and note of existing feedings
status: implemented
created: 2026-10-21
updated: 2026-10-22
archived_at: null
---

## Notes

User report (manual testing of `language-switch`, 2026-10-21): "Jak edytuję aktualnie istniejące karmienia to mogę tylko edytować czas. Nie mogę edytować typu karmienia ani notatek."

- Today `useFeedings().edit` (`src/hooks/use-feedings.ts`) only accepts `{ startedAt?, endedAt? }`; the edit sheet is `src/components/feeding-time-edit-sheet.tsx` (times only). Milk type / amount / note are set only once, in `feeding-completion-sheet.tsx`.
- Check whether the backend feeding PATCH accepts `milkType`, `amountMl`, `note` (partner-synced feedings go through the API).
- `feeding-time-edit-sheet.tsx` and `time-edit-sheet.tsx` (contractions) are near-duplicates (language-switch final review F5) — decide whether to merge or diverge.
- All new UI strings via `t()` with EN + PL keys (lesson in `context/foundation/lessons.md`).
- Planning (2026-10-21): backend PATCH already accepts milkType/amountMl/note but cannot clear them. Found a sync-identity bug (local UUID ≠ server id → edits re-POST duplicates); fixed here for feedings via `PUT /api/feedings/{id}` upsert. Contractions keep the bug (out of scope).
- Phase 1 review (F1): the upsert creates rows via native `INSERT … ON CONFLICT (id) DO NOTHING` (`FeedingRepository.insertIfAbsent`), so `Feeding.id` keeps `@GeneratedValue` — this supersedes the plan's "remove `@GeneratedValue`" contract for `Feeding.kt`.
- Phase 2 extras (review F5): (1) `src/app/(app)/feeding-log.tsx` has a temporary bridge that builds a full `FeedingEdit` from the times-only sheet plus the feeding's current details, to keep tsc green until Phase 3 replaces the sheet; (2) `runMigrations` (`src/db/schema.ts`) is memoised per app process so the one-time `user_version` 1 cleanup can't interleave between the feeding and contraction hooks.
- Phase 2 review (F2): own-feeding deletions now sync to the server via tombstones in `sync_queue` (`operation = 'DELETE'`, payload `{ feedingId }`); the next sync sends `DELETE /api/feedings/{id}` (404 counts as done) and the download skips tombstoned ids. This moves "syncing deletions of own feedings" out of the plan's "What We're NOT Doing" for feedings only — contractions keep the gap (their `DELETE` queue rows use payload `{ id, userId }` and are still never processed).
- Phase 2 review (F3): `PUT /api/feedings/{id}` accepts `?create=false` (404 instead of creating); partner edits use it so a feeding the partner deleted meanwhile is not recreated as the editor's own. Own-feeding upload keeps the default `create=true`.
- Phase 3 manual testing (2026-10-22) also needed two commits outside the plan: `b9c1ff3` changes the Android package to `com.dominik.babytrack` (the `com.babytrack.app` + debug SHA-1 pair was already registered in Google Cloud), and `dfb9db8` adds a shared `PartnerProvider` with refresh on foreground and while an invite is shown (the tabs kept stale partner state, so the feeding tab never started partner sync after linking) and fixes the clipped invite code on iOS.
