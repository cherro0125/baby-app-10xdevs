<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Language Switch (EN/PL)

- **Plan**: context/changes/language-switch/plan.md
- **Scope**: Phase 2 of 4 (uncommitted working tree on top of 3198bcf)
- **Date**: 2026-10-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria: `npm test` 32/32 pass (no act warnings), `npx tsc --noEmit` exit 0, `npm run lint` 0 errors / 1 pre-existing warning. Manual 2.4–2.5 observed by user on iPhone; 2.6–2.8 pending.

## Findings

### F1 — Language options expose `selected` instead of `checked`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/settings.tsx:31-38
- **Detail**: Options use `accessibilityRole="radio"` with `accessibilityState={{ selected }}`; for radios RN maps state via `checked` (Android RadioButton checkable state). The container has no `radiogroup` role.
- **Fix**: Use `accessibilityState={{ checked: selected }}`, add `accessibilityRole="radiogroup"` to the options container, assert with `toBeChecked()` in the test.
- **Decision**: FIXED

### F2 — Plan not updated for the test location and CSS mapper

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md — Phase 2 §4; package.json (jest.moduleNameMapper), jest.style-mock.js
- **Detail**: Plan puts the test at `src/app/(app)/__tests__/settings.test.tsx`; expo-router's `EXPO_ROUTER_CTX_IGNORE` would bundle it as a route, so it lives at `src/__tests__/settings.test.tsx`. The `\.css$` → `jest.style-mock.js` mapper (needed because `theme.ts` imports `global.css`) is unplanned. Both are justified but the plan still says otherwise.
- **Fix**: Amend Phase 2 §4 path in the plan and note the CSS mapper; add "tests never live under src/app/" to Critical Implementation Details.
- **Decision**: FIXED

### F3 — Switch test can't catch "all options highlighted"; nested act

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/settings.test.tsx:36,41,48
- **Detail**: After pressing Polski only the Polski radio is asserted; English could stay highlighted unnoticed. `await act(() => fireEvent.press(...))` nests act — RNTL 14's `fireEvent.press` is already async-act wrapped.
- **Fix**: Assert English is no longer checked; use `await fireEvent.press(...)` directly.
- **Decision**: FIXED

### F4 — In-memory SecureStore leaks values between tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: jest.setup.ts:3
- **Detail**: The mock's `Map` keeps `app_language='pl'` after the switch test; `clearMocks` resets only call history. Harmless now, order-dependent later.
- **Fix**: Clear the store in a global `afterEach` (e.g. `setupFilesAfterEach`-style hook in jest.setup via an exported reset).
- **Decision**: FIXED

### F5 — Dropped promise from setAppLanguage

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/settings.tsx:39
- **Detail**: `onPress={() => setAppLanguage(lng)}` ignores the promise; a rejection from `changeLanguage` would be unhandled (unlikely with bundled resources).
- **Fix**: Catch and warn inside `setAppLanguage` around `changeLanguage`, so every caller is safe.
- **Decision**: FIXED

### F6 — Sign out is one tap away under the language options

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/(app)/settings.tsx:51-57
- **Detail**: Full-width Sign out row sits right below the language rows and acts immediately (same as old partner.tsx behaviour, but there it was a small text link in the title row).
- **Fix A**: Add an inline confirm step (like partner's `unlinkPending`).
  - Strength: Prevents accidental sign-out, reuses an existing in-app pattern.
  - Tradeoff: One more tap; new keys `settings.signOutConfirm` etc. in both locales; test update.
  - Confidence: HIGH — pattern exists in partner.tsx.
  - Blind spot: Not in plan scope.
- **Fix B ⭐ Recommended**: Keep one-tap, add vertical spacing to separate it from the language section.
  - Strength: Matches previous behaviour and plan; sign-in is a single Google tap away anyway.
  - Tradeoff: Accidental taps still possible, just less likely.
  - Confidence: MEDIUM — depends on how the user feels about it on device.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B)
