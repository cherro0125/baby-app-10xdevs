<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Feeding Log — Phase 1

- **Plan**: context/changes/feeding-log/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — durationMinutes client-trusted, not server-derived

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt:33
- **Detail**: `ContractionService.update` auto-derives `durationSeconds` server-side via `ChronoUnit.SECONDS.between(startedAt, endedAt)`. `FeedingService.create` and `update` accept whatever the client sends for `durationMinutes` and persist it verbatim — no cross-check that it is consistent with `(endedAt - startedAt)`. A client could send `startedAt=T, endedAt=T+2min, durationMinutes=60` and store a nonsensical 60-minute duration. If analytics ever rely on `duration_minutes`, the data is unreliable.
- **Fix A ⭐ Recommended**: Server-derive `durationMinutes` from `ChronoUnit.MINUTES.between(startedAt, endedAt).toInt()` inside `FeedingService.create/update`, and remove it from both request DTOs.
  - Strength: Makes `duration_minutes` authoritative and consistent with the Contraction pattern; removes a class of client-controlled data corruption.
  - Tradeoff: The completion sheet computes elapsed time client-side and currently sends it. Removing it from the DTO means the server value will be rounded to whole minutes (potentially off by seconds vs. client-computed); acceptable for MVP.
  - Confidence: HIGH — ContractionService does exactly this.
  - Blind spot: The frontend hook (`use-feedings.ts`) hasn't been written yet; removing it from the DTO now is lower cost than after Phase 2/3.
- **Fix B**: Add a cross-check validation in the service: `require(durationMinutes == null || abs(durationMinutes - ChronoUnit.MINUTES.between(startedAt, endedAt)) <= 1)`.
  - Strength: Keeps the field client-sendable (useful if the client wants sub-minute precision) while catching obvious mismatches.
  - Tradeoff: Still trusts the client for the stored value; tolerance window is arbitrary.
  - Confidence: MEDIUM — tolerance logic introduces ambiguity.
  - Blind spot: If the client sends `null`, the check is skipped entirely.
- **Decision**: FIXED via Fix A — removed durationMinutes from both request DTOs; FeedingService now derives it server-side via ChronoUnit.MINUTES.between(startedAt, endedAt)

### F2 — Optional PATCH fields can never be cleared once set

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingService.kt:63
- **Detail**: `update()` uses `if (field != null) entity.field = field` for `durationMinutes`, `amountMl`, and `note`. Sending null in a PATCH body is treated as "no change". A client that has set a note cannot clear it via the API. This is a real behavioral gap — the plan says UpdateFeedingRequest fields are "all optional" but does not address null-clearing semantics.
- **Fix**: Accept the current limitation for Phase 1 and document it in the plan as a known constraint (clearing optional fields is a Phase 1 non-goal). Add a plan note that a follow-up can introduce an explicit sentinel or `Optional<T>` approach if needed. Low urgency since the only editable fields in Phase 3's UI are `startedAt`/`endedAt` (times only).
- **Decision**: SKIPPED — accepted as Phase 1 constraint; Phase 3 UI only edits times

### F3 — Missing @Valid on PATCH handler

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingController.kt:88
- **Detail**: The PATCH handler takes `@RequestBody request: UpdateFeedingRequest` without `@Valid`. `ContractionController` has `@Valid @RequestBody` on its update handler. `UpdateFeedingRequest` has no validation constraints today, so there is no immediate runtime difference — but any future `@Positive` or `@Size` added to the DTO will silently not be enforced.
- **Fix**: Add `@Valid` to the PATCH handler: `fun update(@PathVariable id: UUID, @Valid @RequestBody request: UpdateFeedingRequest)`.
- **Decision**: FIXED — added @Valid to PATCH handler signature

### F4 — No positive-value guard on durationMinutes and amountMl

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingController.kt:24
- **Detail**: Both request DTOs accept any `Int` for `durationMinutes` and `amountMl`. A client can POST `-5` minutes or `-1000` ml. The service only validates temporal ordering, not these fields. The DB schema also has no CHECK constraints.
- **Fix**: Add `@field:Positive` (jakarta.validation) to both fields in `CreateFeedingRequest` and `UpdateFeedingRequest`, and ensure `@Valid` is present on both handlers (POST already has it; PATCH needs the fix from F3).
- **Decision**: FIXED — added @field:Positive to amountMl in both request DTOs

### F5 — No DB CHECK constraint for milk_type enum values

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/resources/db/migration/V5__create_feedings.sql:4
- **Detail**: `milk_type VARCHAR(20) NOT NULL` has no `CHECK (milk_type IN ('BREAST','FORMULA','PUMPED','OTHER'))`. Direct DB inserts with out-of-enum values persist silently and throw on JPA read-back. The API path is safe (controller deserializes the enum first), but there is a DB integrity gap.
- **Fix**: Add a V6 migration (or amend V5 before it reaches production) adding: `ALTER TABLE feedings ADD CONSTRAINT milk_type_valid CHECK (milk_type IN ('BREAST','FORMULA','PUMPED','OTHER'));`
- **Decision**: FIXED — V6__add_feedings_constraints.sql created with milk_type_valid CHECK

### F6 — No DB CHECK constraint for ended_at > started_at

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/resources/db/migration/V5__create_feedings.sql:6
- **Detail**: The application-layer `require(endedAt.isAfter(startedAt))` guard in FeedingService exists, but there is no DB-level `CHECK (ended_at > started_at)`. Same omission exists in the contractions schema (V2), so this is pattern-consistent but is a DB integrity gap in both.
- **Fix**: Same V6 migration: `ALTER TABLE feedings ADD CONSTRAINT feedings_temporal_order CHECK (ended_at > started_at);`
- **Decision**: FIXED — bundled into V6__add_feedings_constraints.sql as feedings_temporal_order CHECK

### F7 — note field has no length cap

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: backend/src/main/kotlin/com/babytrack/feeding/FeedingController.kt:26
- **Detail**: `note` maps to a `TEXT` column with no DB-level length constraint or DTO validation. Pattern-consistent with ContractionController which has the same gap. Low urgency since the feeding form is a mobile UI — multi-megabyte notes are implausible — but good hygiene.
- **Fix**: Add `@field:Size(max = 2000)` to `CreateFeedingRequest.note` and `UpdateFeedingRequest.note`.
- **Decision**: FIXED — added @field:Size(max = 2000) to note in both request DTOs
