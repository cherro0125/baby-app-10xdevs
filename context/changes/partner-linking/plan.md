# Plan: Partner Linking (S-02)

- **Change ID**: partner-linking
- **Status**: planned
- **Created**: 2026-09-13

## Overview

Implement the partner invite-and-link flow end-to-end: backend tables + API (invite generation, accept, unlink, status) and a new frontend Partner tab with invite generation (deep link + short code), code-entry for accepting an invite, and a confirmation screen. Two accounts link symmetrically; either partner can unlink.

## Current State Analysis

- **Backend**: `users` table has `id, google_sub, email, display_name, created_at, updated_at`. No `partner_id`, no invite table, no partner relationship infrastructure. Auth pattern is fully established: `JwtFilter` → `AuthenticatedUser` principal → `principal()` helper in controllers.
- **Frontend**: `UserDto` has `id, email, displayName`. Session persisted via `expo-secure-store`. `babytrack://` URL scheme already in `app.json`. No deep link handling code exists. One tab currently (`Contractions`). `useSession()` + `createApiClient()` patterns established.

## Desired End State

A user on the Partner tab can generate an invite (displays an 8-char code + opens the system share sheet with a `babytrack://partner?token=XYZ` deep link). Their partner either enters the code in their own Partner tab or taps the deep link; either path opens a confirmation screen showing the inviter's name and email. On Accept, both accounts are linked and the Partner tab shows the partner's name, email, and an Unlink button. Unlink removes the partnership from both accounts simultaneously.

### Key Discoveries

- `babytrack://` scheme is already in `app.json:8` — Expo Router will route `babytrack://partner?token=XYZ` to `src/app/(app)/partner.tsx` automatically; no custom `Linking` config needed.
- `partner.tsx` reads `useLocalSearchParams()` for a `token` param; when present, the screen shows the accept-invite flow instead of the invite-generation flow.
- `ContractionController.kt` / `ContractionService.kt` / `ContractionException.kt` are the exact patterns to follow for the new partner backend module.
- `partner_links` uses UNIQUE on each FK column (`user_a_id`, `user_b_id`) so that each user can belong to at most one partnership, enforced at the DB level.

## What We're NOT Doing

- Push notifications when partner accepts/unlinks (S-04+)
- Partner-side data visibility (shared contraction log) — that is S-04
- QR code invite (v2, PRD §Non-Goals)
- Email invite (explicitly out of scope, PRD §Non-Goals)
- App-not-installed deep link fallback (v2)

---

## Phase 1: Backend — migrations, service, controller

### Overview

Create the V3 Flyway migration (two new tables), the `PartnerInvite` and `PartnerLink` JPA entities, repositories, `PartnerService` (all business logic), `PartnerController` (5 endpoints), and exception classes.

### Changes Required

#### 1. V3 migration

**File**: `backend/src/main/resources/db/migration/V3__create_partner_tables.sql`

**Intent**: Create `partner_invites` (pending invites with tokens) and `partner_links` (active partnerships between two users). Both reference `users.id` with `ON DELETE CASCADE`.

**Contract**:
```sql
CREATE TABLE partner_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(8) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_partner_invites_token   ON partner_invites(token);
CREATE INDEX idx_partner_invites_inviter ON partner_invites(inviter_id);

CREATE TABLE partner_links (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a_id <> user_b_id)
);
```
The UNIQUE on `user_a_id` and `user_b_id` each enforce "at most one partnership per user" at the DB level.

#### 2. PartnerInvite entity

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerInvite.kt`

**Intent**: JPA entity mirroring `partner_invites`. Follow the `Contraction.kt` pattern: `@Entity`, `@Table`, `@Column` names matching snake_case DB columns, `Instant` for timestamps.

**Contract**: Fields: `id: UUID`, `inviterId: UUID`, `token: String`, `expiresAt: Instant`, `acceptedAt: Instant?`, `createdAt: Instant`. No `@ManyToOne` — store the raw UUID FK (same as `Contraction.userId`).

#### 3. PartnerLink entity

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerLink.kt`

**Intent**: JPA entity mirroring `partner_links`. Same conventions as `PartnerInvite`.

**Contract**: Fields: `id: UUID`, `userAId: UUID`, `userBId: UUID`, `createdAt: Instant`.

#### 4. PartnerInviteRepository + PartnerLinkRepository

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerRepository.kt`

**Intent**: Two `JpaRepository` interfaces in one file. Invite repo needs: `findByToken(token: String): PartnerInvite?` and `findByInviterIdAndAcceptedAtIsNull(inviterId: UUID): PartnerInvite?`. Link repo needs: `findByUserAIdOrUserBId(userAId: UUID, userBId: UUID): PartnerLink?` and `deleteByUserAIdOrUserBId(userAId: UUID, userBId: UUID)`.

#### 5. PartnerException classes

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerException.kt`

**Intent**: Three domain exceptions following `ContractionException.kt` — one class per error state.

**Contract**:
- `class PartnerInviteNotFoundException(message: String) : RuntimeException(message)`
- `class PartnerInviteExpiredException(message: String) : RuntimeException(message)`
- `class AlreadyLinkedException(message: String) : RuntimeException(message)`

#### 6. GlobalExceptionHandler — three new handlers

**File**: `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`

**Intent**: Register handlers for the three new exceptions. Follow the existing `ContractionNotFoundException` pattern.

**Contract**:
- `PartnerInviteNotFoundException` → `HttpStatus.NOT_FOUND`, type `urn:babytrack:error:invite-not-found`
- `PartnerInviteExpiredException` → `HttpStatus.GONE` (410), type `urn:babytrack:error:invite-expired`
- `AlreadyLinkedException` → `HttpStatus.CONFLICT` (409), type `urn:babytrack:error:already-linked`

#### 7. PartnerService

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt`

**Intent**: All partner business logic. Token generation uses `SecureRandom` with the unambiguous charset `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (30 chars, avoids 0/O/1/I/L confusion) to produce an 8-character code.

**Contract** — five methods:
- `generateInvite(inviterId: UUID): PartnerInviteDto` — if a non-expired, non-accepted invite already exists for this inviter, return it; otherwise create a new one. Expiry = `Instant.now() + 24h`.
- `getInviteInfo(token: String): InviterInfoDto` — find the invite by token; throw `PartnerInviteNotFoundException` if absent, `PartnerInviteExpiredException` if `expiresAt` is in the past or `acceptedAt` is set. Return the inviter's `displayName` and `email` (fetched via `UserRepository.findById`).
- `acceptInvite(token: String, acceptingUserId: UUID): PartnerLinkDto` — validate the token (same checks as `getInviteInfo`); throw `AlreadyLinkedException` if either the inviter or the accepting user already appear in `partner_links`; create the link row (smaller UUID in `userAId`, larger in `userBId`); mark `acceptedAt = Instant.now()`.
- `getPartnerStatus(userId: UUID): PartnerDto?` — query `partner_links` for this user; if found, fetch the partner's `User` row and return `PartnerDto`; if not found, return `null`.
- `unlink(userId: UUID)` — delete the `partner_links` row matching this user (either column); no-op if not linked.

#### 8. PartnerController

**File**: `backend/src/main/kotlin/com/babytrack/partner/PartnerController.kt`

**Intent**: Five endpoints under `@RequestMapping("/api/partner")`. Follow `ContractionController.kt`'s `principal()` helper pattern.

**Contract**:
- `POST /api/partner/invite` → 201 + `PartnerInviteDto(token, deepLink, expiresAt)`. `deepLink` is `"babytrack://partner?token=${invite.token}"`.
- `GET /api/partner/invite/{token}` → 200 + `InviterInfoDto(inviterName, inviterEmail)`. Auth required (accepting user must be signed in).
- `POST /api/partner/link` → body `{ token: String }` → 200 + `PartnerLinkDto(partnerId, partnerName, partnerEmail)`.
- `DELETE /api/partner` → 204. Symmetric unlink.
- `GET /api/partner` → 200 + `PartnerDto(id, email, displayName)` or 404 if not linked.

### Success Criteria

#### Automated Verification
- `./gradlew bootRun` starts without error; V3 migration applies cleanly
- `POST /api/partner/invite` returns 201 with `token` (8 chars) and `deepLink`
- `GET /api/partner/invite/{token}` returns inviter name/email
- `POST /api/partner/link` links two users; subsequent call from either returns 409
- `GET /api/partner` returns partner info for a linked user, 404 for unlinked
- `DELETE /api/partner` returns 204; both users return 404 from `GET /api/partner` after

#### Manual Verification
- V3 migration visible in startup logs; `partner_invites` and `partner_links` tables exist in DB
- Expired token (set `expires_at` to the past manually) returns 410 from `GET /api/partner/invite/{token}`

---

## Phase 2: Frontend — Partner tab + invite generation + status display

### Overview

Add a Partner tab to the navigation, build the `partner.tsx` screen (invite generation, partner status, unlink), and a `usePartner` hook.

### Changes Required

#### 1. usePartner hook

**File**: `src/hooks/use-partner.ts`

**Intent**: Encapsulate all partner API calls and partner state. Follow `useContractions`'s pattern: `createApiClient` with `sessionRef` for latest token, best-effort error handling at API boundaries.

**Contract**: Returns `{ partner: PartnerDto | null, isLoading: boolean, generateInvite, unlink }`. `partner` is fetched from `GET /api/partner` on mount; `null` means not linked. `generateInvite()` calls `POST /api/partner/invite` and returns `{ token, deepLink }`. `unlink()` calls `DELETE /api/partner` and clears `partner` state.

#### 2. Partner screen — invite generation and status

**File**: `src/app/(app)/partner.tsx`

**Intent**: Two UI states depending on whether the user is linked:
- **Unlinked** (no `partner`, no `token` param): shows an "Invite your partner" button; after `generateInvite()` resolves, shows the 8-char code in a large monospace display + a "Share invite link" button that opens the system share sheet via `Share.share({ message: deepLink })` from `react-native`.
- **Linked**: shows partner's `displayName` and `email`, plus an "Unlink" button with an inline confirmation ("Are you sure? This removes the link for both of you." + Confirm/Cancel).

Uses `ThemedView`, `ThemedText`, `Spacing` from the established theme system. No hardcoded colors.

#### 3. App tabs — add Partner trigger

**File**: `src/components/app-tabs.tsx`

**Intent**: Add a second `NativeTabs.Trigger` for the `partner` route. Use a placeholder icon from `@/assets/images/tabIcons/` (copy `home.png` as `partner.png` — replace with proper icon in S-04).

**Contract**: New trigger with `name="partner"` and label "Partner" added after the existing `index` trigger.

**File**: `src/components/app-tabs.web.tsx`

**Intent**: Mirror the same Partner tab addition for web. Follow the existing web tab bar pattern.

### Success Criteria

#### Automated Verification
- `npm run lint` passes
- TypeScript compiles (`npx tsc --noEmit`)

#### Manual Verification
- Partner tab appears in the tab bar
- Tapping "Invite your partner" shows the 8-char code and a share button
- Share button opens the system share sheet with the `babytrack://` deep link
- After linking (tested in Phase 3), Partner tab shows partner name, email, and Unlink button
- Tapping Unlink shows inline confirmation; confirming calls the API and returns to unlinked state

---

## Phase 3: Frontend — accept-invite flow (code entry + deep link)

### Overview

Add code-entry to the Partner tab for manually entering a partner's code, handle the `token` query param from the deep link, fetch inviter info, and wire the Accept/Decline flow.

### Changes Required

#### 1. usePartner hook — accept functions

**File**: `src/hooks/use-partner.ts`

**Intent**: Add two new functions to the hook returned object: `getInviteInfo(token)` and `acceptInvite(token)`.

**Contract**:
- `getInviteInfo(token: string): Promise<{ inviterName: string | null, inviterEmail: string }>` — calls `GET /api/partner/invite/{token}`; throws on non-ok (caller handles 404/410 errors for display).
- `acceptInvite(token: string): Promise<void>` — calls `POST /api/partner/link` with `{ token }`; on success, refreshes `partner` state from the response.

#### 2. Partner screen — code entry + accept/decline confirmation

**File**: `src/app/(app)/partner.tsx`

**Intent**: Extend the unlinked view with two additions:
1. **Code entry**: a `TextInput` (uppercase, max 8 chars) + "Link" button. On submit, call `getInviteInfo(code)` — on success, transition to the confirmation view; on 404, show "Code not found"; on 410, show "This invite has expired".
2. **Confirmation view** (shown when `inviterInfo` is in state OR when `token` query param is present and `getInviteInfo` resolves): displays "Link with [inviterName] ([inviterEmail])?" with Accept and Decline buttons. Accept calls `acceptInvite(token)` → on success, the screen transitions to the linked state. Decline clears the `inviterInfo` state and returns to the invite-generation view.

**Deep link wiring**: Read `const { token } = useLocalSearchParams<{ token?: string }>()` at the top of the screen. In a `useEffect([token])`, if `token` is present, call `getInviteInfo(token)` automatically — the user arrives at the confirmation view without having to type anything.

#### 3. Typed route — declare partner.tsx accepts token param

**File**: `src/app/(app)/partner.tsx`

**Intent**: Expo Router with typed routes requires the screen to declare its search params. `useLocalSearchParams<{ token?: string }>()` is the call; no separate config file needed — Expo Router infers from usage.

### Success Criteria

#### Automated Verification
- `npm run lint` passes
- TypeScript compiles

#### Manual Verification
- Enter a valid code in the code-entry field → confirmation screen shows inviter name/email
- Enter an invalid code → "Code not found" error shown
- Accept → Partner tab shows linked state with partner's name and email
- Decline → returns to invite-generation view
- Open `babytrack://partner?token=VALIDTOKEN` on the device → app opens directly to confirmation screen
- Open `babytrack://partner?token=EXPIREDTOKEN` → "This invite has expired" error shown

---

## References

- PRD: `context/foundation/prd.md` §FR-005, FR-007, FR-008
- Backend auth pattern: `backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt`
- Frontend hook pattern: `src/hooks/use-contractions.ts`
- Deep link scheme: `app.json:8` (`"scheme": "babytrack"`)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — migrations, service, controller

#### Automated
- [x] 1.1 ./gradlew bootRun starts; V3 migration applies cleanly — 2618d52
- [x] 1.2 POST /api/partner/invite → 201 with token and deepLink — 2618d52
- [x] 1.3 GET /api/partner/invite/{token} → inviter name/email — 2618d52
- [x] 1.4 POST /api/partner/link → 200; second call → 409 — 2618d52
- [x] 1.5 GET /api/partner → partner info when linked, 404 when not — 2618d52
- [x] 1.6 DELETE /api/partner → 204; both sides return 404 after — 2618d52

#### Manual
- [x] 1.7 V3 migration visible in startup logs; both tables exist in DB — 2618d52
- [x] 1.8 Expired token returns 410 — 2618d52

### Phase 2: Frontend — Partner tab + invite generation

#### Automated
- [ ] 2.1 npm run lint passes
- [ ] 2.2 TypeScript compiles

#### Manual
- [ ] 2.3 Partner tab appears in tab bar
- [ ] 2.4 Invite your partner shows code + share button
- [ ] 2.5 Share button opens system share sheet with babytrack:// link

### Phase 3: Frontend — accept-invite flow

#### Automated
- [ ] 3.1 npm run lint passes
- [ ] 3.2 TypeScript compiles

#### Manual
- [ ] 3.3 Valid code entry → confirmation screen with inviter name/email
- [ ] 3.4 Invalid code → "Code not found" error
- [ ] 3.5 Accept → Partner tab shows linked state
- [ ] 3.6 Decline → returns to invite-generation view
- [ ] 3.7 Deep link opens confirmation screen directly
- [ ] 3.8 Expired token deep link → "This invite has expired"
