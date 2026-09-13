# Plan Brief: Partner Linking

**Change ID**: partner-linking  
**Phases**: 3  
**Backend / Frontend split**: Phase 1 is backend only; Phases 2–3 are frontend only.

---

## What we're building

A partner invite-and-link flow. One user generates an 8-character invite code; their partner enters it (or taps a deep link) to see a confirmation screen and accept. Both accounts link symmetrically; either can unlink.

## Phase summary

| Phase | What ships | Key files |
|-------|-----------|-----------|
| 1 | Backend: V3 migration + `PartnerInvite`/`PartnerLink` entities + `PartnerService` + `PartnerController` (5 endpoints) | `V3__create_partner_tables.sql`, `PartnerService.kt`, `PartnerController.kt`, `PartnerException.kt`, `GlobalExceptionHandler.kt` |
| 2 | Frontend: `usePartner` hook + `partner.tsx` screen (invite generation + linked status + unlink) + Partner tab added to `app-tabs.tsx` | `src/hooks/use-partner.ts`, `src/app/(app)/partner.tsx`, `src/components/app-tabs.tsx` |
| 3 | Frontend: code-entry + deep link handling + confirmation screen wired to backend accept endpoint | `src/app/(app)/partner.tsx` (extend), `src/hooks/use-partner.ts` (extend) |

## Key constraints

- Token: 8-char unambiguous uppercase alphanumeric (`SecureRandom`, charset avoids 0/O/1/I/L)
- Deep link: `babytrack://partner?token=XYZ` → `src/app/(app)/partner.tsx` via Expo Router (no custom `Linking` config needed — scheme already in `app.json`)
- Already linked → 409; expired token → 410; not found → 404
- Unlink is symmetric: deletes the `partner_links` row for both users
- `partner_links` has UNIQUE on both FK columns — DB-enforced one-partnership-per-user
- No hardcoded colors; use `useTheme()` / `ThemedText` / `ThemedView`
- React Compiler active — no manual `useMemo`/`useCallback`

## Not in scope

Push notifications, shared data view, QR code, email invite, app-not-installed fallback.

## Start here

```
/10x-implement partner-linking phase 1
```
