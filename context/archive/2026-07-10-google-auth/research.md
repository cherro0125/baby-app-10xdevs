---
date: 2026-07-10T20:37:38Z
researcher: Claude (Sonnet 4.6)
git_commit: 8e0b73bc1c9ac11bdcd92a7416fbb637489115ec
branch: main
repository: baby-app-10xdevs
topic: "Google OAuth sign-in for BabyTrack (S-01 google-auth)"
tags: [research, google-auth, expo, react-native, oauth, jwt, secure-store, i18n, expo-router]
status: complete
last_updated: 2026-07-10
last_updated_by: Claude (Sonnet 4.6)
---

# Research: Google OAuth Sign-in (S-01 google-auth)

**Date**: 2026-07-10T20:37:38Z
**Researcher**: Claude (Sonnet 4.6)
**Git Commit**: 8e0b73bc
**Branch**: main
**Repository**: baby-app-10xdevs

## Research Question

What does implementing Google OAuth sign-in (S-01) require across the frontend, backend API contract, library selection, and auth UX flow — given the Expo v56 managed-workflow frontend and the already-deployed Spring Boot backend?

## Summary

The backend (`POST /api/auth/google`) is complete and documented. The frontend currently has zero auth infrastructure: no login screen, no auth context, no secure storage, no i18n, and no route groups. S-01 requires adding all of this. The single most important library decision is that **`expo-auth-session`'s Google provider (`GoogleAuthRequestConfig`) is deprecated in Expo v56** — the correct library is `@react-native-google-signin/google-signin`. This has a significant workflow consequence: native code is required, so **Expo Go cannot be used for development** — an EAS development build is mandatory from day one of S-01.

The recommended auth gate pattern is `Stack.Protected` (introduced in SDK 53), not the legacy `useSegments + useEffect` redirect approach. Session state lives in a React Context provider with two SecureStore keys. No network call is made on startup — the app restores auth state from SecureStore alone, making the auth restore path fully offline-safe.

---

## Detailed Findings

### 1. Frontend Current State

The frontend is a near-empty scaffold with two flat routes and no auth layer whatsoever.

**File tree (`src/app/`):**
```
src/app/
├── _layout.tsx     ← ThemeProvider + AnimatedSplashOverlay + AppTabs (all-in-one)
├── index.tsx       ← "Home" tab (scaffold welcome screen)
└── explore.tsx     ← "Explore" tab (collapsible examples)
```

**Root layout (`src/app/_layout.tsx`) — current shape:**
```tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
```

No auth layer, no session provider, no loading state — the app goes directly to tabs.

**Auth-related packages already installed:**
- `expo-web-browser ~56.0.5` — present, used only by `ExternalLink` today (harmless for auth)

**Auth-related packages NOT installed (all need adding):**
- `@react-native-google-signin/google-signin` — Google sign-in
- `expo-secure-store` — JWT + UserDto persistence
- `expo-localization` — locale detection
- `i18next` + `react-i18next` — i18n

**`app.json` gaps to fix before S-01 ships:**
- `scheme: "bootstrapscaffold"` → rename to `"babytrack"` (or final slug)
- `ios.bundleIdentifier` — missing, required for EAS Build and Google OAuth client
- `android.package` — missing, required for EAS Build and Google OAuth client
- `plugins` — needs `@react-native-google-signin/google-signin` plugin entry

**Path aliases (tsconfig.json):**
- `@/*` → `./src/*`
- `@/assets/*` → `./assets/*`

**`typedRoutes: true` is active** — all navigation strings must use typed route helpers, not raw strings (see lessons.md).

---

### 2. Backend API Contract

**Endpoint:** `POST /api/auth/google`
**Auth required:** No — public endpoint

**Request body:**
```json
{ "idToken": "<Google ID token string>" }
```
`idToken` is `@NotBlank` — empty string or missing field returns 400.

**200 response:**
```json
{
  "token": "eyJ...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "displayName": "Test User"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `token` | string | BabyTrack JWT (HS256, compact serialization) |
| `user.id` | string (UUID) | BabyTrack internal ID — **not** the Google `sub` |
| `user.email` | string | From Google ID token |
| `user.displayName` | string \| **null** | May be null if Google omits the `name` claim |

**JWT claims:**
| Claim | Value |
|---|---|
| `sub` | BabyTrack UUID (not Google sub) |
| `email` | User email |
| `iat` | Issued-at (Unix seconds) |
| `exp` | `iat + 30 days` |

No roles, no custom claims. **No refresh token mechanism exists** — re-auth via Google is required when JWT expires.

**Error responses (RFC 9457 Problem Details):**
```json
// 401 — bad/expired Google ID token
{ "type": "urn:babytrack:error:invalid-google-token", "title": "Invalid Google Token", "status": 401, "detail": "..." }

// 400 — missing/blank idToken field
{ "type": "about:blank", "title": "Bad Request", "status": 400, "detail": "...", "instance": "/api/auth/google" }
```

**Protected route behavior:** `JwtFilter` silently ignores missing/bad tokens; Spring Security returns **HTTP 403** (not 401) from its default access-denied handler. The API layer on the frontend should treat 403 from any protected route as "session expired → sign out."

**CORS:** No CORS configuration exists. Native RN HTTP calls are unaffected. **Expo Web build will fail** without CORS headers — file as a gap if web support is needed.

**Critical constraint — `GOOGLE_CLIENT_ID` must match:** The backend's `app.google.client-id` (set via Secret Manager) must be the same OAuth 2.0 `webClientId` / server client ID used in the mobile app. A mismatch causes a backend 401 at runtime.

**No `GET /api/users/me` endpoint exists.** The `UserDto` returned by `POST /api/auth/google` must be cached in SecureStore at sign-in and used on restart.

---

### 3. Library Landscape (Expo v56)

#### ⚠️ Critical: `expo-auth-session` Google provider is deprecated in Expo v56

The Expo v56 docs explicitly state that `GoogleAuthRequestConfig` is deprecated and that *"where available, we recommend using a library supplied by your identity provider."* Do **not** use `useAuthRequest` from `expo-auth-session/providers/google` for Google OAuth — that API is legacy.

#### Recommended: `@react-native-google-signin/google-signin`

| Aspect | Value |
|---|---|
| Package | `@react-native-google-signin/google-signin` |
| Architecture | Old Arch + New Arch (compatible with Reanimated 4.x used in this project) |
| Maturity | Battle-tested, large community |
| Android | Standard Google Sign-In (Credential Manager is a paid add-on) |
| Expo Go support | ❌ None — native code required |

Alternative `react-native-nitro-google-signin` is newer and uses Nitro Modules but has less documentation and community history. Revisit for v2; use the established library for MVP.

#### ⚠️ Development workflow impact: No Expo Go

`@react-native-google-signin/google-signin` ships native code that is not bundled in Expo Go. **All development must use an EAS development build:**

```bash
# One-time: create dev build for device/simulator
eas build --profile development --platform ios

# All subsequent JS changes
npx expo start --dev-client
```

This aligns with the EAS delivery target already in `tech-stack.md`.

#### Platform credentials required

| Platform | What you need |
|---|---|
| iOS | `iosClientId` (iOS OAuth 2.0 client from Google Cloud Console) + bundle identifier registered |
| Android | `webClientId` (server/web client ID) + SHA-1 of signing key registered in Google Cloud Console |
| Backend | `webClientId` must match `GOOGLE_CLIENT_ID` in Secret Manager |

Two Android SHA-1 fingerprints needed: debug keystore (`eas credentials` for dev) and production keystore.

#### `expo-secure-store`

```ts
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('session', jwtString);
const token = await SecureStore.getItemAsync('session');  // null if not set
await SecureStore.deleteItemAsync('session');
```

- iOS: Keychain Services — **persists across app uninstall** if bundle ID matches
- Android: Android Keystore / SharedPreferences — removed on uninstall
- Size limit: no SDK limit; typical JWT (300–800 bytes) is well within iOS Keychain limits
- Use async variants only — sync variants block the JS thread

#### i18n: `react-i18next` + `expo-localization`

Preferred over `i18n-js` (more active maintenance, first-class TypeScript, React hooks API):

```ts
// src/i18n/index.ts
import { getLocales } from 'expo-localization';
i18n.use(initReactI18next).init({
  resources: { en: { translation: enStrings }, pl: { translation: plStrings } },
  lng: getLocales()[0].languageTag.slice(0, 2),  // "pl" or "en"
  fallbackLng: 'en',
});
```

Ship EN strings in S-01; add PL strings in the same PR per roadmap S-01 note.

#### Install commands

```bash
# Google sign-in (requires EAS dev build)
npx expo install @react-native-google-signin/google-signin

# Secure storage
npx expo install expo-secure-store

# Locale detection
npx expo install expo-localization

# i18n runtime
npm install i18next react-i18next

# JWT expiry check (optional helper)
npm install jwt-decode
```

---

### 4. Auth UX Flow & Session Patterns

#### Route structure after S-01

```
src/app/
├── _layout.tsx            ← root: providers + Stack.Protected gate
├── sign-in.tsx            ← always accessible (unauthenticated)
└── (app)/
    ├── _layout.tsx        ← protected: ThemeProvider + AppTabs
    ├── index.tsx          ← home tab (moved from root)
    └── explore.tsx        ← explore tab (moved from root)
```

`AnimatedSplashOverlay` moves into `(app)/_layout.tsx` — it should play after auth resolves, not during the SecureStore read.

#### Auth gate: `Stack.Protected` (SDK 53+)

Use the declarative `Stack.Protected` API, not the legacy `useSegments + useEffect + router.replace` pattern.

```tsx
// src/app/_layout.tsx
<Stack>
  <Stack.Protected guard={!!session}>
    <Stack.Screen name="(app)" />
  </Stack.Protected>
  <Stack.Protected guard={!session}>
    <Stack.Screen name="sign-in" />
  </Stack.Protected>
</Stack>
```

When `guard` is false, Expo Router automatically redirects. No manual `router.push` needed for the gate itself.

#### Auth context interface

```typescript
// src/auth/types.ts
export interface UserDto {
  id: string;           // BabyTrack UUID
  email: string;
  displayName: string | null;
}

export interface AuthContextValue {
  session: string | null;    // BabyTrack JWT; null = unauthenticated
  user: UserDto | null;      // Cached from sign-in; null = unauthenticated
  isLoading: boolean;        // True while SecureStore is being read on startup
  signIn: (googleIdToken: string) => Promise<void>;
  signOut: () => void;
}
```

Two SecureStore keys: `'session'` (JWT string) and `'session_user'` (JSON-encoded `UserDto`).

#### Session restore flow on startup

```
App launch
  │
  ├── SplashScreen.preventAutoHideAsync() — module level in _layout.tsx
  │
  ├── SessionProvider mounts → { isLoading: true, session: null, user: null }
  │     └── useEffect: read SecureStore('session') + SecureStore('session_user')
  │           ├── token found + not expired → set { isLoading: false, session, user }
  │           ├── token found + EXPIRED     → delete both keys, set { isLoading: false, session: null }
  │           └── no token                 → set { isLoading: false, session: null }
  │
  ├── isLoading === false → SplashScreen.hide()
  │
  └── Stack.Protected evaluates:
        session exists → render (app) → AppTabs
        session null   → render sign-in
```

**JWT expiry check is client-side only** — decode the `exp` claim from the JWT payload (base64 → JSON → compare `exp * 1000 > Date.now()`). No network call on startup.

#### Sign-in flow (with `@react-native-google-signin`)

```
sign-in.tsx
  │
  ├── Configure once at app start:
  │     GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID })
  │
  ├── User taps "Sign in with Google"
  │     → await GoogleSignin.hasPlayServices()
  │     → const { idToken } = await GoogleSignin.signIn()
  │
  ├── signIn(idToken) — in SessionProvider:
  │     1. POST /api/auth/google { idToken }
  │     2. SecureStore.setItemAsync('session', response.token)
  │     3. SecureStore.setItemAsync('session_user', JSON.stringify(response.user))
  │     4. setState({ session: response.token, user: response.user })
  │
  └── Stack.Protected guard={!!session} → true → (app) renders automatically
```

Note: `router.replace('/(app)')` can be added as a safety net, but `Stack.Protected` handles the redirect.

#### Sign-out flow

```typescript
const signOut = async () => {
  await GoogleSignin.signOut();                       // revoke Google session
  await SecureStore.deleteItemAsync('session');
  await SecureStore.deleteItemAsync('session_user');
  setSession(null);
  setUser(null);
  // Stack.Protected guard={!!session} → false → sign-in renders automatically
};
```

#### Token expiry handling

```typescript
// In SessionProvider — recheck on app foreground
useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && session && isJwtExpired(session)) {
      signOut();
    }
  });
  return () => sub.remove();
}, [session]);

// In API layer (fetch wrapper) — catch backend 401/403
if (response.status === 401 || response.status === 403) {
  signOut();
}
```

**Network offline on startup:** User stays logged in — session restore is SecureStore-only. No network call on startup. Cached `UserDto` provides profile. Per backend plan Phase 3 note: this is the intended behavior.

#### Provider nesting order in root layout

```tsx
<ThemeProvider>
  <I18nProvider>        {/* i18next initialised once here */}
    <SessionProvider>
      <SplashScreenController />   {/* calls SplashScreen.hide() when !isLoading */}
      <RootStack />                {/* Stack.Protected gate */}
    </SessionProvider>
  </I18nProvider>
</ThemeProvider>
```

---

## Code References

- `src/app/_layout.tsx` — root layout (ThemeProvider + AnimatedSplashOverlay + AppTabs, no auth)
- `src/app/index.tsx` — current home tab, moves to `src/app/(app)/index.tsx`
- `src/app/explore.tsx` — current explore tab, moves to `src/app/(app)/explore.tsx`
- `src/components/app-tabs.tsx` — NativeTabs, moves into `(app)/_layout.tsx`
- `src/components/animated-icon.tsx` — AnimatedSplashOverlay, moves into `(app)/_layout.tsx`
- `src/constants/theme.ts` — Colors, Fonts, Spacing, BottomTabInset, MaxContentWidth
- `backend/src/main/kotlin/.../AuthController.kt` — POST /api/auth/google
- `backend/src/main/kotlin/.../JwtService.kt` — issue() + verify(), 30-day expiry
- `backend/src/main/kotlin/.../GoogleTokenVerifier.kt` — Google ID token validation
- `backend/src/main/resources/application-prod.yml` — GOOGLE_CLIENT_ID source
- `context/archive/2026-06-27-backend-bootstrap/plan.md` — Phase 3 contract + note about caching UserDto

## Architecture Insights

1. **No Expo Go from S-01 forward.** Native Google Sign-In is the right call per Expo v56 docs (expo-auth-session Google provider is deprecated), but it means all developers must use EAS dev builds. Document this clearly in CLAUDE.md.

2. **`Stack.Protected` is the correct auth gate** for SDK 53+. The widely-cited `useSegments + useEffect` pattern is outdated and causes navigation flicker. Plan must explicitly specify `Stack.Protected`.

3. **The `(app)` route group requires migrating both existing routes.** `index.tsx` and `explore.tsx` move out of the flat root into `src/app/(app)/`. This is a breaking route change — `'/'` becomes `'/(app)'` (or the index of `(app)` group, which Expo Router resolves to `/`). With typed routes, this must be verified after migration.

4. **`displayName` nullability must be handled.** The backend explicitly documents that `displayName` can be null. Any UI that renders the user's name needs a fallback (use email prefix, or "User").

5. **CORS gap.** The backend has no CORS config. This blocks Expo Web. For the MVP (native-only), it's fine. If web is ever needed, `SecurityConfig.kt` needs a `CorsConfigurationSource` bean.

6. **`app.json` scheme must be renamed** from `"bootstrapscaffold"` to `"babytrack"` as part of S-01. This is the deep link scheme and affects URL handling on Android.

7. **Two SHA-1 fingerprints for Android Google Sign-In.** Debug (EAS dev) and production (EAS prod) keystores have different SHA-1s. Both must be registered in Google Cloud Console before any Android testing is possible.

## Historical Context

- `context/archive/2026-06-27-backend-bootstrap/plan.md` — Phase 3 documents the full auth endpoint contract. Key note in that plan (Phase 3 success criteria): "S-01 should cache the `UserDto` returned by `POST /api/auth/google` in secure local storage at sign-in and use the cached value on restart — this avoids blocking app launch on a network call and works offline." This is the authoritative source for the two-SecureStore-keys design.
- `context/foundation/roadmap.md` S-01 — confirms i18n infrastructure should land in S-01 so all subsequent slices reuse the same translation keys from the start.
- `context/foundation/prd.md` FR-001, FR-003, FR-004 — sign-up via Google OAuth, persist session, sign-out.

## Open Questions

1. **Google Cloud Console OAuth client setup** — Who creates the iOS and Android OAuth 2.0 clients in Google Cloud Console? The `iosClientId`, Android SHA-1 fingerprints, and `webClientId` must be known before implementation can start. The `GOOGLE_CLIENT_ID` in Secret Manager (used by the backend) is the `webClientId` / server client ID.

2. **EAS project setup** — Is `eas.json` configured yet? Is the EAS project linked (`eas project:init`)? EAS dev builds require this. The roadmap baseline notes "EAS declared in tech-stack.md; no `eas.json` or CI workflows in repo yet."

3. **Android testing device available?** — Two SHA-1 fingerprints (debug + prod) must be registered in Google Cloud Console. If Android testing is lower priority, iOS-only can unblock initial implementation.

4. **i18n: PL strings in same PR or follow-up?** — Roadmap says "ship EN-only first, PL strings can follow in the same PR." Clarify whether PL is in-scope for S-01 or deferred to an immediately following PR.

5. **Backend deployment status** — `POST /api/auth/google` is implemented but the Cloud Run URL is not yet live (steps 5.1–5.6 of backend-bootstrap are pending). Manual step 3.4 (real Google token test against prod) hasn't run. S-01 integration testing against the real backend may need to wait for CI/CD completion.
