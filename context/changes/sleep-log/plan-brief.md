# Sleep Log — Plan Brief

> Full plan: `context/changes/sleep-log/plan.md` (revised 2026-10-23)

## What & Why

Parents can log a baby's sleep sessions (start/stop, type, note), see the history, and see their partner's entries within seconds (PRD FR-018, FR-019, FR-022, FR-023). The original plan copied the old feeding sync, which `feeding-edit-details` showed was broken. This revision builds one shared, identity-stable sync engine first, then puts feedings, contractions and sleep on it. Contractions are broken the same way today: duplicates after edits, strength and note never uploaded, deletions never synced.

## Starting Point

The sleep backend exists (Phase 1, `2832d8c`), but it has no `PUT` upsert. The correct sync lives only inside `use-feedings.ts`. Contractions still use `POST` + `PATCH` with server-assigned ids and a `sync_queue` that nothing processes.

## Desired End State

- A Sleep tab between Feeding and Partner, with timer, completion sheet, history, full edit and delete, and crash recovery.
- Feedings, contractions and sleeps all sync through one engine: no duplicates, edits and deletions propagate in ~5 s, the server wins for clean rows.
- Contractions additionally sync strength and note, and can be fully edited.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Sync architecture | Extract a shared engine (`src/sync/`) | One correct implementation for three entities instead of three copies of subtle sync code. |
| Contractions | Migrate onto the engine in this change | Fixes their identity bug, lost strength/note and unsynced deletions now. |
| Sleep edit scope | Full edit (times, type, note) | Avoids repeating the "can only edit time" report that started feeding-edit-details. |
| Contraction edit scope | Times + strength + note | Consistent with feeding and sleep; the engine's full-replacement PUT needs all fields anyway. |
| Running entries | Not uploaded, finished entries only | Keeps the `PUT` contract and current partner-visible behaviour. |
| Backend sequencing | New Phase 2 for sleep + contraction upserts | Phase 1 stays untouched, and the client can rely on `PUT` before the client phases start. |
| Engine testing | Jest on real SQLite (`node:sqlite`, verified under jest-expo) + mocked fetch | Catches sync regressions before device testing, with no new dependency. |
| UI reuse | Share `TimeRow`, `buildEditTimes`, per-entity details fields | Removes the fiddly duplicates without abstracting screens that differ. |
| Untouched times | Kept exact (seconds preserved) | Otherwise editing a contraction's strength would change its duration. |

## Scope

**In scope:**
- `PUT` upserts for sleeps and contractions.
- Sync engine plus its tests.
- Feedings, contractions and sleeps on the engine.
- One-time contraction re-download (`user_version` 2).
- Contraction full edit.
- Sleep data, UI and tab.
- EN/PL strings.

**Out of scope:**
- Uploading running entries.
- The sync write-load optimisation (an existing follow-up).
- Restoring contractions deleted before the update.
- Removing legacy POST/PATCH.
- Generic timer/row/list components.
- Medicine log.

## Architecture / Approach

`src/sync/entity-sync.ts` holds the sync rules from `use-feedings.ts`, configured per entity by table, endpoint, data columns, tombstone key, server→row mapping and upload body:
- tombstones per user;
- download with an atomic own-row upsert and own/partner purge;
- `PUT` upload with an `updated_at` guard;
- partner edits via `PUT ?create=false`.

`src/sync/use-entity-sync.ts` holds the React side: initial load and sync, in-flight guard, 5 s polling, and a sync on link change. Each entity hook keeps only its own start, finalize and edit SQL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend sleep domain | Done (`2832d8c`) | — |
| 2. Backend upserts | `PUT` for sleeps + contractions, `userId` mirror fix, tests | Contract drift from the feeding upsert |
| 3. Engine + feedings | Shared engine, feedings on it, real-SQLite tests | Regressing the just-verified feeding sync |
| 4. Contractions | Engine, re-download, strength/note sync, full edit sheet | One-time reconciliation; pre-update local deletions reappear once |
| 5. Sleep data + UI | Table, hook, components, tab, i18n | Long sessions across midnight in the edit sheet |

**Prerequisites:** dev backend and Metro running; dev clients on the iPhone and the Galaxy S25 Ultra; two linked test accounts.
**Estimated effort:** ~4–5 sessions across Phases 2–5, with a two-phone check after each phase.

## Open Risks & Assumptions

- `node:sqlite` matches native expo-sqlite for the SQL used. This was verified for `json_extract`, conditional `ON CONFLICT` and `julianday`; device tests still gate each phase.
- Contractions deleted locally before the update come back once after the re-download.
- `PRAGMA user_version` 2 is claimed here, so a later medicine-log local migration must use 3+.

## Success Criteria (Summary)

- Both parents see the same feedings, contractions and sleeps within ~5 s, edits never create duplicates, and deletions stick.
- A sleep can be logged, recovered after a crash, fully edited across midnight and deleted, in English and Polish.
- Feeding behaviour is unchanged after the engine refactor.
