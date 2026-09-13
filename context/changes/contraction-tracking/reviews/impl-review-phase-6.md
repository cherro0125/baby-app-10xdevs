<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Contraction Tracking — Phase 6

- **Plan**: context/changes/contraction-tracking/plan.md
- **Scope**: Phase 6 of 6
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — PATCH result unchecked before `synced=1` write

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:95–99
- **Detail**: In `syncWithBackend`, after a successful POST, the PATCH is fired but its response is never checked before `synced=1` is written. If PATCH returns a non-ok status without throwing (e.g. 500, timeout absorbed as a non-exception), `db.runAsync('UPDATE ... synced = 1')` runs anyway. The server record permanently lacks `endedAt`; the local row is marked synced and will never be retried.
- **Fix**: Check `patchRes.ok` before marking synced=1 — only write `synced = 1` when both POST and PATCH returned ok.
  - Strength: Prevents silent data loss on the server; adds one conditional, no new abstractions needed.
  - Tradeoff: A failed PATCH now leaves synced=0, so the next sync will POST again — creating a duplicate server record. This is the lesser of two evils (duplicate vs. permanent missing endedAt), and the plan explicitly labels this best-effort.
  - Confidence: HIGH — the condition is already present for POST (the entire PATCH block is inside `if (createRes.ok)`); same pattern for PATCH.
  - Blind spot: Whether `createApiClient.request` ever throws vs. returns non-ok depends on the client implementation — worth verifying it doesn't swallow status codes.
- **Decision**: FIXED — added `patchRes.ok` guard before `synced=1` write

### F2 — Unplanned note display in contraction-row.tsx

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/contraction-row.tsx:92–96
- **Detail**: `contraction-row.tsx` gained an inline note display (`{contraction.note ? <ThemedText …>{contraction.note}</ThemedText> : null}`) that is not listed under Phase 6 "Changes Required". This was a pre-existing gap (notes were saved to SQLite via `finalize()` but never rendered) discovered during Phase 5/6 code verification. The change is correct and fills FR-4, but it was never formally documented in the plan.
- **Fix**: No code change needed. Acknowledge as an addendum in the plan's Phase 6 "Changes Required" section, or note it here as accepted scope.
- **Decision**: FIXED — accepted undocumented scope (note display is correct FR-4 fill)
