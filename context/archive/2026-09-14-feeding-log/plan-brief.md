# Feeding Log — Plan Brief

> Full plan: `context/changes/feeding-log/plan.md`

## What & Why

Add post-birth feeding tracking to BabyTrack (S-05). A parent can log feeding sessions using a live timer, record milk type, amount in ml, and a note, then see the shared log update in near real time on the partner's device. This is the first post-north-star slice, establishing the pattern for S-06 (sleep) and S-07 (medicine).

## Starting Point

The contraction tracking domain (S-03/S-04) is fully implemented and archived. The backend has a complete entity/repo/service/controller pattern under `com.babytrack.contraction`, the frontend has a working `use-contractions.ts` hook with local-first SQLite and 5-second partner polling, and the tab bar has two registered tabs. Feeding log reuses all of these patterns without modification.

## Desired End State

A Feeding tab sits between Contractions and Partner. Tapping Start begins a live timer; tapping Stop opens a completion sheet to record milk type (Breast / Formula / Pumped / Other), optional amount in ml, and optional note. The entry lands in the feeding log list below the timer. The linked partner's Feeding tab shows the new entry within ~5 seconds. Either partner can edit times or delete any entry.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Live timer vs. manual entry | Live timer | Breastfeeding duration isn't known until the session ends; mirrors contraction UX users already know | Plan |
| Amount/duration model | Both optional, always shown | Simplest schema; avoids conditional field logic based on milk type | Plan |
| Details entered when | After stopping (completion sheet) | Minimal friction to start — no pre-selection before latching | Plan |
| Tab position | Between Contractions and Partner | Groups activity logs together; Partner stays as the rightmost settings/social tab | Plan |
| Edit/delete ownership | Either partner | Consistent with contraction policy from S-04; no new logic required | Plan |
| Amount unit | ml only | Avoids unit conversion complexity for MVP; oz can be added later | Plan |
| Screen layout | Timer at top, list below | Same mental model as contractions; immediately actionable | Plan |

## Scope

**In scope:**
- Backend: `feedings` table (V5 migration), `Feeding` entity + `MilkType` enum, `FeedingRepository`, `FeedingService`, `FeedingController` (5 endpoints), `FeedingException`, `GlobalExceptionHandler` update
- Frontend: `feedings` SQLite table, `LocalFeeding` type, `use-feedings.ts` hook, feeding screen + all components (timer, completion sheet, list, row, crash-recovery modal, time-edit sheet), tab registration in both `app-tabs.tsx` and `app-tabs.web.tsx`

**Out of scope:**
- Push notifications for new feeding events
- ml/oz unit toggle
- Editing milk type, amount, or note after the fact (time-edit only for MVP)
- Sleep log (S-06), medicine log (S-07)

## Architecture / Approach

Direct clone of the contraction tracking domain on both sides. Key difference from contractions: feedings are only uploaded to the backend **after finalization** (single `POST /api/feedings` with all fields including `endedAt` and `milkType`), since in-progress feedings live locally only. `PATCH /api/feedings/:id` handles after-the-fact time edits. Shared feed and partner resolution are identical to contractions.

```
Local SQLite (feedings table)
  ← use-feedings.ts (start/stop/sync)
  ↔ GET /api/feedings/shared  (every 5s when partner linked)
  ↑  POST /api/feedings        (upload finalized, unsynced rows)
  ↑  PATCH /api/feedings/:id   (edit own or partner entry)
  ↑  DELETE /api/feedings/:id  (delete own or partner entry)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend | V5 migration + full feeding domain, 5 endpoints live | None — straight clone of contractions |
| 2. Frontend data layer | SQLite table + `use-feedings.ts` hook | `FEEDING_COLS` alias constant must map all snake_case → camelCase (same fix as contractions) |
| 3. Frontend UI | Feeding tab screen + all components + tab registration | Completion-sheet state wiring between timer and finalize call |

**Prerequisites:** S-04 archived (done). Backend running locally with dev profile.  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- Tab icon for Feeding tab: a bottle/baby icon asset needs to be added alongside `tabIcons/contractions.png` and `tabIcons/partner.png`. Implementer should either source a matching icon or use a placeholder.
- The existing upload sync creates server-side records with server-generated UUIDs, decoupled from local UUIDs — same known limitation as contractions. Out of scope to fix.

## Success Criteria (Summary)

- Start a feeding → live timer runs; Stop → completion sheet saves the entry
- Partner device sees the entry appear within ~5 seconds without manual refresh
- Either partner can delete or time-edit any entry; Contractions and Partner tabs unaffected
