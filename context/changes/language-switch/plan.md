# Language Switch (EN/PL) Implementation Plan

## Overview

Close the PRD requirement "The full app interface is available in English and Polish. Language selection is user-controlled" (`context/foundation/prd.md:107`). S-01 shipped the i18n infrastructure EN-only and deferred Polish "until before S-02"; that never happened and every later slice shipped hardcoded English. This change moves every product string through `react-i18next`, adds a complete Polish translation, adds a fourth **Settings** tab with an EN/PL switch persisted on the device (default: device language), moves Sign out there, and introduces the app's first test runner (Jest) to guard translation completeness.

## Current State Analysis

- `src/i18n/index.ts` initialises i18next synchronously at module load with `resources: { en }`, `lng` from `getLocales()[0].languageTag.slice(0, 2)`, `fallbackLng: 'en'`. Language is fixed at startup and cannot be changed by the user.
- `src/i18n/locales/en.ts` holds only 5 `signIn.*` keys (`as const`). Only `src/app/sign-in.tsx` uses `useTranslation`.
- ~98 hardcoded product strings (~65 unique keys) across ~17 files: `partner.tsx` (25), tab labels in `app-tabs.tsx` / `app-tabs.web.tsx`, contraction components (timer, list, row, banner, modal, time-edit sheet), feeding components (timer, list, row, completion sheet, modal, time-edit sheet), `Loading…` in three screens.
- Times are rendered with `toLocaleTimeString([], …)` (device region, not app language) in `contraction-row.tsx:85`, `feeding-row.tsx:102`, `time-edit-sheet.tsx:91`, `feeding-time-edit-sheet.tsx:87`. Durations use English unit letters (`contraction-row.tsx:19-30`, `feeding-row.tsx:33-37`).
- `feeding-row.tsx:132` derives milk-type badges via `label.slice(0,3).toUpperCase()` — produces garbage for Polish labels. Milk-type labels are duplicated in `feeding-row.tsx:27-30` and `feeding-completion-sheet.tsx:17-20`.
- No settings screen exists; Sign out lives in `partner.tsx` `titleRow` (linked :140-145, unlinked :207-212).
- Persistence: only `expo-secure-store` (session keys in `src/auth/session-provider.tsx:11-12`); no key-value helper, no AsyncStorage.
- Starter-template leftovers still in the tree: `src/app/(app)/explore.tsx` (reachable at `/explore`), `components/hint-row.tsx`, `components/web-badge.tsx`, `components/ui/collapsible.tsx`, `components/external-link.tsx`, and the "Docs" link in `app-tabs.web.tsx`. They reference only each other.
- No JS test runner: no jest, no test script, no tests in `src/`.
- Backend: no user-facing text reaches the UI (client maps HTTP statuses to its own strings), so no backend change is needed.

## Desired End State

- Every user-visible product string is rendered via `t()`; `en.ts` and `pl.ts` contain the same key set (enforced by TypeScript and by a Jest test).
- A fourth tab **Settings / Ustawienia** shows a language selector (English | Polski) and the Sign out action. Tapping a language switches the whole UI immediately (including tab labels) without restart, and the choice survives app restart and sign-out.
- With no saved choice, the app uses the device language if it is Polish, otherwise English.
- Clock times follow the app language; durations and units come from translations.
- Template leftovers are gone; `/explore` no longer exists.
- `npm test` runs Jest (key parity, language resolution, formatters, Settings screen behaviour, hardcoded-string guard) and passes.

Verify: `npm test`, `npx tsc --noEmit`, `npm run lint`, then walk every screen on the iPhone in both languages.

### Key Discoveries:

- `expo-secure-store` exposes synchronous `getItem` / `setItem` (`node_modules/expo-secure-store/build/SecureStore.d.ts:133,144`) — lets the existing synchronous i18n init read the saved language without a first-frame flash of the wrong language.
- `NativeTabs.Trigger.Icon` accepts `sf` (iOS SF Symbol) and `drawable` (Android) besides `src` (`node_modules/expo-router/build/native-tabs/common/elements.d.ts:84,141`) — Settings tab needs no new PNG asset.
- i18next 26 / react-i18next 17 support typed keys via `CustomTypeOptions` module augmentation.
- Prior convention (archived `context/archive/2026-07-10-google-auth/plan.md:185-187,301`): nested keys per screen (`signIn.error.generic`), single `translation` namespace, synchronous init, "all user-facing strings via `useTranslation()`".
- `jest-expo@~56.0.5` matches SDK 56.
- Lesson in `context/foundation/lessons.md`: always use typed route strings — applies to the new `settings` route.

## What We're NOT Doing

- No backend changes (no `locale` column, no profile endpoint); preference is per device.
- No "follow system language" option in the selector — only English | Polski; the device language is just the initial default.
- No `CFBundleLocalizations` / native rebuild — system dialogs (share sheet, Google account picker) keep following the OS language.
- No change to the 24-hour hour/minute pickers in the time-edit sheets.
- No translation of backend `ProblemDetail` messages (never shown in UI).
- No refactor merging the near-duplicate time-edit sheets / incomplete-session modals beyond what translation needs (shared keys only). The milk-type map is merged because the badge fix requires it.
- No translations for the sleep-log UI (not built yet) — sleep-log's plan gets a note to use `t()` with EN+PL from the start.

## Implementation Approach

Infrastructure first (typed resources, language resolution, persistence, formatters, Jest), then the user-visible switch (Settings tab), then migrate strings screen-group by screen-group. Every phase leaves the app working: until a component is migrated it keeps its English literal, and once the Settings tab exists the switch already changes migrated parts. `pl.ts` is typed against the shape of `en.ts`, so adding an English key without its Polish counterpart fails `tsc` immediately.

## Critical Implementation Details

**Timing & lifecycle** — the saved language must be read synchronously inside `src/i18n/index.ts` (via `SecureStore.getItem`) before `i18n.init`, because `_layout.tsx` imports `@/i18n` at module load and the first frame (sign-in or splash-hidden tabs) would otherwise render in the device language and then flip. Don't move resolution into an effect.

**State sequencing** — `setAppLanguage` must persist only after `i18n.changeLanguage` resolves for a supported language; never persist an unsupported code. Components re-render through `useTranslation`'s `languageChanged` subscription — `AppTabs` must call `useTranslation()` itself so native tab labels update.

## Phase 1: i18n infrastructure and Jest

### Overview

Make i18n switchable and typed, add language resolution/persistence and locale-aware formatters, and set up Jest with unit tests. No visible UI change yet.

### Changes Required:

#### 1. Jest setup

**File**: `package.json`, `jest.config.js` (or `"jest"` key in package.json), `jest.setup.ts`

**Intent**: Add the first JS test runner using the Expo preset, with mocks for native modules used by the code under test.

**Contract**: devDependencies pinned as a working set (verified against React 19.2.3 / RN 0.85.3): `jest-expo@~56.0.5`, `jest@^29.7.0`, `@types/jest@^29.5.14` (jest-expo runs Jest 29 — do not let `latest` pull Jest 30), `@react-native/jest-preset@~0.85.3` (peer of jest-expo; `react-native/jest-preset` throws without it), `@testing-library/react-native@^14`, `test-renderer@~1.2.0` (RNTL 14 renderer; 1.3.x requires react ^19.3 and conflicts). RNTL 14 APIs are async — render tests use `await render(...)`. Write setup files in TypeScript (`jest.setup.ts`): ESLint disables `no-undef` only for TS files, so a JS setup using `jest.mock` would fail lint. Script `"test": "jest"`. Preset `jest-expo`. Setup file mocks `expo-secure-store` (in-memory `getItem`/`setItem`/async variants) and `expo-localization.getLocales`. Path alias `@/` resolves in tests (jest-expo honours tsconfig paths via babel-preset-expo; add `moduleNameMapper` if not).

#### 2. Typed translation resources

**File**: `src/i18n/locales/en.ts`, `src/i18n/locales/pl.ts` (new), `src/i18n/types.ts` (new), `src/i18n/i18next.d.ts` (new)

**Intent**: `en.ts` remains the source of truth; `pl.ts` must have exactly the same keys with string values; `t()` keys are type-checked.

**Contract**: `types.ts` exports `TranslationShape` = `en` with every leaf widened to `string` (recursive mapped type) and `AppLanguage = 'en' | 'pl'`, `SUPPORTED_LANGUAGES`. `pl.ts` exports `const pl: TranslationShape`. `i18next.d.ts` augments `CustomTypeOptions` with `defaultNS: 'translation'` and `resources: { translation: typeof en }`. Phase 1 seeds `pl.ts` with the existing `signIn.*` keys plus the `common.*` / `settings.*` / `tabs.*` / `format.*` keys introduced in phases 1–2.

#### 3. Language resolution and switching

**File**: `src/i18n/index.ts`, `src/i18n/language.ts` (new)

**Intent**: Initial language = saved preference → device language (if supported) → `en`; expose a function to change and persist it.

**Contract**: `language.ts` exports `LANGUAGE_STORAGE_KEY = 'app_language'`, pure `resolveInitialLanguage(saved: string | null | undefined, deviceLanguageCode: string | null | undefined): AppLanguage` (the jest-expo SecureStore mock returns `undefined`, not `null`), `getSavedLanguage(): AppLanguage | null` (sync `SecureStore.getItem`; returns null on web and on any error), and `setAppLanguage(lng: AppLanguage): Promise<void>` (changeLanguage, then persist; persistence is a no-op on web and wrapped in try/catch so a storage failure never breaks the switch). `expo-secure-store` has no web implementation (`ExpoSecureStore.web.js` is `{}`, so `getItem`/`setItem` throw) — guard both with `Platform.OS !== 'web'` plus try/catch; on web the choice simply doesn't survive a reload. `index.ts` registers `en` + `pl` resources, `supportedLngs: SUPPORTED_LANGUAGES`, `fallbackLng: 'en'`, `lng: resolveInitialLanguage(getSavedLanguage(), getLocales()[0]?.languageCode ?? null)`. Device language uses `languageCode`, not `languageTag.slice`.

#### 4. Locale-aware formatters

**File**: `src/i18n/format.ts` (new)

**Intent**: One place for formatting that depends on the app language, replacing ad-hoc formatting in rows/sheets in later phases.

**Contract**: `formatClockTime(date: Date | number, lng: string): string` (`hour: '2-digit', minute: '2-digit'` with the given locale). Duration helpers take `t` (or use `i18n.t`) and return translated strings for minutes+seconds (`format.minSec`), minutes (`format.min`), hours+minutes (`format.hMin`) and ml amount (`format.ml`), using interpolation (`{{m}}`, `{{s}}`, `{{h}}`, `{{amount}}`).

#### 5. Unit tests

**File**: `src/i18n/__tests__/locales.test.ts`, `src/i18n/__tests__/language.test.ts`, `src/i18n/__tests__/format.test.ts`

**Intent**: Guard key parity and the resolution/persistence rules.

**Contract**:
- locales: flattened key sets of `en` and `pl` are equal; every `pl` value is a non-empty string; `{{placeholders}}` per key are identical in both.
- language: saved `pl` beats device `en`; invalid saved value falls back to device; device `pl-PL` → `pl`; device `de` → `en`; null/null → `en`; `setAppLanguage('pl')` changes `i18n.language` and writes `app_language`.
- format: `formatClockTime` for `pl` yields 24h (`14:05`); duration helpers interpolate in both languages.

### Success Criteria:

#### Automated Verification:

- Jest runs and all tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- App still launches on iPhone and sign-in screen shows in the device language (no visible regression)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Settings tab with language switch

### Overview

Add the user-visible switch: a fourth Settings tab with English | Polski and Sign out; translate tab labels; remove Sign out from Partner.

### Changes Required:

#### 1. Settings screen

**File**: `src/app/(app)/settings.tsx` (new)

**Intent**: Screen with title, a "Language" section showing two options (each label in its own language: "English", "Polski", active one highlighted) and a Sign out action (from `useSession().signOut`).

**Contract**: Route `/settings` (typed route). Uses `ThemedText` / `ThemedView`, `Spacing`, `useTheme` — no hardcoded colors; layout follows `partner.tsx` conventions (`SafeAreaView`, `BottomTabInset` padding). Tapping an option calls `setAppLanguage`. Keys under `settings.*` (`title`, `language`, `signOut`).

#### 2. Tabs

**File**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: Add a fourth `settings` trigger and translate all tab labels so they update on language change.

**Contract**: `AppTabs` calls `useTranslation()`; labels `tabs.contractions`, `tabs.feeding`, `tabs.partner`, `tabs.settings`. Native Settings icon via `NativeTabs.Trigger.Icon` `sf` (`{ default: 'gearshape', selected: 'gearshape.fill' }`) plus `md="settings"` for Android (a custom `drawable` would need a resource in the gitignored `android/` folder). Web: add `<TabTrigger name="settings" href="/settings">`. Typed routes: `.expo/types/router.d.ts` is generated by Metro and doesn't know `/settings` yet, so `npx tsc --noEmit` reports TS2322 on that href until Metro (`npx expo start --dev-client`) has run once after creating `settings.tsx` — start Metro before running the type check.

#### 3. Remove Sign out from Partner

**File**: `src/app/(app)/partner.tsx`

**Intent**: Sign out now lives only in Settings; Partner title row keeps just the title.

**Contract**: `useSession` import/usage removed if unused; `titleRow` style simplified if no longer needed.

#### 4. Settings screen test

**File**: `src/app/(app)/__tests__/settings.test.tsx`

**Intent**: Verify behaviour, not styling.

**Contract**: Renders the screen with `useSession` mocked; asserts English labels by default; pressing "Polski" switches rendered texts to Polish and persists `app_language = 'pl'`; pressing Sign out calls `signOut`.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Fourth tab "Settings" with gear icon is visible on iPhone
- Switching to Polski immediately changes tab labels and the Settings screen; switching back works
- Language choice survives killing and relaunching the app
- Sign out from Settings returns to the sign-in screen, which is shown in the chosen language
- Partner screen no longer shows Sign out

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Migrate contractions and shared strings

### Overview

Translate the contraction flow and introduce shared `common.*` keys reused by Phase 4.

### Changes Required:

#### 1. Shared keys

**File**: `src/i18n/locales/en.ts`, `src/i18n/locales/pl.ts`

**Intent**: Shared vocabulary used by both flows.

**Contract**: `common.*`: `loading`, `cancel`, `confirm`, `save`, `delete`, `confirmDelete`, `stop`, `start`, `end`, `addNote`, `you`, `continueTiming`, `endNow`; `timeEdit.*`: `title`, `stopFirst`, `endAfterStart`.

#### 2. Contraction components

**File**: `src/app/(app)/index.tsx`, `src/components/contraction-timer.tsx`, `contraction-list.tsx`, `contraction-row.tsx`, `five-one-one-banner.tsx`, `incomplete-contraction-modal.tsx`, `time-edit-sheet.tsx`

**Intent**: Replace every literal with `t()`; `five-one-one-banner` `LABELS` map becomes status → key; row times use `formatClockTime(…, i18n.language)`; durations and "X min apart" / "first logged" use the Phase 1 helpers / interpolated keys.

**Contract**: Keys under `contractions.*` (`startButton`, `strength`, `empty`, `apart` with `{{min}}`, `firstLogged`, `banner.none|recording|goNow`, `incomplete.title|body`). Polish strings for the banner keep the medical meaning exact ("Wykryto wzorzec — może być czas jechać do szpitala").

### Success Criteria:

#### Automated Verification:

- All tests pass (including key parity): `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Contractions tab fully Polish after switching: timer, strength, note placeholder, list, row (times 24h, "X min odstępu"), 5-1-1 banner states, delete confirm, edit-times sheet incl. validation error, incomplete-contraction modal
- Switching back to English restores all texts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Migrate feeding and partner, remove template leftovers

### Overview

Translate the remaining screens, fix the milk-type badge, delete starter-template code, add a hardcoded-string guard test, and record the i18n rule for future work.

### Changes Required:

#### 1. Milk types

**File**: `src/components/milk-types.ts` (new) or `src/i18n` keys only; `feeding-row.tsx`, `feeding-completion-sheet.tsx`

**Intent**: One source for milk-type options; labels and badge abbreviations come from translations instead of `slice(0,3)`.

**Contract**: `feeding.milkType.<breast|formula|pumped|other>` and `feeding.milkTypeShort.<…>` (EN: BRE/FOR/PUM/OTH, PL chosen to be meaningful, e.g. PIE/MOD/ODC/INN). Both components use the shared list.

#### 2. Feeding components

**File**: `src/app/(app)/feeding-log.tsx`, `feeding-timer.tsx`, `feeding-list.tsx`, `feeding-row.tsx`, `feeding-completion-sheet.tsx`, `feeding-time-edit-sheet.tsx`, `incomplete-feeding-modal.tsx`

**Intent**: All literals via `t()`, reusing `common.*` / `timeEdit.*`; times via `formatClockTime`, durations and ml via format helpers.

**Contract**: Keys under `feeding.*` (`startButton`, `empty`, `details`, `amountPlaceholder`, `incomplete.title|body`).

#### 3. Partner screen

**File**: `src/app/(app)/partner.tsx`

**Intent**: Translate all states and the status-code error messages.

**Contract**: Keys under `partner.*` (`title`, `unlink`, `unlinkConfirm`, `linkPrompt`, `accept`, `linking`, `decline`, `inviteCode`, `shareInvite`, `invite`, `orEnterCode`, `link`, `errors.expired|notFound|codeLength|alreadyLinked|generic|inviteFailed`). Placeholder `ABCD1234` stays literal.

#### 4. Remove template leftovers

**File**: delete `src/app/(app)/explore.tsx`, `src/components/hint-row.tsx`, `src/components/web-badge.tsx`, `src/components/ui/collapsible.tsx`, `src/components/external-link.tsx`, unreferenced `assets/images/tabIcons/explore*.png`; edit `src/components/app-tabs.web.tsx`

**Intent**: Drop untranslated demo content instead of translating it.

**Contract**: Remove the "Docs" link (and `ExternalLink` import) from `app-tabs.web.tsx`; "BabyTrack" brand stays literal. Nothing else imports the deleted files (verified by `tsc`).

#### 5. Hardcoded-string guard test

**File**: `src/__tests__/no-hardcoded-strings.test.ts`

**Intent**: Prevent regressions (the failure mode that caused this change).

**Contract**: Scans `src/**/*.tsx` (excluding `__tests__`) for JSX text nodes and `placeholder` / `label` / `title` / `accessibilityLabel` string-literal props containing letters; fails listing file:line. Small explicit allowlist (`BabyTrack`, `ABCD1234`, `English`, `Polski`).

#### 6. Record the rule

**File**: `context/foundation/lessons.md`, `context/changes/sleep-log/change.md`

**Intent**: Future slices (starting with sleep-log UI) must add EN+PL keys from the start.

**Contract**: Append a lesson "All user-visible strings go through `t()` with EN and PL keys" (Applies to: plan, implement, impl-review). Add a note in sleep-log's `## Notes` that its UI phases must use `t()` with EN+PL keys.

### Success Criteria:

#### Automated Verification:

- All tests pass, including the hardcoded-string guard: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Feeding tab fully Polish: timer, list, row (badge abbreviations, times, durations, ml), completion sheet, edit-times sheet, incomplete-feeding modal, delete confirm
- Partner tab fully Polish in all three states (unlinked with invite code, confirm-invite via deep link, linked with unlink confirmation) and error messages (e.g. wrong code)
- `/explore` no longer reachable; no English text left anywhere when Polish is selected
- English mode unchanged versus before the change

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Key parity EN↔PL, non-empty values, identical interpolation placeholders
- `resolveInitialLanguage` precedence and fallbacks; `setAppLanguage` persistence
- `formatClockTime` and duration helpers in both languages

### Integration Tests:

- Settings screen render test: default English, switch to Polish re-renders and persists, Sign out invokes session
- Static guard against hardcoded JSX strings

### Manual Testing Steps:

1. Fresh install on a Polish-language iPhone → app starts in Polish; on an English one → English.
2. Settings → Polski → every tab and modal in Polish; kill app → relaunch → still Polish.
3. Sign out → sign-in screen in Polish → sign in again → still Polish.
4. Walk contraction and feeding flows end-to-end in Polish (start/stop, edit times with invalid range, incomplete-session modals, delete).
5. Partner: generate invite, enter wrong code, accept invite, unlink — all in Polish.
6. Switch back to English and repeat a quick pass.

## Performance Considerations

Negligible: two small in-memory resource objects, synchronous SecureStore read once at startup.

## Migration Notes

No data migration. Existing users without a saved preference keep today's behaviour (device language, English fallback) — the only difference is that Polish devices now actually get Polish.

## References

- PRD requirement: `context/foundation/prd.md:107`
- Roadmap S-01 i18n deferral: `context/foundation/roadmap.md:74,82`
- Prior i18n decisions: `context/archive/2026-07-10-google-auth/plan.md:185-187,301`, `plan-brief.md:26-27`
- Current i18n init: `src/i18n/index.ts`
- Tabs: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`
- Sign out today: `src/app/(app)/partner.tsx:140-145,207-212`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: i18n infrastructure and Jest

#### Automated

- [x] 1.1 Jest runs and all tests pass
- [x] 1.2 Type checking passes
- [x] 1.3 Linting passes

#### Manual

- [x] 1.4 App still launches on iPhone and sign-in screen shows in the device language (no visible regression)

### Phase 2: Settings tab with language switch

#### Automated

- [ ] 2.1 All tests pass
- [ ] 2.2 Type checking passes
- [ ] 2.3 Linting passes

#### Manual

- [ ] 2.4 Fourth tab "Settings" with gear icon is visible on iPhone
- [ ] 2.5 Switching to Polski immediately changes tab labels and the Settings screen; switching back works
- [ ] 2.6 Language choice survives killing and relaunching the app
- [ ] 2.7 Sign out from Settings returns to the sign-in screen, which is shown in the chosen language
- [ ] 2.8 Partner screen no longer shows Sign out

### Phase 3: Migrate contractions and shared strings

#### Automated

- [ ] 3.1 All tests pass (including key parity)
- [ ] 3.2 Type checking passes
- [ ] 3.3 Linting passes

#### Manual

- [ ] 3.4 Contractions tab fully Polish after switching: timer, strength, note placeholder, list, row (times 24h, "X min odstępu"), 5-1-1 banner states, delete confirm, edit-times sheet incl. validation error, incomplete-contraction modal
- [ ] 3.5 Switching back to English restores all texts

### Phase 4: Migrate feeding and partner, remove template leftovers

#### Automated

- [ ] 4.1 All tests pass, including the hardcoded-string guard
- [ ] 4.2 Type checking passes
- [ ] 4.3 Linting passes

#### Manual

- [ ] 4.4 Feeding tab fully Polish: timer, list, row (badge abbreviations, times, durations, ml), completion sheet, edit-times sheet, incomplete-feeding modal, delete confirm
- [ ] 4.5 Partner tab fully Polish in all three states (unlinked with invite code, confirm-invite via deep link, linked with unlink confirmation) and error messages (e.g. wrong code)
- [ ] 4.6 /explore no longer reachable; no English text left when Polish is selected
- [ ] 4.7 English mode unchanged versus before the change
