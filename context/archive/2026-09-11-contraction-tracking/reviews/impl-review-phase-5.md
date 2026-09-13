<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Contraction Tracking (S-03)

- **Plan**: context/changes/contraction-tracking/plan.md
- **Scope**: Phase 5 of 6
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — edit() can store negative durationSeconds

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:161-164
- **Detail**: `edit()` computes `newDuration` from `newStartedAt`/`newEndedAt` with no guard that `newEndedAt > newStartedAt`. A user setting end-hour past start-hour (or midnight crossing) causes `computeDuration` to return a negative integer, which is written to `duration_seconds` in the DB.
- **Fix**: Add a validation guard inside `edit()` before the UPDATE:
  ```ts
  if (newEndedAt && newEndedAt <= newStartedAt) {
    throw new Error('endedAt must be after startedAt');
  }
  ```
  - Strength: Backstop that catches all callers; only one line change at the data layer.
  - Tradeoff: Error bubbles as thrown exception — `handleEditConfirm` in index.tsx catches it but silently discards it (see F6); pair with F2 UI fix so the user gets feedback.
  - Confidence: HIGH — defensive check, no side-effects.
  - Blind spot: None significant.
- **Decision**: FIXED — guard added in use-contractions.ts before UPDATE

### F2 — handleConfirm passes invalid end-before-start without UI feedback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/time-edit-sheet.tsx:48-58
- **Detail**: `handleConfirm` builds `newStart`/`newEnd` from stepper state and calls `onConfirm` unconditionally. If the user accidentally sets end ≤ start, the invalid patch is passed to the hook, which (once F1 is fixed) will throw — but the sheet is already closed by `setEditTarget(null)` in index.tsx (F6) and the user sees nothing.
- **Fix A ⭐ Recommended**: Validate in `handleConfirm` and show inline error
  ```ts
  if (endDate && newEnd <= newStart) {
    setError('End must be after start');
    return;  // keep sheet open
  }
  ```
  Add `const [error, setError] = useState<string | null>(null)` and render `<ThemedText themeColor="danger">{error}</ThemedText>` above the action buttons.
  - Strength: Catches the error at the UI level before any DB write; user can correct values without losing their edit session.
  - Tradeoff: Requires a small error state addition to TimeEditSheetInner.
  - Confidence: HIGH — standard inline validation pattern.
  - Blind spot: None significant.
- **Fix B**: Rely solely on hook-level guard (F1)
  - Strength: Zero UI change.
  - Tradeoff: Silent failure — sheet closes, row unchanged, no user feedback. Violates expectation of confirmation.
  - Confidence: LOW — bad UX; only acceptable as a temporary backstop.
  - Blind spot: Requires F6 to also be fixed to surface any error.
- **Decision**: FIXED via Fix A — inline error state added to TimeEditSheetInner

### F3 — Midnight-crossing contractions get wrong end date

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/time-edit-sheet.tsx:49-55
- **Detail**: `handleConfirm` calls `new Date(contraction.endedAt!)` then `setHours(endH, endM, 0, 0)` — preserving the original calendar date. A contraction starting 23:55 on day N and ending 00:10 on day N+1 has `endedAt` on day N+1, but editing it produces an `endedAt` on day N, making end < start and durationSeconds negative.
- **Fix**: After computing `newEnd`, if `newEnd < newStart`, advance newEnd by one day:
  ```ts
  if (newEnd < newStart) {
    newEnd.setDate(newEnd.getDate() + 1);
  }
  ```
  - Strength: Handles the most common midnight-crossing case without adding a date picker.
  - Tradeoff: Assumes the contraction is < 24h (reasonable). Add a comment to document the assumption.
  - Confidence: HIGH — corner case but deterministic fix.
  - Blind spot: Multi-day contractions (>24h) would still be mis-handled, but that's an implausible scenario for contraction timing.
- **Decision**: FIXED — midnight-crossing day adjustment added in handleConfirm

### F4 — No onRequestClose on TimeEditSheet — Android back button traps user

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/time-edit-sheet.tsx:18
- **Detail**: `<Modal>` has no `onRequestClose` prop. On Android, the hardware back button fires this callback; without it the modal cannot be dismissed via back button. `IncompleteContractionModal` intentionally omits it to force a choice, but `TimeEditSheet` is an optional editing flow that should be easily cancellable.
- **Fix**: Add `onRequestClose={onClose}` to the Modal:
  ```tsx
  <Modal visible={contraction !== null} transparent animationType="slide" onRequestClose={onClose}>
  ```
- **Decision**: FIXED — onRequestClose={onClose} added to TimeEditSheet Modal

### F5 — startedAt edit on active contraction silently skips server sync

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:170-173
- **Detail**: `edit()` only enqueues a FINALIZE sync when `newEndedAt` is truthy. Editing the `startedAt` of an active contraction (endedAt=null) updates the local DB but enqueues nothing — the original CREATE event recorded the old startedAt, and the server is never told about the correction.
- **Fix A ⭐ Recommended**: Enqueue a CREATE update when only startedAt changed on an active contraction
  ```ts
  if (!newEndedAt && patch.startedAt) {
    await enqueueSync(db, 'CREATE', { id, userId: user.id.toString(), startedAt: newStartedAt });
  }
  ```
  - Strength: Keeps server in sync; consistent with how the rest of the sync queue is used.
  - Tradeoff: Requires the backend PATCH /api/contractions/{id} to accept updating startedAt before endedAt is set (verify with backend implementation).
  - Confidence: MEDIUM — depends on backend contract.
  - Blind spot: Haven't verified if the backend `PATCH /api/contractions/{id}` accepts partial updates to an open contraction.
- **Fix B**: Disable editing startedAt on active contractions in the sheet UI
  ```tsx
  // In TimeEditSheetInner, if !contraction.endedAt, show Start row as read-only
  ```
  - Strength: Zero risk of sync inconsistency; avoids the backend question entirely.
  - Tradeoff: Worse UX — user started a contraction at the wrong time and can't fix it until they stop.
  - Confidence: HIGH — safe, though limiting.
  - Blind spot: None.
- **Decision**: FIXED via Fix B — Start row rendered read-only when contraction is active; startedAt excluded from patch for active contractions (backend only supports PATCH endedAt)

### F6 — Optimistic sheet close silently discards edit errors

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/index.tsx:70-76
- **Detail**: `setEditTarget(null)` runs before `await edit(id, patch)`. If the hook throws (including once F1 guard is added), the sheet is already closed, the row is unchanged, and there is no user-visible feedback. The error is only logged to console.
- **Fix**: Move `setEditTarget(null)` inside the try block after the await; add visible error feedback (e.g. a temporary error state rendered as a ThemedText at the top of the screen).
- **Decision**: FIXED — setEditTarget(null) moved inside try block after await edit()

### F7 — Double-tap on Confirm delete enqueues duplicate sync items

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/contraction-row.tsx:46
- **Detail**: No in-flight guard on the confirm-delete Pressable. Two rapid taps fire `onDelete` twice; the second DB DELETE is a no-op, but two DELETE sync items are queued for the same id. The backend would receive a duplicate DELETE, which may cause a spurious 404.
- **Fix**: Add a `deleting` boolean state; set it on first press and disable/ignore further presses until the promise resolves.
- **Decision**: FIXED — deleting boolean state guard added to ContractionRow confirm-delete Pressable

### F8 — DateTimePicker plan drift — custom stepper used instead

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/time-edit-sheet.tsx
- **Detail**: Plan specified `@react-native-community/datetimepicker` (Decision 8). The implementation uses a custom +/- stepper for hours and minutes. The package is not in node_modules. Stepper approach is cross-platform, avoids a native rebuild, and meets all functional requirements.
- **Fix**: Update plan Decision 8 to document the substitution: "Custom H:M stepper (datetimepicker not in node_modules; stepper is cross-platform and avoids native rebuild)."
- **Decision**: FIXED — Decision 8 in plan.md updated to document the stepper substitution
