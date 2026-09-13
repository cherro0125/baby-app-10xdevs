<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Contraction Tracking — Phase 3

- **Plan**: context/changes/contraction-tracking/plan.md
- **Scope**: Phase 3 of 6
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — elapsed initialises to 0 on reconnect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/contraction-timer.tsx:28
- **Detail**: `elapsed` is initialised to `0`. The `key` prop resets state correctly when a *new* contraction starts. But when the component reconnects to an *already-running* contraction (app foregrounded, Metro hot reload, tab focus), the display shows `0:00` for up to one second before the first `setInterval` tick fires the correct value.
- **Fix**: Use a lazy state initialiser: `useState(() => active ? Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000) : 0)`. Moves the impure `Date.now()` call out of render body into an initialiser (called only once on mount).
- **Decision**: FIXED — replaced useState(0) with lazy initialiser in contraction-timer.tsx

### F2 — handleStart / handleStop are fire-and-forget

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/index.tsx:24
- **Detail**: `handleStart` calls `start(new Date())` and `handleStop` calls `finalize(...)` without `await` and with no catch path. If the underlying SQLite write fails (disk full, constraint violation), the error is silently swallowed — no user feedback, no console trace, no re-throw.
- **Fix**: Add `try/catch` with `console.error` until a proper error UI exists: `try { await start(new Date()); } catch (e) { console.error('start failed', e); }`.
- **Decision**: FIXED — both handlers made async with try/catch + console.error

### F3 — Hook mutations lack try/catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:83
- **Detail**: `start`, `finalize`, `remove`, and `edit` all perform async SQLite writes with no error handling. The `init` function already uses `.catch(console.error)`. Callers that don't await (like `index.tsx` post-F2 fix) will receive unhandled promise rejections.
- **Fix**: Wrap each function body in `try { … } catch (e) { console.error(e); throw e; }` so failures are visible and callers can react if needed.
- **Decision**: FIXED — added try/catch + re-throw to start, finalize, remove, and edit in use-contractions.ts

### F4 — Stop button uses hardcoded colors

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/contraction-timer.tsx:131
- **Detail**: `backgroundColor: '#D9534F'` and `color: '#ffffff'` are hardcoded. Every other component uses named tokens from `Colors` via `useTheme()`. The stop button won't adapt to future palette changes.
- **Fix**: Add `danger: '#D9534F'` to both light and dark palettes in `src/constants/theme.ts` and reference it as `theme.danger`.
- **Decision**: FIXED — added danger and dangerText tokens to theme.ts; stop button now uses theme.danger / theme.dangerText

### F5 — DELETE sync payload missing userId

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-contractions.ts:128
- **Detail**: `enqueueSync(db, 'DELETE', { id })` omits `userId`, unlike `CREATE` which includes `{ id, userId, startedAt }`. When S-04 drains the sync queue, a DELETE entry without `userId` may fail authorisation or need a separate lookup.
- **Fix**: Change to `{ id, userId: user.id.toString() }` to match the CREATE entry shape.
- **Decision**: FIXED — added userId to DELETE enqueueSync payload in use-contractions.ts

### F6 — "Expo Starter" stale brand text in web tab bar

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/app-tabs.web.tsx:55
- **Detail**: The Explore trigger was removed but the `brandText` slot still reads `"Expo Starter"`, a template artifact. The explore removal was an unplanned change flagged as benign, but this leftover is the only part that's a content mistake.
- **Fix**: Replace `"Expo Starter"` with `"BabyTrack"`.
- **Decision**: FIXED — replaced "Expo Starter" with "BabyTrack" in app-tabs.web.tsx
