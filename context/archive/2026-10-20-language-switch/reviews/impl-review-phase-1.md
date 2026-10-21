<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Language Switch (EN/PL)

- **Plan**: context/changes/language-switch/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria: `npm test` 23/23 pass, `npx tsc --noEmit` exit 0, `npm run lint` 0 errors / 2 warnings; manual 1.4 confirmed by user on iPhone. package-lock.json change is purely additive (258 dev-only packages, 0 runtime version changes).

## Findings

### F1 — formatClockTime('en') forces US 12h clock on English UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/i18n/format.ts:3
- **Detail**: Current call sites use `toLocaleTimeString([])` (device region). Passing `'en'` yields en-US 12h, so English UI on en-GB/EU devices regresses from 24h to "02:05 PM" once phases 3–4 wire the helper in.
- **Fix A ⭐ Recommended**: Use the device languageTag when its language matches the app language, else `lng`.
  - Strength: Polish UI always 24h; English UI keeps the phone's regional convention.
  - Tradeoff: Helper needs the device tag; one more test.
  - Confidence: HIGH — `getLocales()[0].languageTag` already available.
  - Blind spot: iOS 12/24h override setting still ignored (as today).
- **Fix B**: Leave as-is (en = en-US 12h).
  - Strength: Zero work; literal plan decision.
  - Tradeoff: Regression for non-US English users.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F2 — Jest mocks keep call history between tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json ("jest" config)
- **Detail**: No `clearMocks`; `jest.fn` call history from jest.setup.ts accumulates within a file, so `toHaveBeenCalledWith` can pass due to an earlier test.
- **Fix**: Add `"clearMocks": true` to the jest config.
- **Decision**: FIXED

### F3 — Plan text inconsistent about phase 1 keys

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md — Phase 1 §2 Contract
- **Detail**: Plan says phase 1 seeds common/settings/tabs/format keys, but common.* is phase 3 and settings/tabs phase 2; code correctly added only format.*.
- **Fix**: Reword to "Phase 1 seeds signIn.* and format.*; later phases add their own keys to both locales".
- **Decision**: FIXED

### F4 — Duration helpers assume integers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/format.ts:7-14
- **Detail**: `formatDurationSeconds(t, 65.4)` → "1m 5.400000000000006s".
- **Fix**: Round/floor inputs inside the helpers.
- **Decision**: FIXED

### F5 — New lint warning in language.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/i18n/language.ts:34
- **Detail**: `import/no-named-as-default-member` on `i18n.changeLanguage`, same false-positive class as the pre-existing one in index.ts.
- **Fix**: Leave as-is, or use the named `changeLanguage` export from 'i18next'.
- **Decision**: FIXED
