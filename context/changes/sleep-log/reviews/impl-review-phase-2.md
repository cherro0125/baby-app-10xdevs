<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sleep Log

- **Plan**: context/changes/sleep-log/plan.md
- **Scope**: Phase 2 of 5 (commit 79c1078)
- **Date**: 2026-10-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

**Plan adherence:** every contract point in Phase 2 items 1–3 matches. The only extras are KDoc/comments copied from the feeding pattern and test assertions that go beyond the plan.

**Safety and quality:**
- Authz is clean: the owner is always the requester, and existing rows always go through the owner-or-partner check.
- The native SQL is fully parameterized.
- Column lists match V2/V7/V8, including the CHECK constraints.
- JPA behaves correctly after the native insert, the same as feedings.

**Success criteria:** `./gradlew test` passes (55 tests), and the dev backend starts. The manual rows 2.3 and 2.4 have curl evidence (201 → 200 for the same id, `?create=false` → 404, strength 11 → 400, legacy POST returns the requester's `userId`); the user accepted it.

**Noted, already covered by the plan:** a PUT on a running legacy contraction (`endedAt` null) finalizes it. The engine in Phase 3 uploads finished rows only and ignores server rows without an end (plan-review F2), and the running-contraction sheet is Cancel-only. Nothing to change here.

## Findings

### F1 — No test for `allowCreate = false` on an existing row (the partner-edit path)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: backend/src/test/kotlin/com/babytrack/sleep/SleepServiceTest.kt, backend/src/test/kotlin/com/babytrack/contraction/ContractionServiceTest.kt
- **Detail**: The tests cover `allowCreate = false` only for a missing id. The main path partner edits will take, `allowCreate = false` on an existing row, is untested: it must replace the row without calling `insertIfAbsent`. The plan doesn't require it, and feeding lacks the same test.
- **Fix**: Add one test per entity: `upsert(..., allowCreate = false)` on an existing partner-owned row replaces the fields, keeps the owner, and never calls `insertIfAbsent`.
- **Decision**: FIXED. Added `upsert with allowCreate false on existing partner row replaces it without inserting` to `SleepServiceTest` and `ContractionServiceTest`: the replace succeeds, the owner is kept, and `insertIfAbsent` is never called.

### F2 — Native `insertIfAbsent` SQL is covered only by manual curl checks

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: backend/src/main/kotlin/com/babytrack/sleep/SleepRepository.kt:13-32, backend/src/main/kotlin/com/babytrack/contraction/ContractionRepository.kt:13-32
- **Detail**: The service tests mock `insertIfAbsent`, so the column names, the binding of nullable `strength` and `note`, and the CHECK constraints are only exercised by the manual curl checks 2.3/2.4. Those passed. Feeding has the same gap.
- **Fix**: Optionally add a Testcontainers repository test covering the three `insertIfAbsent` queries (feedings, sleeps, contractions). Testcontainers is already configured (`fd4d1f1`).
- **Decision**: FIXED. New `backend/src/test/kotlin/com/babytrack/InsertIfAbsentRepositoryTest.kt` (`@DataJpaTest` + Testcontainers Postgres, Flyway schema). It covers insert-once / conflict-skip and null optional fields for feedings, sleeps and contractions, plus the `sleep_type` CHECK rejection. `./gradlew test`: 61 tests green.
