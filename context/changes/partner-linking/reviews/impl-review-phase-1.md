<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Partner Linking

- **Plan**: context/changes/partner-linking/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-14
- **Verdict**: REJECTED
- **Findings**: 2 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Race condition in generateInvite

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:27
- **Detail**: Two concurrent requests from the same inviterId both pass the `findByInviterIdAndAcceptedAtIsNull` check (both see null or expired) and both insert. No DB-level uniqueness guard on active invites per user. This produces duplicate active invite rows; subsequent `findByInviterIdAndAcceptedAtIsNull` returns an arbitrary one.
- **Fix A ⭐ Recommended**: Add partial unique index in V4 migration: `CREATE UNIQUE INDEX idx_partner_invites_active_inviter ON partner_invites(inviter_id) WHERE accepted_at IS NULL;` — concurrent second insert throws `DataIntegrityViolationException` and the `@Transactional` rollback is clean.
  - Strength: DB enforces the invariant; no app-layer change needed for correctness.
  - Tradeoff: Requires a new V4 migration (one SQL line).
  - Confidence: HIGH — standard PostgreSQL partial unique index pattern.
  - Blind spot: Service still returns 500 on the race loser; a catch-and-return of the existing row would be cleaner UX but is optional.
- **Fix B**: Add a SELECT-FOR-UPDATE in `generateInvite` to serialize concurrent access.
  - Strength: No migration needed; avoids the 500 on the race loser.
  - Tradeoff: Requires `@Lock(LockModeType.PESSIMISTIC_WRITE)` custom query; more complex service code; row-level lock on every invite generation.
  - Confidence: MEDIUM — adds contention on high traffic.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — V4 migration adds partial unique index on `partner_invites(inviter_id) WHERE accepted_at IS NULL`

### F2 — Self-link not guarded — unhandled 500

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:54
- **Detail**: No guard for `acceptingUserId == invite.inviterId`. If a user accepts their own invite (possible with shared token), UUID ordering produces `userAId == userBId`, violating the DB `CHECK (user_a_id <> user_b_id)` constraint. Surfaces as unhandled `DataIntegrityViolationException` → 500.
- **Fix**: Add `require(acceptingUserId != inviterId) { "Cannot accept your own invite" }` at the top of `acceptInvite`. Maps to the existing `IllegalArgumentException` → 400 handler.
- **Decision**: FIXED — `require(acceptingUserId != inviterId)` added to `acceptInvite` in `PartnerService.kt`

### F3 — LinkRequest missing @Valid / @NotBlank

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerController.kt:22
- **Detail**: `ContractionController` uses `@field:NotNull` + `@Valid` on all request bodies. `LinkRequest(val token: String)` has no constraint annotation; the controller handler has no `@Valid`. A blank or empty token reaches the service and issues a DB lookup.
- **Fix**: Add `@field:NotBlank` on `LinkRequest.token` and `@Valid` on the `@RequestBody` parameter in `acceptInvite`.
- **Decision**: FIXED — `@field:NotBlank` added to `LinkRequest` and `@Valid` added to `acceptInvite` in `PartnerController.kt`

### F4 — Redundant index on token column

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/resources/db/migration/V3__create_partner_tables.sql:9
- **Detail**: `token VARCHAR(8) NOT NULL UNIQUE` already causes PostgreSQL to create a unique B-tree index. `CREATE INDEX idx_partner_invites_token ON partner_invites(token)` adds a second non-unique index on the same column — maintained on every write with no lookup benefit.
- **Fix**: Remove `CREATE INDEX idx_partner_invites_token` (line 9). The UNIQUE constraint's implicit index covers all token lookups.
- **Decision**: FIXED — V4 migration drops `idx_partner_invites_token`

### F5 — deleteByUserId vs plan-specified deleteByUserAIdOrUserBId

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerRepository.kt:14
- **Detail**: Plan specified `deleteByUserAIdOrUserBId(UUID, UUID)` as the contract. Implementation uses a one-parameter custom JPQL method `deleteByUserId(UUID)`. Functionally identical at runtime, but the contract surface (name, arity) differs from what the plan declared.
- **Fix**: This is an improvement over the plan spec (cleaner signature, avoids passing the same UUID twice). Accept as-is — document in plan as an addendum or skip. No behavioral regression.
- **Decision**: SKIPPED — accepted as-is (cleaner signature than plan spec; no behavioral regression)

### F6 — toInviteDto() placed in service file, not controller

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:93
- **Detail**: `fun PartnerInvite.toInviteDto()` is defined in `PartnerService.kt`. The established pattern (see `ContractionController.kt:34`) places entity-to-DTO mappings in the controller file. This also creates a cross-file dependency: the service file uses `PartnerInviteDto` defined in the controller file.
- **Fix**: Move `toInviteDto()` to `PartnerController.kt` alongside the other DTO definitions.
- **Decision**: FIXED — `toInviteDto()` moved from `PartnerService.kt` to `PartnerController.kt`

### F7 — acceptInvite returns 200 instead of 201

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerController.kt:49
- **Detail**: `acceptInvite` creates a new `PartnerLink` resource but returns `ResponseEntity.ok(dto)` (200). The contraction controller returns 201 Created when creating a new resource.
- **Fix**: Change to `ResponseEntity.status(HttpStatus.CREATED).body(dto)`.
- **Decision**: FIXED — `acceptInvite` now returns `HttpStatus.CREATED` (201)

### F8 — Deep-link scheme hardcoded in service

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:97
- **Detail**: `"babytrack://partner?token=$token"` is a hardcoded string literal. If the scheme changes (e.g. for staging), this must be hunted down.
- **Fix**: Extract to a named constant or `@Value`-injected property. Accept as-is for now and revisit if a staging scheme is ever needed.
- **Decision**: SKIPPED — accepted as-is; revisit if staging scheme diverges

### F9 — Unlink does not invalidate pending invites

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:84
- **Detail**: `unlink()` deletes the `PartnerLink` row but leaves any open `PartnerInvite` rows intact. Someone could re-link the unlinked user within the 24h window using their old token without the user generating a new one.
- **Fix**: Add `partnerInviteRepository.deleteByInviterIdAndAcceptedAtIsNull(userId)` inside `unlink()`, or document the accepted behaviour in a comment.
- **Decision**: FIXED — `deleteByInviterIdAndAcceptedAtIsNull(userId)` added to `unlink()` in `PartnerService.kt`; repository method added to `PartnerInviteRepository`
