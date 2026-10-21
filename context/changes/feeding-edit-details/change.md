---
change_id: feeding-edit-details
title: Edit milk type, amount and note of existing feedings
status: impl_reviewed
created: 2026-10-21
updated: 2026-10-21
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
