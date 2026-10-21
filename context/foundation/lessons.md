# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always use typed route strings from expo-router

- **Context**: Expo Router navigation
- **Problem**: Runtime crash on navigation
- **Rule**: Always use typed route strings from expo-router
- **Applies to**: plan, implement, impl-review

## All user-visible strings go through `t()` with EN and PL keys

- **Context**: Any UI work (screens, components, modals, error messages, placeholders, accessibility labels)
- **Problem**: S-01 deferred Polish and every later slice shipped hardcoded English, so the PRD's EN/PL requirement needed a dedicated retrofit change (`language-switch`)
- **Rule**: Render every user-visible string via `t()` from `react-i18next`; add the key to both `src/i18n/locales/en.ts` and `pl.ts` in the same change; format times/durations/amounts with `src/i18n/format.ts`. `src/__tests__/no-hardcoded-strings.test.ts` and the locale parity test enforce this
- **Applies to**: plan, implement, impl-review
