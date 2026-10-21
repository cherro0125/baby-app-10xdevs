---
change_id: sleep-log
title: Sleep log
status: implementing
created: 2026-09-14
updated: 2026-10-21
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
- i18n (from `language-switch`): every UI phase must render user-visible strings via `t()` and add EN + PL keys (`src/i18n/locales/en.ts` / `pl.ts`) from the start; use `src/i18n/format.ts` for times and durations. The hardcoded-string guard test will fail otherwise.
