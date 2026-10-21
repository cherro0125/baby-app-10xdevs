---
change_id: language-switch
title: Language switch
status: implemented
created: 2026-10-20
updated: 2026-10-21
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- Phase 3 (impl-review F1/F2): `time-edit-sheet.tsx` widened `timeLabel` 40 → 72 so Polish "Początek" fits, and gave the "(stop first to edit)" hint `flexShrink: 1` so it wraps on narrow screens. Phase 4 must apply both to the twin `feeding-time-edit-sheet.tsx` (still `width: 40`).
- `common.start` / `common.end` are time labels ("Początek" / "Koniec"), not actions — don't reuse them on Start/Stop buttons.
