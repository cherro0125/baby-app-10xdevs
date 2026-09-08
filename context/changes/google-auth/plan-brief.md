# Google OAuth Sign-in (S-01) — Plan Brief

> Full plan: `context/changes/google-auth/plan.md`
> Research: `context/changes/google-auth/research.md`

## What & Why

Implement Google OAuth sign-in, session persistence, sign-out, and i18n scaffolding (EN) for BabyTrack. This is S-01 — the first user-facing slice and hard prerequisite for every subsequent slice (S-02 through S-07). The backend `POST /api/auth/google` is already built; this plan is entirely frontend work.

## Starting Point

The frontend is a near-empty Expo v56 scaffold: two flat tab screens, one root layout — no auth layer, no route groups, no SecureStore, no i18n. `expo-auth-session`'s Google provider is deprecated in v56 so the library decision pivoted to `@react-native-google-signin/google-signin`, which requires native code and therefore an EAS development build — **Expo Go no longer works from S-01 onward**.

## Desired End State

A user opens the app, taps "Sign in with Google", selects their Google account, and lands on the home tab. On subsequent launches the session is restored from SecureStore without a network call (offline-safe). Sign-out clears state and returns to the sign-in screen. The i18n infrastructure (`react-i18next` + `expo-localization`) is wired so all future slices add translation keys without extra setup.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Google Sign-In library | `@react-native-google-signin/google-signin` | `expo-auth-session` Google provider is deprecated in Expo v56; Expo docs recommend native provider libraries | Research |
| Auth gate mechanism | `Stack.Protected guard={!!session}` | Declarative SDK 53+ API; replaces the flicker-prone `useSegments + useEffect` redirect pattern | Research |
| Session storage | Two SecureStore keys (`session` + `session_user`) | JWT + cached `UserDto` avoids a network call on startup; no `GET /api/users/me` endpoint exists | Research |
| Startup network call | None — SecureStore-only restore | Offline-safe and fast; cached `UserDto` is sufficient per backend plan Phase 3 note | Research |
| i18n library | `react-i18next` + `expo-localization` | Active maintenance, React hooks API, typed keys; `i18n-js` is less maintained | Research |
| i18n scope for S-01 | EN only | Infrastructure ships now; PL strings added before S-02 per roadmap S-01 note | Plan |
| Platform scope for S-01 | iOS only | Android SHA-1 setup deferred; iOS unblocks end-to-end verification quickly | Plan |
| Backend test target | Local docker-compose (`localhost:8080`) | Cloud Run not yet live (GH Secrets pending); unblocks S-01 immediately | Plan |
| Sign-in screen | Minimal (logo + Google button) | Design polish comes in a later UI pass; focus S-01 on the auth flow | Plan |
| JWT expiry UX | Silent force sign-out | 30-day window means rare; no alert needed; simple to implement | Plan |

## Scope

**In scope:**
- Package install + `app.json` updates + `eas.json` init
- `SessionProvider` with SecureStore read/write, JWT expiry check, AppState listener
- API fetch wrapper (`Authorization` header + 401/403 → sign-out)
- `react-i18next` scaffold with EN namespace
- Route group restructure: `(app)/` group with `Stack.Protected`
- Minimal sign-in screen (app name, tagline, Google button, error handling)
- Sign-out button on home tab (temp, for verification)
- iOS EAS development build + manual end-to-end gate against local backend

**Out of scope:**
- Android Google Sign-In (SHA-1 registration)
- PL translation strings
- Refresh tokens
- Expo Web / CORS
- Settings screen or persistent sign-out UI
- Onboarding copy / feature illustrations

## Architecture / Approach

Root `_layout.tsx` becomes a provider shell (`ThemeProvider` → `I18nProvider` → `SessionProvider`) with a `Stack.Protected` auth gate. The `(app)/` route group houses all authenticated screens; `sign-in.tsx` sits at root level. `SessionProvider` reads SecureStore on mount, keeps the native splash visible via `SplashScreen.preventAutoHideAsync()`, hides it when the restore completes, and provides `signIn`/`signOut` to the tree. The API client is a thin `fetch` wrapper that injects the Bearer token and calls `signOut()` on 401/403.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Project setup | Packages, `app.json`, `eas.json`, CLAUDE.md update | EAS project must be linked before build |
| 2. Auth infrastructure | `SessionProvider`, SecureStore logic, JWT expiry, i18n scaffold, API client | No visible UI — hard to verify until Phase 3 |
| 3. Routing restructure | `(app)/` group, `Stack.Protected` gate, sign-in stub | Route migration could break typed routes — verify `tsc --noEmit` |
| 4. Sign-in screen & wiring | Real sign-in UI, `GoogleSignin.signIn()` flow, sign-out button | Requires OAuth client IDs (Phase 5 setup step) before manual test works |
| 5. EAS build & end-to-end gate | iOS dev client, OAuth creds setup, full manual sign-in verification | EAS build time (~10–15 min); Google Cloud Console setup is manual |

**Prerequisites:** Local backend running (`docker-compose up -d && ./gradlew bootRun --args='--spring.profiles.active=dev'`); Expo account with EAS access.

**Estimated effort:** ~3–4 sessions across 5 phases. Phase 5 has significant one-time overhead (EAS build + GCP OAuth setup).

## Open Risks & Assumptions

- **OAuth client IDs are not yet created.** Phases 1–4 can be written and linted without them; Phase 5 manual gate is blocked until they exist.
- **EAS project not initialized.** `eas project:init` must run before `eas build` — adds one setup step at the start of Phase 1.
- **`GOOGLE_CLIENT_ID` in Secret Manager must match `webClientId`.** A mismatch causes a silent backend 401 at runtime. Verify both are set to the same server OAuth client before Phase 5.
- **Android deferred.** If Android testing is needed before S-02, it becomes a fast-follow item requiring SHA-1 registration and an Android EAS build.

## Success Criteria (Summary)

- User can sign in with a real Google account and land on the home tab (end-to-end, against local backend)
- Session persists across app restarts without a sign-in prompt
- Sign-out returns to the sign-in screen
