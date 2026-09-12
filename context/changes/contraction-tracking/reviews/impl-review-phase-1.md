<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Contraction Tracking — Phase 1

- **Plan**: context/changes/contraction-tracking/plan.md
- **Scope**: Phase 1 of 6
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — finalize() has no idempotency guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionService.kt:23
- **Detail**: `finalize()` has no guard on whether `endedAt` is already set. A client retry on network error (common on mobile) silently overwrites the existing `endedAt` and `durationSeconds` with whatever the retry sends, corrupting a previously valid record.
- **Fix A ⭐ Recommended**: Add an early-exit guard — `if (contraction.endedAt != null) return contraction` — so finalize is idempotent and retries are safe.
  - Strength: Zero-cost fix; makes the operation retry-safe without adding a new exception path. Clients get the already-finalized record back which is correct behavior.
  - Tradeoff: Silently accepts the duplicate call. If you want the client to know the record was already finalized, Fix B is preferable.
  - Confidence: HIGH — idempotent PATCH is standard REST practice for finalization endpoints.
  - Blind spot: None significant.
- **Fix B**: Throw `ContractionAlreadyFinalizedException` (400) so the client knows the record is immutable.
  - Strength: Makes the contract explicit — client gets a clear error instead of a silent no-op.
  - Tradeoff: Requires a new exception class + handler; mobile client must handle a new 400 case.
  - Confidence: MEDIUM — adds complexity for a case that shouldn't happen under normal operation.
  - Blind spot: Whether the mobile client retries on 400 or only on 5xx/timeout.
- **Decision**: FIXED via Fix A — added `if (contraction.endedAt != null) return contraction` guard

### F2 — No validation that endedAt > startedAt

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionService.kt:28
- **Detail**: `ChronoUnit.SECONDS.between(startedAt, endedAt)` returns a negative long if `endedAt` is before `startedAt`. The `.toInt()` call silently stores a negative `durationSeconds`, corrupting the record. No input validation guards against this.
- **Fix**: Add `require(endedAt.isAfter(contraction.startedAt)) { "endedAt must be after startedAt" }` at the top of `finalize()`, and add an `@ExceptionHandler(IllegalArgumentException::class)` → 400 ProblemDetail to `GlobalExceptionHandler`.
- **Decision**: FIXED — added require() guard in ContractionService.kt + IllegalArgumentException handler in GlobalExceptionHandler.kt

### F3 — Ownership check is non-atomic (TOCTOU)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionService.kt:24
- **Detail**: Both `finalize()` and `delete()` use `findById(id).filter { it.user.id == userId }`. This loads the row by PK, then checks ownership in memory. Two concurrent requests for the same record can both pass the ownership check before either writes, and the second write clobbers the first. It also loads the full entity for requests that will be denied.
- **Fix A ⭐ Recommended**: Add a repository method `findByIdAndUserId(id: UUID, userId: UUID): Optional<Contraction>` so the ownership predicate runs in SQL atomically. Replace both `findById(...).filter { ... }` calls with this method.
  - Strength: Atomic, no TOCTOU gap; also more efficient (no row load on unauthorized access). One-line change per call site.
  - Tradeoff: Adds a derived query method to the repo — minor surface area increase.
  - Confidence: HIGH — standard Spring Data JPA pattern.
  - Blind spot: None significant.
- **Fix B**: Keep the current pattern but add `@Lock(LockModeType.PESSIMISTIC_WRITE)` to the `findById` call.
  - Strength: Prevents concurrent writes to the same row.
  - Tradeoff: Adds DB-level locking overhead; overkill for a single-user app where the race is theoretical.
  - Confidence: LOW — pessimistic locking is too heavy for this use case.
  - Blind spot: Still loads the row on unauthorized access.
- **Decision**: SKIPPED

### F4 — list() is unbounded with no pagination

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt:70
- **Detail**: `GET /api/contractions` returns all contractions for the user with no `LIMIT`. For the immediate labor-tracking use case (~50–200 contractions per session) this is benign, but the endpoint has no guardrail. If the app grows to long-term tracking it becomes an unbounded read.
- **Fix**: Add `Top200` to the derived query name (`findTop200ByUserIdOrderByStartedAtDesc`) as a hard safety ceiling until pagination is designed. Zero API surface change — the endpoint contract stays the same.
- **Decision**: FIXED — renamed to findTop200ByUserIdOrderByStartedAtDesc in ContractionRepository.kt and ContractionService.kt

### F5 — user.id access via lazy proxy is implicit

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt:34
- **Detail**: `toDto()` accesses `user.id` on a `@ManyToOne(fetch = FetchType.LAZY)` proxy. Hibernate 5+/6 resolves `@Id` from the already-loaded FK value without issuing a SELECT, so there is no N+1 in practice. But this relies on an internal Hibernate optimization invisible to future readers.
- **Fix**: Add `@Column(name = "user_id", insertable = false, updatable = false) val userId: UUID` directly to `Contraction.kt` and map from that in `toDto()`. Makes the FK value explicit and Hibernate-independent.
- **Decision**: FIXED — added explicit userId column to Contraction.kt; toDto() now uses userId instead of user.id

### F6 — @JoinColumn missing updatable = false

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/Contraction.kt:24
- **Detail**: `@JoinColumn(name = "user_id", nullable = false)` does not set `updatable = false`. The owning user of a contraction should never change. `User.kt` uses `updatable = false` on `createdAt`; the same intent applies here.
- **Fix**: Change to `@JoinColumn(name = "user_id", nullable = false, updatable = false)`.
- **Decision**: FIXED — applied while fixing F5

### F7 — Unchecked cast in principal() has no local safety net

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/contraction/ContractionController.kt:50
- **Detail**: `SecurityContextHolder.getContext().authentication.principal as AuthenticatedUser` is an unchecked cast. If the Spring Security gate is ever relaxed (e.g., a route accidentally re-permitted), this throws `ClassCastException` or NPE as an unhandled 500. The current config prevents this, but there is no local guard.
- **Fix**: Change to `authentication?.principal as? AuthenticatedUser ?: throw IllegalStateException("No authenticated principal")` and add an `@ExceptionHandler(IllegalStateException::class)` → 500 with a safe body to `GlobalExceptionHandler`.
- **Decision**: FIXED — safe cast with IllegalStateException fallback in ContractionController.kt; handler added to GlobalExceptionHandler.kt

### F8 — No catch-all exception handler; getReferenceById is unguarded

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt
- **Detail**: `GlobalExceptionHandler` has no catch-all `@ExceptionHandler(Exception::class)`. Unhandled exceptions — notably `JpaObjectRetrievalFailureException` from `userRepository.getReferenceById(userId)` in `ContractionService.start()` (thrown when a user's JWT is valid but the user row was deleted) — fall through to Spring Boot's default `/error` handler. That handler's response shape (`timestamp`, `status`, `error`, `path`) is inconsistent with the `ProblemDetail` format used by all explicit handlers.
- **Fix**: Add an `@ExceptionHandler(Exception::class)` fallback that returns a generic `ProblemDetail(500)` with a safe, non-leaking message. Also add a specific handler for `JpaObjectRetrievalFailureException` → 404 (or 401) with a `urn:babytrack:error:user-not-found` type URI.
- **Decision**: FIXED — added JpaObjectRetrievalFailureException → 404 handler and Exception catch-all → 500 handler to GlobalExceptionHandler.kt
