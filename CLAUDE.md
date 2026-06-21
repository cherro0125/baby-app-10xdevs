# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BabyTrack — a React Native / Expo app for contraction tracking during labor and post-birth baby care coordination between partners. See `@context/foundation/prd.md` for full product requirements and `@context/foundation/tech-stack.md` for stack rationale.

## Commands

```bash
npm start          # start Expo dev server (opens QR / simulator picker)
npm run ios        # start in iOS simulator
npm run android    # start in Android emulator
npm run web        # start in browser
npm run lint       # run ESLint via expo lint
```

No test runner is configured yet. `npm run reset-project` moves starter code to `app-example/` and creates a blank `src/app/` — destructive, confirm before running.

> **Critical**: Expo v56 changed many APIs. Always check https://docs.expo.dev/versions/v56.0.0/ before writing Expo-specific code.

## Architecture

### Routing

Expo Router with file-based routing. All routes live under `src/app/`. The root layout (`src/app/_layout.tsx`) wraps everything in `ThemeProvider` + animated splash + tab navigator.

### Path aliases

`@/*` → `./src/*` and `@/assets/*` → `./assets/*` (configured in `tsconfig.json`).

### Platform-specific files

Files with a `.web.tsx` / `.web.ts` suffix override the default on web. Current examples:
- `src/components/app-tabs.web.tsx` — web tab bar (replaces `NativeTabs` with a web-compatible version)
- `src/components/animated-icon.web.tsx`
- `src/hooks/use-color-scheme.web.ts`

### Theme system

All design tokens live in `src/constants/theme.ts`:
- `Colors` — `light` and `dark` palettes with named semantic keys (`text`, `background`, `backgroundElement`, `backgroundSelected`, `textSecondary`)
- `Fonts` — platform-specific font stack (`ios` / `web` / `default`)
- `Spacing` — numeric scale (`half`=2, `one`=4, `two`=8, `three`=16, `four`=24, `five`=32, `six`=64)
- `BottomTabInset`, `MaxContentWidth` — layout constants

Use `useTheme()` (from `src/hooks/use-theme.ts`) to get the current palette. Use `ThemedText` / `ThemedView` for themed UI — don't hardcode colors.

### React Compiler

`experiments.reactCompiler: true` is set in `app.json`. Do not add manual `useMemo` / `useCallback` — the compiler handles memoization.

### Typed routes

`experiments.typedRoutes: true` is active. Use typed route strings when navigating with `expo-router`.
