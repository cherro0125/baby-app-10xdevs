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

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
