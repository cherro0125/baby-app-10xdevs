<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Language Switch (EN/PL)

- **Plan**: context/changes/language-switch/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-10-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated: `npm test` 5 suites / 35 tests pass; `npx tsc --noEmit` exit 0; `npm run lint` 0 errors, 1 pre-existing warning (`src/i18n/index.ts:10`). Manual: all Progress rows confirmed by the user on iPhone. Earlier phase reviews' FIXED decisions verified present in code.

## Findings

### F1 — Partner errors stored as translated text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(app)/partner.tsx:49,51,61,84,86,88,104
- **Detail**: `setCodeError(t(...))` / `setInviteError(t(...))` keep already-translated strings in state — the pattern Phase 3 review F4 fixed in the time-edit sheets. Tabs stay mounted, so an error shown before switching language in Settings stays in the old language until the user types again.
- **Fix**: Store an error key (`'expired' | 'notFound' | 'codeLength' | 'alreadyLinked' | 'generic'`, plus a boolean for the invite error) and call `t()` at render.
- **Decision**: FIXED (CodeError key + inviteFailed flag, t() at render)

### F2 — Hardcoded-string guard: false positives on comparisons, undocumented blind spots

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/no-hardcoded-strings.test.ts:26-32
- **Detail**: `literalsIn` descends into every binary expression, so `{status === 'alert' && <X/>}` would report `"alert"` and fail CI for a non-visible string. It also misses literals routed outside JSX (lookup maps like the old `MILK_TYPE_LABELS`, `setState('…')`, `Alert.alert`, `accessibilityHint`, `.ts` files). Nothing leaks today (grep confirmed), but the test reads as complete coverage.
- **Fix**: Walk only `&&`, `||`, `??`, `+` operators; add `accessibilityHint` to `TEXT_PROPS`; add a comment listing what the guard does not catch.
  - Strength: Removes the realistic false positive and makes the guard's limits explicit for future slices (sleep-log).
  - Tradeoff: Still a heuristic; blind spots remain by design.
  - Confidence: HIGH — small, self-tested change (fixture test already exists).
  - Blind spot: Full static coverage (state setters, maps) would need type-aware analysis — not attempted.
- **Decision**: FIXED (rendering operators only, accessibilityHint, comparison fixture, blind-spot comment)

### F3 — Template cleanup left orphaned assets and unused dependencies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: assets/images/{react-logo*.png,tutorial-web.png,expo-badge*.png}; package.json:23,25; app.json:53
- **Detail**: These images were referenced only by the deleted `explore.tsx` / `web-badge.tsx`. `expo-web-browser` (dep + config plugin) and `expo-symbols` have no remaining imports.
- **Fix**: Delete the six orphaned images now; record removal of `expo-web-browser` / `expo-symbols` in change.md notes for the next native rebuild (removing native deps needs a new dev client).
- **Decision**: FIXED (6 PNGs deleted; native-dep removal noted in change.md)

### F4 — Clock format for English UI on a Polish-region device is 12h

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/i18n/format.ts:5-12
- **Detail**: Intended (Phase 1 Fix A): a pl-PL device with English selected shows "02:05 PM"; before the change `toLocaleTimeString([])` gave 24h. For the main audience (Polish couples) this may be surprising.
- **Fix A ⭐ Recommended**: Accept as designed (clock follows app language).
  - Strength: Matches plan ("Clock times follow the app language"); covered by format.test.ts:21.
  - Tradeoff: Polish-region users choosing English see 12h.
  - Confidence: MED — depends on user preference.
  - Blind spot: No user feedback yet.
- **Fix B**: Keep the language's text but take 12h/24h from the device (`getCalendars()[0].uses24hourClock` → `hourCycle`).
  - Strength: Respects the device's clock setting regardless of language.
  - Tradeoff: Deviates from the plan; one more expo-localization dependency in format.ts and new tests.
  - Confidence: MED — API exists in expo-localization, not verified on device.
  - Blind spot: Web behaviour of `getCalendars`.
- **Decision**: ACCEPTED (Fix A — clock follows app language, as planned)

### F5 — Time-edit sheets are near-duplicates; feeding copy lacks explanatory comments

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/feeding-time-edit-sheet.tsx vs src/components/time-edit-sheet.tsx:42,56,66-67
- **Detail**: Files now differ only in entity names and three comments (lazy initialisers, PATCH limitation, midnight crossing). Merging is out of scope per the plan; the Phase 3 F2 drift shows the cost of double edits.
- **Fix**: Copy the three comments into the feeding sheet; consider a merged sheet in the upcoming feeding-edit change.
- **Decision**: FIXED (comments copied; PATCH note reworded — feeding PATCH accepts startedAt)

### F6 — milk-types.ts states the same mapping twice

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/milk-types.ts:3-19
- **Detail**: `MILK_TYPES` and `MILK_TYPE_KEYS` duplicate the value→key mapping; `MilkTypeKey` is hand-typed instead of derived from the locale.
- **Fix**: Type `MilkTypeKey` as `keyof typeof en.feeding.milkType` and derive `MILK_TYPE_KEYS` from `MILK_TYPES`.
- **Decision**: FIXED (MilkTypeKey from locale, MILK_TYPES derived from MILK_TYPE_KEYS)

### F7 — Polish copy: long milk-type labels and gendered "partnera"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/i18n/locales/pl.ts (feeding.milkType.formula/pumped, partner.invite, partner.linkPrompt); src/components/feeding-completion-sheet.tsx:66-70
- **Detail**: "Modyfikowane" (12 chars) / "Odciągnięte" in a 4-segment control (~79pt per segment on iPhone SE) may wrap mid-word; verified OK on iPhone 16 Pro Max only. "Zaproś partnera" / "Połączyć z partnerem?" assume a male partner.
- **Fix**: Add `numberOfLines={1}` + `adjustsFontSizeToFit` to segment labels; partner wording is a product call (e.g. "Zaproś drugą osobę").
- **Decision**: FIXED (numberOfLines={1} + adjustsFontSizeToFit on segment labels; partner wording kept)

### F8 — Partner title now centred, Settings title left-aligned

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(app)/partner.tsx:140,202
- **Detail**: Removing `titleRow` (Phase 2) leaves the title under `container.alignItems: 'center'`; on main it was left-aligned via the full-width row. Sibling tabs now differ.
- **Fix**: Add `alignSelf: 'flex-start'` to the Partner titles, or accept centred.
- **Decision**: FIXED (alignSelf: flex-start on Partner titles)

### F9 — language.test spy depends on i18next's CommonJS build

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/__tests__/language.test.ts:78
- **Detail**: `jest.spyOn(i18n, 'changeLanguage')` intercepts the named import in language.ts only because Jest resolves i18next's CJS build; an ESM resolution would bypass the spy.
- **Fix**: Mock via `jest.mock('i18next', …)` for that case, or leave as is with a comment.
- **Decision**: FIXED (explanatory comment)

### F10 — Feeding edit can only change times (user-reported)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/hooks/use-feedings.ts:287; src/components/feeding-time-edit-sheet.tsx
- **Detail**: Pre-existing gap surfaced during manual testing: milk type, amount and note of an existing feeding can't be edited. Out of scope for language-switch.
- **Fix**: Open a separate change (`/10x-new`, e.g. `feeding-edit-details`) after this one closes — user already chose this.
- **Decision**: DEFERRED (separate change, per user)
