<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Real-time Shared Contractions

- **Plan**: context/changes/real-time-shared-contractions/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-14
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification

- ✅ `./gradlew test` — all tests passed (exit code 0)
- ✅ `./gradlew compileKotlin` — compiles clean
- ✅ Plan Adherence — drift agent found all 4 files MATCH; 0 DRIFT, 0 MISSING

## Success Criteria Verification

All Phase 1 progress rows are `[x]` with SHA `a9296f2`. Manual items 1.4–1.8 were verified via code inspection in the prior session and marked complete.

## Findings

### F1 — Empty-collection IN clause allowed

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionRepository.kt:8
- **Detail**: `findTop200ByUserIdInOrderByStartedAtDesc` accepts `Collection<UUID>`. Passing an empty collection produces `WHERE user_id IN ()` which is a SQL syntax error on PostgreSQL. Current callers always pass exactly 2 UUIDs so this is not a live bug, but the API surface is unsafe for future callers.
- **Fix**: Replace `Collection<UUID>` with a two-parameter overload `findTop200ByUserIdOrUserIdOrderByStartedAtDesc(a: UUID, b: UUID)` — always safe — or add `require(userIds.isNotEmpty())` in `ContractionService.listShared`.
- **Decision**: FIXED — renamed to two-param overload `findTop200ByUserIdOrUserIdOrderByStartedAtDesc(a, b)`; updated call site in ContractionService.listShared

### F2 — Link-resolution logic duplicated in PartnerService

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/partner/PartnerService.kt:84
- **Detail**: `getPartnerId` (new) and `getPartnerStatus` (existing) both call `partnerLinkRepository.findByUserAIdOrUserBId(userId, userId)` and apply `if (link.userAId == userId) link.userBId else link.userAId`. If the link-resolution rule changes, both methods must be updated.
- **Fix**: Extract a `private fun resolvePartnerId(userId: UUID): UUID?` helper; `getPartnerId` returns its result directly, `getPartnerStatus` builds on it. Two-line change.
- **Decision**: FIXED — extracted `private fun resolvePartnerId(userId: UUID): UUID?`; `getPartnerStatus` and `getPartnerId` both delegate to it
