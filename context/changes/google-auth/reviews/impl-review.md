<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Google OAuth Sign-in (S-01)

- **Plan**: context/changes/google-auth/plan.md
- **Scope**: All phases (1–5)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | FAIL ❌ |
| Architecture | WARNING ⚠️ |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria | PASS ✅ |

## Automated Checks

- `npx tsc --noEmit` → exit 0 ✅
- `npm run lint` → exit 0 ✅ (1 pre-existing `import/no-named-as-default-member` warning in i18n/index.ts, present before this change)

## Findings

### F1 — Hardcoded JWT signing secret in dev config

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/resources/application-dev.yml:11
- **Detail**: `dev-secret-minimum-32-chars-for-hs256` is committed verbatim. Even in a dev profile, a predictable literal secret in source control means any clone of this repo can forge JWTs for the dev server. The key name broadcasts its weakness.
- **Fix**: Replace with an env var reference:
  ```yaml
  secret: ${JWT_SECRET:dev-secret-minimum-32-chars-for-hs256}
  ```
  The `:default` syntax keeps local dev working without a `.env` file while removing the literal from tracked code. Add `JWT_SECRET` to `.env.example` as a documented variable.
  - Strength: Removes the credential from git history going forward; local dev still works out of the box with the default fallback.
  - Tradeoff: The default fallback is still in the code, which is a partial mitigation — full removal would require every dev to set the env var. Acceptable for a dev-only profile.
  - Confidence: HIGH — Spring Boot `${VAR:default}` syntax is the standard pattern here.
  - Blind spot: Old commits still carry the literal; git history cleanup (rebase/filter-repo) is out of scope for a dev secret but worth knowing.
- **Decision**: FIXED — applied ${JWT_SECRET:dev-secret-minimum-32-chars-for-hs256} in application-dev.yml:11

### F2 — Hardcoded button colors bypass theme system

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/sign-in.tsx:75-87
- **Detail**: `backgroundColor: '#ffffff'`, `borderColor: '#dadce0'`, `color: '#3c4043'` are hardcoded. In dark mode, the button renders as a white box with dark text — possibly correct for Google branding (which requires white), but without a comment this reads as a theme oversight, not an intentional exception.
- **Fix**: Keep the hardcoded values (Google Sign-In brand guidelines require a white button) but add a comment:
  ```tsx
  button: {
    backgroundColor: '#ffffff', // Google branding: always white
    borderColor: '#dadce0',     // Google branding: always this grey
  },
  buttonText: {
    color: '#3c4043', // Google branding: always this near-black
  },
  ```
  This makes the intentional exception explicit so future reviewers don't "fix" it.
- **Decision**: FIXED — added Google branding inline comments to sign-in.tsx:75-87

### F3 — signOutRef never updated (stale closure risk)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/auth/session-provider.tsx:39
- **Detail**: `signOutRef` is initialized via `useRef(signOut)` but never updated — unlike `sessionRef` which is synced via `useEffect`. Today this is safe because `signOut` only closes over stable state setters. But `signOutRef.current` in the AppState listener will always call the first-render closure, and any future refactor adding a real dependency to `signOut` will silently break the foreground expiry check.
- **Fix**: Add a ref-sync effect mirroring `sessionRef`:
  ```tsx
  useEffect(() => {
    signOutRef.current = signOut;
  }); // no deps — update every render
  ```
- **Decision**: FIXED — added signOutRef sync effect in session-provider.tsx:41

### F4 — onUnauthorized dual-behavior after 401/403

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/api/client.ts:20-23
- **Detail**: When the server returns 401 or 403, `onUnauthorized()` is called (triggers sign-out) AND the raw response is returned. Callers that inspect the response body after this point do so after the session is already cleared, producing confusing double-error states.
- **Fix A ⭐ Recommended**: Throw after calling `onUnauthorized()` so callers never see the 401/403 body:
  ```ts
  if (response.status === 401 || response.status === 403) {
    onUnauthorized();
    throw new Error('Session expired');
  }
  ```
  - Strength: Callers get a clean throw; no ambiguous state.
  - Tradeoff: Callers using try/catch now need to distinguish this throw from network errors.
  - Confidence: HIGH — the current callers (none yet in S-01 beyond the auth path itself) don't inspect the 401 body.
  - Blind spot: If any future caller wants to read a 401 body (e.g., for a retry-after header), this blocks it.
- **Fix B**: Document the dual-behavior contract with a comment so callers know to check `response.ok` before consuming the body.
  - Strength: No code change; callers retain full flexibility.
  - Tradeoff: Relies on callers reading and following the comment.
  - Confidence: MEDIUM — easy to miss in future.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — throw after onUnauthorized() in client.ts:21

### F5 — Exception message leakage in GoogleTokenVerifier

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/auth/GoogleTokenVerifier.kt:27
- **Detail**: `"Token verification failed: ${e.message}"` propagates the raw library exception message toward the HTTP 401 response via `GlobalExceptionHandler`. Internal details (network error text, library internals) can leak to API clients.
- **Fix**: Use a fixed client-facing message and log the original exception separately:
  ```kotlin
  } catch (e: Exception) {
      logger.warn("Google token verification failed", e)
      throw InvalidGoogleTokenException("Invalid or expired Google ID token")
  }
  ```
- **Decision**: FIXED — logger.warn + fixed client message in GoogleTokenVerifier.kt:27

### F6 — Wrong useColorScheme import in root layout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/_layout.tsx:3
- **Detail**: Imports `useColorScheme` from `'react-native'` instead of `'@/hooks/use-color-scheme'`. The project's custom hook normalizes the `'unspecified'` value. No visible bug today (`=== 'dark'` handles null correctly) but inconsistent with `use-theme.ts` and the rest of the project.
- **Fix**: `import { useColorScheme } from '@/hooks/use-color-scheme';`
- **Decision**: FIXED — swapped to @/hooks/use-color-scheme in _layout.tsx:3

### F7 — BASE_URL duplicated across session-provider and api/client

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/auth/session-provider.tsx:12 and src/api/client.ts:3
- **Detail**: The same `__DEV__ ? 'http://localhost:8080' : (process.env.EXPO_PUBLIC_API_URL ?? '')` expression is defined twice. Future changes (e.g., adding a staging URL) must be applied in two places.
- **Fix**: Extract to `src/api/config.ts`: `export const BASE_URL = __DEV__ ? 'http://localhost:8080' : (process.env.EXPO_PUBLIC_API_URL ?? '');` and import from both files.
- **Decision**: FIXED — extracted to src/api/config.ts; both files now import from it

### F8 — Multi-audience intent undocumented in GoogleTokenVerifier

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/auth/GoogleTokenVerifier.kt:20
- **Detail**: `setAudience(listOfNotNull(clientId, iosClientId.ifBlank { null }))` accepts both web and iOS client IDs without explaining why. Future reviewers may remove the iOS entry as an apparent mistake.
- **Fix**: Add a comment:
  ```kotlin
  // Both client IDs belong to the same GCP project.
  // Native iOS Sign-In issues tokens with the iOS client ID as audience.
  .setAudience(listOfNotNull(clientId, iosClientId.ifBlank { null }))
  ```
- **Decision**: FIXED — added 2-line audience comment in GoogleTokenVerifier.kt:19

### F9 — isLoading not gating RootStack rendering

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/app/_layout.tsx:31
- **Detail**: `RootStack` reads `session` but not `isLoading`. During async restore, `session` is null so the sign-in screen mounts under the splash. This is safe today because `SplashScreen.preventAutoHideAsync()` covers the restore window. If the splash is dismissed early for any reason, a sign-in flash appears.
- **Fix (optional)**: Add `if (isLoading) return null;` before the `<Stack>` in `RootStack` as a defensive belt-and-suspenders measure.
- **Decision**: FIXED — added isLoading guard in _layout.tsx:34
