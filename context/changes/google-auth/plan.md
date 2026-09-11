# Google OAuth Sign-in (S-01) — Implementation Plan

## Overview

Implement Google OAuth sign-in, session persistence, sign-out, and i18n infrastructure (EN only) for BabyTrack. This is S-01 — the first user-facing slice and prerequisite for all subsequent slices (S-02 through S-07). The backend `POST /api/auth/google` endpoint is already implemented. This plan is entirely frontend work.

## Current State Analysis

- `src/app/` contains three flat files: `_layout.tsx`, `index.tsx`, `explore.tsx`. No route groups, no auth layer, no context providers, no session concept.
- Zero auth-related packages installed. `expo-web-browser` is present (harmless).
- `app.json` scheme is `"bootstrapscaffold"` — must be renamed. `ios.bundleIdentifier` and `android.package` are absent.
- No `eas.json` — EAS project has not been initialized.
- `expo-auth-session`'s Google provider (`GoogleAuthRequestConfig`) is **deprecated** in Expo v56. The correct library is `@react-native-google-signin/google-signin`, which ships native code and **cannot run in Expo Go**. All development from S-01 onward requires an EAS development build.
- `typedRoutes: true` and `reactCompiler: true` are active — typed route strings are mandatory (lessons.md), no manual `useMemo`/`useCallback`.

## Desired End State

A user can open the app, tap "Sign in with Google", authenticate via the system Google account picker, and land on the home tab. On subsequent launches the app restores the session from SecureStore without a network call. Tapping sign-out clears the session and returns to the sign-in screen. The i18n scaffold is in place so all subsequent slices add EN (and later PL) translation keys without additional setup.

### Key Discoveries

- `Stack.Protected` (SDK 53+) is the declarative auth gate — not `useSegments + useEffect` (see research: Architecture Insights)
- Backend returns `{ token, user: { id, email, displayName|null } }` — `displayName` can be null; UI must handle a fallback
- JWT is 30 days, HS256, no refresh tokens — expiry means silent force sign-out
- Backend returns HTTP **403** (not 401) from Spring Security when token is missing/expired; the API layer must treat both 401 and 403 as sign-out triggers
- `GOOGLE_CLIENT_ID` in Secret Manager must equal the `webClientId` used in the mobile app — mismatch causes backend 401
- No `GET /api/users/me` exists — `UserDto` from sign-in must be cached in SecureStore and used on restart

## What We're NOT Doing

- Android Google Sign-In setup (SHA-1 fingerprints) — deferred, iOS-only for S-01 manual gate
- PL translation strings — i18n infrastructure ships in S-01; PL strings added before S-02
- Refresh tokens — backend has no refresh mechanism; re-auth on expiry is the design
- Expo Web support — backend has no CORS config; web is a known gap, not an S-01 concern
- Sign-out confirmation dialog — silent sign-out is the chosen UX
- Onboarding copy or feature illustrations on the sign-in screen
- A `/api/users/me` endpoint — not in scope; cached `UserDto` is sufficient

## Implementation Approach

Five sequential phases: (1) package + project setup, (2) auth infrastructure in isolation, (3) routing restructure to introduce route groups, (4) sign-in UI and Google Sign-In wiring, (5) EAS dev build + manual end-to-end gate against local backend. Phases 1–3 produce no visible UI change but lay the foundation; Phase 4 is the first testable feature; Phase 5 is the manual gate.

## Critical Implementation Details

**`Stack.Protected` ordering matters:** The `Stack.Protected` block with `guard={!!session}` must wrap `(app)` before the one wrapping `sign-in`. Expo Router evaluates them top-to-bottom; putting the protected group first ensures unauthenticated users are never briefly shown the app group.

**`isLoading` must gate `SplashScreen.hide()`:** The native splash screen must stay visible until SecureStore reads complete. Call `SplashScreen.preventAutoHideAsync()` at module level in root `_layout.tsx` and only call `SplashScreen.hide()` (or `SplashScreen.hideAsync()`) after `isLoading` transitions to `false`. If the splash hides before SecureStore resolves, users see a blank frame before the correct screen renders.

**`GoogleSignin.configure()` must run before any `signIn()` call:** Call it once at the module level of `_layout.tsx` (outside any component), not inside `useEffect`. Running it inside a component risks a race where `signIn()` is called before configuration completes.

---

## Phase 1: Project setup & EAS configuration

### Overview

Install all new packages, update `app.json` with bundle identifiers and the google-signin plugin, initialize `eas.json`, and document the EAS dev build workflow change in `CLAUDE.md`. No UI changes — sets up the foundation every subsequent phase depends on.

### Changes Required

#### 1. Install packages

**File**: `package.json` (modified by install commands)

**Intent**: Add all new runtime dependencies for Google Sign-In, secure storage, locale detection, and i18n. Also add `jwt-decode` for client-side JWT expiry checking.

**Contract**:
```bash
npx expo install @react-native-google-signin/google-signin expo-secure-store expo-localization
npm install i18next react-i18next jwt-decode
```

#### 2. Update `app.json`

**File**: `app.json`

**Intent**: Set the required native config that EAS Build and `@react-native-google-signin` need: bundle identifiers for both platforms, the google-signin plugin (which adds the necessary URL scheme handler on Android), and rename the scheme from `"bootstrapscaffold"` to `"babytrack"`.

**Contract**: In the `expo` object:
- `scheme`: `"babytrack"`
- `ios.bundleIdentifier`: `"com.babytrack.app"`
- `android.package`: `"com.babytrack.app"`
- Add to `plugins` array: `"@react-native-google-signin/google-signin"` — initially without options; the `iosUrlScheme` (reversed iOS client ID) will be added once OAuth credentials are created in Phase 5 setup.

#### 3. Initialize `eas.json`

**File**: `eas.json` (new)

**Intent**: Define the EAS build profiles so `eas build --profile development` produces an installable dev client for iOS testing.

**Contract**: Three profiles — `development` (dev client, simulator + device), `preview` (internal distribution), `production` (App Store). The `development` profile must set `"developmentClient": true` and `"distribution": "internal"`. Run `eas project:init` to link the EAS project before the first build.

#### 4. Update `CLAUDE.md`

**File**: `CLAUDE.md`

**Intent**: Document the workflow change that `@react-native-google-signin/google-signin` introduces — Expo Go no longer works from S-01 onward.

**Contract**: Add a note under the Commands section or a new "Development workflow" section stating: Expo Go cannot be used for development. Use `eas build --profile development --platform ios` once to create the dev client, then `npx expo start --dev-client` for all subsequent JS-only changes.

### Success Criteria

#### Automated Verification

- `npx expo install --check` exits 0 (no version conflicts)
- `cat app.json | python3 -m json.tool` exits 0 (valid JSON)
- `cat eas.json | python3 -m json.tool` exits 0 (valid JSON)

#### Manual Verification

- `app.json` contains `ios.bundleIdentifier`, `android.package`, renamed scheme `"babytrack"`, and `@react-native-google-signin/google-signin` in plugins
- `eas.json` has `development`, `preview`, and `production` profiles

---

## Phase 2: Auth infrastructure

### Overview

Build the `SessionProvider` React context, SecureStore read/write logic, JWT expiry helper, i18n scaffold (EN only), and the API fetch wrapper. No routing or UI yet — this is pure logic that subsequent phases consume.

### Changes Required

#### 1. JWT expiry helper

**File**: `src/auth/jwt.ts` (new)

**Intent**: Pure function to decode the JWT `exp` claim and compare it against `Date.now()`. Used on startup and in the `AppState` foreground listener.

**Contract**: Export `isJwtExpired(token: string): boolean` — base64-decode the payload segment (middle of the three dot-separated parts), JSON-parse it, return `true` if `payload.exp * 1000 < Date.now()`. No external dependency needed; `jwt-decode` is an alternative but this is a one-liner.

#### 2. Auth types

**File**: `src/auth/types.ts` (new)

**Intent**: Shared TypeScript types for auth state, used by `SessionProvider`, the API layer, and any screen that reads auth context.

**Contract**:
```typescript
export interface UserDto {
  id: string;             // BabyTrack UUID (not Google sub)
  email: string;
  displayName: string | null;
}

export interface AuthContextValue {
  session: string | null;
  user: UserDto | null;
  isLoading: boolean;
  signIn: (googleIdToken: string) => Promise<void>;
  signOut: () => void;
}
```

#### 3. `SessionProvider` context

**File**: `src/auth/session-provider.tsx` (new)

**Intent**: React context provider that owns auth state, orchestrates SecureStore reads/writes, the startup restore flow, and the AppState foreground expiry check.

**Contract**:
- Exports `SessionProvider` (wraps children) and `useSession(): AuthContextValue` hook
- On mount: call `SplashScreen.preventAutoHideAsync()` (if not already called at module level), read `SecureStore.getItemAsync('session')` and `SecureStore.getItemAsync('session_user')` concurrently
- If token found and `!isJwtExpired(token)`: set `{ session: token, user: parsedUser, isLoading: false }`
- If token found and expired, or no token: delete both keys, set `{ session: null, user: null, isLoading: false }`
- After `isLoading` becomes `false`: call `SplashScreen.hide()`
- `signIn(googleIdToken)`: `POST /api/auth/google { idToken: googleIdToken }` → on success, write both SecureStore keys, update state
- `signOut()`: `GoogleSignin.signOut()`, delete both SecureStore keys, clear state
- `AppState` listener: when state transitions to `'active'` and `session` is set, re-check `isJwtExpired(session)` and call `signOut()` if expired
- Two SecureStore keys: `'session'` (raw JWT string) and `'session_user'` (JSON string of `UserDto`)

#### 4. API fetch wrapper

**File**: `src/api/client.ts` (new)

**Intent**: Thin wrapper around `fetch` that attaches the `Authorization: Bearer <token>` header and calls `signOut()` when the backend returns 401 or 403 (both indicate an invalid/expired session in the Spring Security setup).

**Contract**: Export `createApiClient(getSession: () => string | null, onUnauthorized: () => void)` returning an object with a `request(path, options)` method. The base URL defaults to `__DEV__ ? 'http://localhost:8080' : process.env.EXPO_PUBLIC_API_URL`. On 401 or 403 response, call `onUnauthorized()` before returning the response.

#### 5. i18n setup

**File**: `src/i18n/index.ts` (new)
**File**: `src/i18n/locales/en.ts` (new)

**Intent**: Initialize `react-i18next` with `expo-localization` for locale detection. Ship EN namespace only; PL added before S-02. All S-01 UI strings live in `en.ts`.

**Contract**: `src/i18n/index.ts` — call `i18n.use(initReactI18next).init(...)` synchronously with `resources: { en: { translation: enTranslation } }`, `lng: getLocales()[0].languageTag.slice(0, 2)`, `fallbackLng: 'en'`, `interpolation: { escapeValue: false }`. Export the configured `i18n` instance.

`src/i18n/locales/en.ts` — EN strings for S-01 screens:
```typescript
export default {
  signIn: {
    title: 'BabyTrack',
    tagline: 'Track together, decide together.',
    button: 'Sign in with Google',
    error: {
      generic: 'Sign-in failed. Please try again.',
      network: 'No internet connection.',
    },
  },
} as const;
```

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0 on all new files
- TypeScript compilation (`npx tsc --noEmit`) exits 0
- `src/auth/jwt.ts`, `src/auth/types.ts`, `src/auth/session-provider.tsx`, `src/api/client.ts`, `src/i18n/index.ts`, `src/i18n/locales/en.ts` all exist

#### Manual Verification

- No TypeScript errors in the auth files when opened in the IDE
- `isJwtExpired` returns `false` for a fresh JWT and `true` for an expired one (manual unit check)

---

## Phase 3: Routing restructure

### Overview

Introduce the `(app)` route group, migrate existing screens into it, create the `sign-in.tsx` stub, and rewrite the root layout to use `Stack.Protected` with `SessionProvider`. After this phase the app structure is correct but sign-in doesn't function yet (Phase 4 wires it).

### Changes Required

#### 1. Create `src/app/(app)/` route group

**File**: `src/app/(app)/_layout.tsx` (new)
**Files moved**: `src/app/index.tsx` → `src/app/(app)/index.tsx`, `src/app/explore.tsx` → `src/app/(app)/explore.tsx`

**Intent**: The `(app)` group is the protected area of the app. Its layout owns the tab bar and the `AnimatedSplashOverlay` (which moves here from root). Moving the existing screens into this group places them behind the `Stack.Protected` auth gate.

**Contract**: `(app)/_layout.tsx` renders `AnimatedSplashOverlay` and `AppTabs` (the same components previously in root `_layout.tsx`). Moving `index.tsx` and `explore.tsx` into `(app)/` preserves their routes — Expo Router resolves `(app)/index` to `/` so existing navigation still works. Verify with `npx expo start --dev-client` that tabs appear correctly after the move.

#### 2. Create `src/app/sign-in.tsx`

**File**: `src/app/sign-in.tsx` (new)

**Intent**: The unauthenticated entry screen. Phase 3 creates a minimal stub so the routing works end-to-end; Phase 4 replaces the stub with the real UI and Google Sign-In logic.

**Contract**: Render a centered `ThemedText` reading "Sign in" and a `ThemedView` background. No logic. The file must be at `src/app/sign-in.tsx` (not inside a group) so `Stack.Protected guard={!session}` can reference it as `sign-in`.

#### 3. Rewrite root `src/app/_layout.tsx`

**File**: `src/app/_layout.tsx` (modified)

**Intent**: The root layout becomes the provider shell and auth gate. It sets up provider nesting, calls `GoogleSignin.configure()`, and uses `Stack.Protected` to declaratively route authenticated vs unauthenticated users.

**Contract**:
- Call `SplashScreen.preventAutoHideAsync()` at module level (outside any component)
- Call `GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID })` at module level
- Provider nesting order (outermost first): `ThemeProvider` → `I18nProvider` (import and initialize `src/i18n/index.ts`) → `SessionProvider`
- Inside `SessionProvider`, render a `Stack` with:
  ```tsx
  <Stack.Protected guard={!!session}>
    <Stack.Screen name="(app)" options={{ headerShown: false }} />
  </Stack.Protected>
  <Stack.Protected guard={!session}>
    <Stack.Screen name="sign-in" options={{ headerShown: false }} />
  </Stack.Protected>
  ```
- `SplashScreen.hide()` is called inside `SessionProvider` when `isLoading` resolves — **not** in root layout directly

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0 after the route migration
- `npm run lint` exits 0

#### Manual Verification

- `npx expo start --dev-client` launches without errors
- Navigating to the app shows the sign-in stub (because no session exists)
- After manually setting a fake session in SecureStore and restarting, the app shows the tab bar (smoke test of `Stack.Protected`)

---

## Phase 4: Sign-in screen & Google Sign-In wiring

### Overview

Replace the stub sign-in screen with the minimal production UI (logo + Google button), wire `GoogleSignin.signIn()` → `POST /api/auth/google` → `SessionProvider.signIn()`, and add a sign-out button to the home tab. After this phase, the full auth flow is functional.

### Changes Required

#### 1. Sign-in screen (production)

**File**: `src/app/sign-in.tsx` (replace stub)

**Intent**: Minimal centered layout with the BabyTrack name/tagline and a styled Google Sign-In button. Handles loading state, error display, and the sign-in initiation.

**Contract**:
- Use `ThemedView` (full screen, centered column)
- `ThemedText` with `type="title"` for the app name (from `en.signIn.title`)
- `ThemedText` with `type="subtitle"` for the tagline (from `en.signIn.tagline`)
- A button styled to the Google Sign-In brand guidelines: white background, Google logo, dark text (from `en.signIn.button`). Use a `Pressable` wrapping a `Text` and a static Google "G" SVG or image asset.
- On press: set local `isSigningIn` state to `true`, call `GoogleSignin.hasPlayServices()`, then `GoogleSignin.signIn()`, extract `data.idToken`, call `useSession().signIn(idToken)`. On any error, set a local error string and display it below the button. Always reset `isSigningIn` on completion.
- Display error string using `ThemedText` with `en.signIn.error.generic` or `en.signIn.error.network` depending on error type.
- All user-facing strings via `useTranslation()` — no hardcoded EN strings.

#### 2. Sign-out in home tab

**File**: `src/app/(app)/index.tsx` (modified)

**Intent**: Add a sign-out affordance so the end-to-end flow (sign-in → use app → sign-out) can be verified manually. This is a temporary control for verification; a proper settings screen comes in a later slice.

**Contract**: Add a `Pressable` or `Button` labeled "Sign out" at the bottom of the existing scaffold screen. On press: call `useSession().signOut()`. Stack.Protected handles the redirect to sign-in automatically.

#### 3. Environment variable config

**File**: `.env.local` (new, gitignored)
**File**: `.env.example` (new, committed)

**Intent**: Store Google OAuth client IDs as Expo public env vars so they're available at build time without being hardcoded.

**Contract**:
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id_here
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id_here
EXPO_PUBLIC_API_URL=https://babytrack-backend-xxx-ew.a.run.app
```
`.env.local` is added to `.gitignore`. `.env.example` is committed with placeholder values.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0
- `npm run lint` exits 0
- `src/app/sign-in.tsx` uses `useTranslation()` — no raw EN string literals

#### Manual Verification

- Sign-in screen renders on the EAS dev build (Phase 5 prerequisite: OAuth client IDs must be set in `.env.local` for this to function)
- Google account picker appears when the button is tapped
- After sign-in, home tab is visible
- "Sign out" button returns to the sign-in screen
- Killing and relaunching the app restores the session without sign-in (SecureStore restore)
- Killing and relaunching after clearing SecureStore shows the sign-in screen

---

## Phase 5: EAS dev build & manual end-to-end verification

### Overview

Create the EAS development build for iOS, set up Google OAuth credentials in Google Cloud Console, configure `.env.local`, run the EAS build, install on a device/simulator, and execute the full end-to-end manual test against the local backend.

### Changes Required

#### 1. Set up Google OAuth clients (manual, not a file)

**Intent**: Create the necessary OAuth 2.0 clients in Google Cloud Console so the native sign-in flow works and the backend can verify the ID token.

**Contract**:
1. In Google Cloud Console → APIs & Services → Credentials:
   - Create an **iOS OAuth 2.0 client**: app type = iOS, bundle ID = `com.babytrack.app`. Copy the resulting `iosClientId`.
   - Create a **Web/Server OAuth 2.0 client**: app type = Web. Copy the resulting `webClientId`.
2. Update `GOOGLE_CLIENT_ID` in Secret Manager to the `webClientId` (this is what the backend uses for token verification).
3. Update `.env.local` with `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
4. Update `app.json` plugin entry for `@react-native-google-signin/google-signin` to include `{ "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID" }`.

#### 2. Run EAS dev build (manual step)

**Intent**: Produce an installable iOS dev client with the native Google Sign-In library.

**Contract**:
```bash
eas build --profile development --platform ios
```
Install the resulting `.ipa` on a simulator or device. All subsequent JS changes use `npx expo start --dev-client`.

### Success Criteria

#### Automated Verification

- `eas build --profile development --platform ios` completes without errors (green CI)

#### Manual Verification

- App installs and launches on iOS simulator or device
- Sign-in screen renders with app name, tagline, and Google button
- Tapping the Google button shows the system Google account picker
- Selecting an account triggers the `POST /api/auth/google` call to `http://localhost:8080` (local backend running via docker-compose)
- Backend returns `{ token, user }` and the home tab appears
- Session persists across app kills (SecureStore restore path)
- Session restore completes before the splash screen hides (no blank frame visible)
- Sign-out returns to the sign-in screen
- `useTranslation('signIn.title')` renders "BabyTrack" in the sign-in screen

---

## Testing Strategy

### Unit Tests

- `src/auth/jwt.ts` — `isJwtExpired`: test with an unexpired token (returns `false`), an expired token (returns `true`), and a malformed token (handles gracefully without throwing).

### Integration Tests

- `SessionProvider` restore: mock SecureStore to return a valid token → verify `session` is set and `isLoading` resolves to `false`
- `SessionProvider` restore with expired token: mock SecureStore to return an expired token → verify both keys are deleted and `session` is `null`
- API client: mock `fetch` returning 403 → verify `onUnauthorized` callback is called

### Manual Testing Steps

1. Fresh install: launch app → sign-in screen appears
2. Sign in with a real Google account → home tab appears, `user.email` is accessible
3. Kill and relaunch: home tab appears immediately (no sign-in prompt)
4. Let session expire (or manually corrupt the SecureStore token): relaunch → sign-in screen appears
5. Sign out from home tab → sign-in screen appears
6. Confirm `docker-compose` backend logs show a `POST /api/auth/google` request with a valid 200 response

## Performance Considerations

- SecureStore reads are fast (<50ms on device) — no shimmer/loading UI needed for the restore path; the native splash screen covers the wait.
- `GoogleSignin.configure()` is synchronous and runs at module load — no async startup cost.
- i18n init is synchronous — no lazy loading needed for the EN-only MVP.

## Migration Notes

No existing user data to migrate. The route migration (`index.tsx` → `(app)/index.tsx`) is internal — Expo Router resolves `(app)/` index to `/` so no external deep links break. Verify typed routes compile cleanly after the move (`npx tsc --noEmit`).

## References

- Research: `context/changes/google-auth/research.md`
- Backend contract: `context/archive/2026-06-27-backend-bootstrap/plan.md` (Phase 3)
- Roadmap S-01: `context/foundation/roadmap.md`
- PRD: `context/foundation/prd.md` (FR-001, FR-003, FR-004)
- Expo Router auth guide: https://docs.expo.dev/router/reference/authentication/
- `@react-native-google-signin` docs: https://react-native-google-signin.github.io/docs/install

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Project setup & EAS configuration

#### Automated

- [x] 1.1 `npx expo install --check` exits 0 (no version conflicts) — bcf55e4
- [x] 1.2 `app.json` JSON is valid and contains `ios.bundleIdentifier`, `android.package`, scheme `"babytrack"`, google-signin plugin — bcf55e4
- [x] 1.3 `eas.json` JSON is valid and has `development`, `preview`, `production` profiles — bcf55e4

#### Manual

- [x] 1.4 `app.json` manually inspected — all required fields present — bcf55e4
- [x] 1.5 `eas.json` manually inspected — development profile has `developmentClient: true` — bcf55e4

### Phase 2: Auth infrastructure

#### Automated

- [x] 2.1 `npm run lint` exits 0 on all new auth/i18n files — 63b57f0
- [x] 2.2 `npx tsc --noEmit` exits 0 — 63b57f0
- [x] 2.3 All new files exist: `src/auth/jwt.ts`, `src/auth/types.ts`, `src/auth/session-provider.tsx`, `src/api/client.ts`, `src/i18n/index.ts`, `src/i18n/locales/en.ts` — 63b57f0

#### Manual

- [x] 2.4 `isJwtExpired` returns `false` for a fresh JWT and `true` for an expired one (manual check) — 63b57f0

### Phase 3: Routing restructure

#### Automated

- [x] 3.1 `npx tsc --noEmit` exits 0 after route migration — cb4e279
- [x] 3.2 `npm run lint` exits 0 — cb4e279

#### Manual

- [x] 3.3 `npx expo start --dev-client` launches without errors — cb4e279
- [x] 3.4 App shows sign-in stub (no session in SecureStore) — cb4e279
- [x] 3.5 Setting a fake session in SecureStore and restarting shows the tab bar — cb4e279

### Phase 4: Sign-in screen & Google Sign-In wiring

#### Automated

- [x] 4.1 `npx tsc --noEmit` exits 0 — e7ef2ba
- [x] 4.2 `npm run lint` exits 0 — e7ef2ba
- [x] 4.3 `sign-in.tsx` uses `useTranslation()` — no raw EN string literals in JSX — e7ef2ba

#### Manual

- [ ] 4.4 Sign-in screen renders (requires `.env.local` with OAuth client IDs from Phase 5 setup)
- [ ] 4.5 Google account picker appears on button tap
- [ ] 4.6 After sign-in, home tab is visible
- [ ] 4.7 Sign-out button returns to sign-in screen
- [ ] 4.8 Session persists across app kills

### Phase 5: EAS dev build & manual end-to-end verification

#### Automated

- [ ] 5.1 `eas build --profile development --platform ios` completes green

#### Manual

- [ ] 5.2 App installs and launches on iOS simulator or device
- [ ] 5.3 Full sign-in flow works against local backend (`http://localhost:8080`)
- [ ] 5.4 Session restore on relaunch (no sign-in prompt after initial sign-in)
- [ ] 5.5 Splash screen hides cleanly after session restore (no blank frame)
- [ ] 5.6 Sign-out returns to sign-in screen
