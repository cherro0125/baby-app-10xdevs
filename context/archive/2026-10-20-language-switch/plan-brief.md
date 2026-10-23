# Language Switch (EN/PL) — Plan Brief

> Full plan: `context/changes/language-switch/plan.md`

## What & Why

The PRD requires the full interface in English and Polish with user-controlled language selection (`prd.md:107`). S-01 shipped i18n infrastructure EN-only and deferred Polish; it was never picked up, so every later slice shipped hardcoded English. This change pays that debt and adds the switch before more screens (sleep-log) pile on.

## Starting Point

`react-i18next` + `expo-localization` are wired in, but only the sign-in screen (5 keys) is translated; ~98 strings (~65 keys) across ~17 files are hardcoded English. Language is picked once from the device at startup. There is no settings screen and no JS test runner.

## Desired End State

A fourth **Settings** tab offers English | Polski and Sign out. Switching changes the whole UI instantly (including tab labels), persists across restarts and sign-out, and defaults to the device language when never chosen. Every product string goes through `t()`, Polish is complete, and Jest guards key parity and hardcoded strings.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scope | All product strings; delete starter-template leftovers | Meets "full interface" and removes untranslated dead code instead of translating it |
| Switch location | New 4th tab "Settings" (language + Sign out) | Fits the existing tab pattern, no nested navigation; Partner gets cleaner |
| Persistence | Device-local (`SecureStore` key `app_language`), default = device language; no-op on web | No backend change, works offline and before sign-in; SecureStore has no web implementation |
| Startup read | Synchronous `SecureStore.getItem` before `i18n.init` | Avoids a first-frame flash of the wrong language |
| Formatting | Clock times follow app language; units/durations from translations | UI language and formats never disagree |
| Milk-type badges | Dedicated translated abbreviation keys | `slice(0,3)` breaks for Polish labels |
| Ordering vs sleep-log | language-switch first; sleep-log UI uses `t()` from day one | No new debt, no conflicts in shared files |
| Verification | Add Jest (jest-expo + Testing Library) with unit, render and guard tests | First test runner; automated guarantee of completeness |

## Scope

**In scope:** typed EN/PL resources, language resolution + persistence, formatters, Settings tab, Sign out move, translation of contractions/feeding/partner/tabs/modals/sheets, template cleanup, Jest setup + tests, lesson entry and sleep-log note.

**Out of scope:** backend locale field, "follow system" option, `CFBundleLocalizations`/native rebuild, 24h picker changes, translating backend errors, sleep-log screens, refactoring duplicate sheets/modals.

## Architecture / Approach

`src/i18n/` becomes the single module: `en.ts` (source of truth) + `pl.ts` typed against its shape, `language.ts` (resolve saved → device → `en`, `setAppLanguage` persists), `format.ts` (locale-aware time/duration helpers), and `CustomTypeOptions` for typed keys. Components re-render via `useTranslation`; `AppTabs` subscribes so native labels update.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. i18n infrastructure + Jest | Typed resources, resolution/persistence, formatters, unit tests | Jest + native-module mocks on SDK 56 |
| 2. Settings tab | EN/PL switch, Sign out moved, translated tab labels | Native tab labels not re-rendering on change |
| 3. Contractions + shared keys | Contraction flow fully bilingual | Medical wording of 5-1-1 banner in Polish |
| 4. Feeding, Partner, cleanup | Remaining screens, milk-type fix, template removal, guard test, lesson | Guard test false positives |

**Prerequisites:** dev client already installed on iPhone (JS-only change, no native rebuild); sleep-log paused until this lands.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Hermes `toLocaleTimeString` honours the passed locale on iOS (assumed; covered by format test + manual check).
- `sf` icon prop on `NativeTabs` works with the installed dev client without rebuild (JS prop on existing native component).
- Polish wording is reviewed by the user during manual verification (no professional translator).

## Success Criteria (Summary)

- A Polish user can use every screen without seeing English, and switch languages in Settings instantly.
- The choice survives restarts and sign-out; new devices start in the device language.
- `npm test` fails if a Polish key is missing or a hardcoded string sneaks into JSX.
