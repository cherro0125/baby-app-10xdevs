# Real-time Shared Contractions — Plan Brief

> Full plan: `context/changes/real-time-shared-contractions/plan.md`

## What & Why

Add a shared, live contraction log so linked partners see each other's entries appear within ~5
seconds — no refresh, no manual coordination. This is S-04, the north-star moment: the first time
the product's core thesis (two people looking at the same data during labor) is actually verifiable.

## Starting Point

Each user's contractions are stored locally (expo-sqlite) and synced to the backend. Today the
server only returns the caller's own contractions; edit and delete authz checks ownership strictly.
The contraction row UI has no "who logged it" concept.

## Desired End State

Both linked partners see a merged contraction list that updates every 5 seconds. Each row shows
"You" or the partner's name. Either partner can edit or delete any entry. The 5-1-1 banner runs
over the full combined list. Solo users (no partner linked) see no change.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Real-time mechanism | 5s polling | Roadmap-settled; WebSocket overkill for this use-volume |
| Push notifications | Out of scope | Adds FCM/APNs setup; both phones are typically live during labor |
| 5-1-1 signal scope | Combined log | Alternating-logger pattern would break the signal if scoped per-user |
| List cap | Top 200 combined | Matches existing solo cap; negligible payload |
| Attribution display | "You" / partner name text label | Fastest to parse under stress; no new assets |
| Simultaneous active contractions | Both allowed | No coordination overhead; matches real use case |
| Edit/delete authz | Owner OR linked partner | Server validates the link; strangers still get 404 |
| No-partner behavior | Degrade gracefully, no polling | Zero wasted API calls for solo users |
| Offline partner edits | Online-only; show error | Avoids sync-queue complexity; phones are live during labor |
| Partner info source | Reuse `usePartner` | Already fetches name/email; zero new API calls |
| Local SQLite schema | No new columns | `user_id` already encodes ownership |
| Stale data indicator | None (silent) | Error banners during labor are worse than slightly stale data |

## Scope

**In scope:**
- `GET /api/contractions/shared` — merged top-200, partner-aware
- PATCH/DELETE authz widened to allow linked partner
- PATCH expanded to accept optional `startedAt` and allow editing finalized entries
- `useContractions` polling (5s, partner-only) + per-owner upsert strategy
- Attribution label ("You" / partner name) on each contraction row
- 5-1-1 banner over combined list (zero-cost: `computeFiveOneOne` already accepts any list)

**Out of scope:**
- Push notifications for partner's contraction events
- Stale-data indicator
- `strength`/`note` editing via PATCH (set at finalize time only)
- Sync-queue support for partner entry mutations

## Architecture / Approach

Polling-based. The frontend polls `/api/contractions/shared` every 5s (when partner is linked),
upserts results into local SQLite (partner rows: INSERT OR REPLACE; own rows: INSERT-if-new), and
re-renders from the local DB. Partner-entry edits/deletes go directly to the server (online-only).
Attribution data comes from the existing `userId` field on each `ContractionDto` — no new DB columns.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend | Shared endpoint, partner authz, PATCH expansion | Partner-link lookup adds one JOIN per edit/delete |
| 2. Frontend data layer | Polling, merged sync, partner edit/delete | Upsert strategy must not clobber unsynced own edits |
| 3. Frontend UI | Attribution labels, 5-1-1 over merged list | `ContractionRow` layout impact with the new label |

**Prerequisites:** S-02 (partner linking) ✓ done, S-03 (contraction tracking) ✓ done.  
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Push notifications deferred — if both phones are backgrounded during labor, neither user is notified. Accepted for MVP.
- The 5s poll adds modest battery/bandwidth cost. Acceptable at low frequency; worth revisiting post-launch if users complain.
- The `PartnerService.getPartnerId()` call is added to every PATCH/DELETE on contractions. It's a indexed FK lookup — negligible cost.

## Success Criteria (Summary)

- Partner's contraction entry appears on screen within 10 seconds of logging, without any manual action.
- Each row clearly shows who logged it.
- A solo user's experience is unchanged.
