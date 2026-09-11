# Plan Brief: Contraction Tracking (S-03)

**Change ID**: contraction-tracking | **Status**: planned | **Date**: 2026-09-11

---

## What we're building

Full contraction tracking: a timer screen with Start/Stop, a history list, manual time editing, swipe-to-delete, crash recovery for mid-session kills, and a 5-1-1 alert banner. Backed by a local SQLite store (sync queue for S-04) and a new Spring Boot REST resource.

---

## 6 phases at a glance

| Phase | What ships |
|-------|-----------|
| 1 — Backend API | V2 Flyway migration, `Contraction` entity + repo + service, 4-endpoint controller (`POST`, `PATCH`, `GET`, `DELETE /api/contractions`), 404 exception handler |
| 2 — Local data layer | `expo-sqlite` install, SQLite schema (`contractions` + `sync_queue`), `useContractions()` hook |
| 3 — Navigation + timer | Replace Home tab → Contractions; remove Explore tab; `<ContractionTimer>` with elapsed clock, Start/Stop, strength (1-10), note |
| 4 — History + delete | `<ContractionList>` with compact rows (time / duration / gap / strength); swipe-to-delete with second-tap confirm |
| 5 — Manual entry + recovery | Incomplete-contraction modal on relaunch; DateTimePicker bottom sheet to edit start/end times |
| 6 — 5-1-1 + E2E gate | `computeFiveOneOne()` algorithm; persistent status banner; one-shot backend sync on mount; full FR verification |

---

## Key design choices

**SQLite-first, sync later.** Every write goes to local SQLite immediately and is queued in `sync_queue`. Phase 6 does a best-effort one-shot merge with the backend; the full retry-on-reconnect drain is S-04 scope. The queue schema is designed so S-04 can swap in the drain without touching local write paths.

**Backend: two-state resource.** `POST` creates with `endedAt=null`; `PATCH` finalises with `endedAt` + computes `durationSeconds` server-side. No intermediate state. Ownership enforced by `user_id` matching the JWT principal — returns 404 (not 403) on mismatch to avoid enumeration.

**Navigation: one tab, no Explore.** `app-tabs.tsx` drops the Explore trigger; `(app)/explore.tsx` is deleted. Single `index` route hosts the full contractions screen.

**5-1-1 frontend-only.** `computeFiveOneOne()` is a pure function in `src/utils/`. Backend computation comes in S-04. The banner always renders — idle/tracking/alert states so users see something meaningful even before a pattern emerges.

**Crash recovery via SQLite.** `activeContraction = first row with endedAt IS NULL`. On mount, if one exists, show the `<IncompleteContractionModal>` before the main screen renders. No additional state beyond what's already in the DB.

---

## Files changed (summary)

**Backend** (new): `V2__create_contractions.sql`, `Contraction.kt`, `ContractionRepository.kt`, `ContractionService.kt`, `ContractionController.kt`, `ContractionException.kt`  
**Backend** (modified): `GlobalExceptionHandler.kt`

**Frontend** (new): `src/db/schema.ts`, `src/db/types.ts`, `src/hooks/use-contractions.ts`, `src/components/contraction-timer.tsx`, `src/components/contraction-list.tsx`, `src/components/contraction-row.tsx`, `src/components/incomplete-contraction-modal.tsx`, `src/components/time-edit-sheet.tsx`, `src/components/five-one-one-banner.tsx`, `src/utils/five-one-one.ts`  
**Frontend** (modified): `src/components/app-tabs.tsx`, `src/app/(app)/index.tsx`, `src/hooks/use-contractions.ts`  
**Frontend** (deleted): `src/app/(app)/explore.tsx`

---

## Start here

```
/10x-implement contraction-tracking phase 1
```
