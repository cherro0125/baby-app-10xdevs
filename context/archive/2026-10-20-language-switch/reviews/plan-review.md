<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Language Switch (EN/PL)

- **Plan**: context/changes/language-switch/plan.md
- **Mode**: Deep
- **Date**: 2026-10-20
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding
26/26 paths ✓, 4/4 symbols ✓ (SecureStore.getItem/setItem, getLocales().languageCode, NativeTabs Icon sf/drawable), brief↔plan ✓

## Findings

### F1 — Jest dependency list won't produce a working setup

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — §1 Jest setup
- **Detail**: Unpinned deps. jest-expo 56.0.5 peers `@react-native/jest-preset ^0.85.0` (not installed; `react-native/jest-preset` throws without it) and runs Jest 29 while `latest` jest/@types/jest are 30.x. RNTL 14 needs `test-renderer`; its latest 1.3.x requires react ^19.3 (repo: 19.2.3). RNTL 14 APIs are async.
- **Fix**: Pin jest-expo ~56.0.5, jest ^29.7, @types/jest ^29.5, @react-native/jest-preset ~0.85.3, @testing-library/react-native ^14, test-renderer ~1.2.0; note `await render(...)`; TS setup file for lint.
- **Decision**: FIXED

### F2 — SecureStore throws on web; setAppLanguage unguarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — §3 Language resolution and switching
- **Detail**: `ExpoSecureStore.web.js` is `{}`, so sync `getItem`/`setItem` throw on web. `setAppLanguage` had no guard. jest-expo mock returns `undefined`, not `null`.
- **Fix A ⭐ Recommended**: No-op persistence on web (`Platform.OS` + try/catch in both functions); resolver accepts `undefined`.
  - Strength: Minimal; web is a dev-only target.
  - Tradeoff: Choice doesn't survive reload on web.
  - Confidence: HIGH — same pattern keeps session-provider alive on web.
  - Blind spot: None significant.
- **Fix B**: `storage.ts` + `storage.web.ts` (localStorage).
  - Strength: Full persistence on web.
  - Tradeoff: Extra platform file for an unshipped target.
  - Confidence: HIGH — `.web.ts` files are an existing pattern.
  - Blind spot: SSR needs `typeof window` guard.
- **Decision**: FIXED (Fix A)

### F3 — `tsc` fails on href="/settings" until route types regenerate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — §2 Tabs; Success Criteria 2.2
- **Detail**: `.expo/types/router.d.ts` (gitignored, Metro-generated) lacks `/settings`; TS2322 confirmed in a scratch compile.
- **Fix**: Note in Phase 2 to start Metro before `npx tsc --noEmit`.
- **Decision**: FIXED

### F4 — Android `drawable` fallback for Settings icon unspecified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — §2 Tabs
- **Detail**: Custom drawable names need a resource in gitignored `android/`; otherwise no icon.
- **Fix**: Use `md="settings"`.
- **Decision**: FIXED

### F5 — Progress titles abbreviate Success Criteria bullets

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: ## Progress (1.4, 2.7, 3.4, 4.4, 4.5)
- **Detail**: Titles become immutable after review; five were shortened versions of their bullets.
- **Fix**: Align titles verbatim with the bullets.
- **Decision**: FIXED
