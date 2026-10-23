<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Feeding Edit Details

- **Plan**: context/changes/feeding-edit-details/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-10-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated: `./gradlew test` BUILD SUCCESSFUL (40 tests, incl. 19 in FeedingServiceTest); dev backend healthy. Manual 1.3 verified via curl on test account `user-c` (201 → 200, one row, cleared amount/note, 400 on invalid times; test row deleted). All four planned items MATCH; extras (`docker-java.properties`, sleep-log note) were requested by the user.

## Findings

### F1 — Concurrent PUT on the same new id returns 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt:87-101
- **Detail**: With an assigned id and no `Persistable`, `save` merges. Two overlapping PUTs for a new UUID both miss `findById` and both insert; the loser hits the primary key and `DataIntegrityViolationException` falls through to `handleGeneric` → 500. The client can produce this: the init sync and the 5 s poll in `use-feedings.ts` can overlap and upload the same unsynced row. In the same race, merge may update a row committed in between without running the owner/partner check (`user_id` is not updatable, so no ownership hijack). The client would retry and recover, but the endpoint is not idempotent under concurrency as the plan intends.
- **Fix A ⭐ Recommended**: Create via an atomic native `INSERT … ON CONFLICT (id) DO NOTHING`; if no row was inserted, load it and run the existing owner/partner check + replace. Update the sleep-log note to name this pattern.
  - Strength: Truly idempotent; closes the authz race; no reliance on merge semantics.
  - Tradeoff: One native query in `FeedingRepository` listing all columns; Mockito tests must stub it.
  - Confidence: HIGH — standard Postgres pattern; schema has `id` PK.
  - Blind spot: Native query bypasses JPA lifecycle (no entity listeners exist today).
- **Fix B**: Map `DataIntegrityViolationException` to 409 and let the client retry on the next sync.
  - Strength: Two-line change in `GlobalExceptionHandler`.
  - Tradeoff: A benign duplicate upload surfaces as an error; authz race in merge stays.
  - Confidence: MED — relies on client retry behaviour from phase 2.
  - Blind spot: Other constraint violations would also become 409.
- **Decision**: FIXED via Fix A — `FeedingRepository.insertIfAbsent` (ON CONFLICT DO NOTHING) + owner/partner check; `@GeneratedValue` restored on `Feeding.id` (no longer needed for the upsert); sleep-log note updated. Live check: 5 parallel PUTs → 201 + 4×200, one row

### F2 — Malformed or invalid request bodies return 500 instead of 400

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt:108
- **Detail**: `GlobalExceptionHandler` does not extend `ResponseEntityExceptionHandler`, so `HttpMessageNotReadableException` (missing required field) and `MethodArgumentNotValidException` (`@Positive`, `@Size`) are caught by `handleGeneric` → 500. Pre-existing for all endpoints; the new PUT inherits it.
- **Fix**: Add handlers mapping both exceptions to a 400 `ProblemDetail` (`urn:babytrack:error:invalid-request`).
- **Decision**: FIXED — 400 handler for HttpMessageNotReadableException + MethodArgumentNotValidException (live: missing milkType → 400, amountMl 0 → 400)

### F3 — POST response carries a random userId

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt:29-37
- **Detail**: `create()` does not set the read-only `userId` mirror, so the returned `FeedingDto.userId` is the random default until reload (pre-existing; `upsert` sets it). The app ignores the POST body and stops calling POST in phase 2.
- **Fix**: Pass `userId = userId` when constructing the feeding in `create()`.
- **Decision**: FIXED — create() sets the userId mirror (live: POST returns the requester's id)
