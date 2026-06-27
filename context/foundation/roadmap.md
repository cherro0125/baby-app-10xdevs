---
project: BabyTrack
version: 1
status: draft
created: 2026-06-27
updated: 2026-06-27
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: BabyTrack

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

BabyTrack gives a woman in active labor and her partner a shared, real-time view of contraction data — replacing stopwatch-and-mental-math with a single app that signals when it may be time to go to the hospital. After birth, the same shared log extends to feeding, sleep, and medicine, so both parents stay coordinated without manual sync. The product's core thesis — the bet the roadmap is built around — is that the most dangerous moment in labor is not the contraction itself, but the "is it time to leave?" decision gap made under stress with incomplete information; BabyTrack closes that gap.

## North star

**S-04: Both partners see each other's contractions update in real time** — the first moment the PRD's core thesis ("both screens update simultaneously during labor") is end-to-end verifiable with two linked accounts.

> North star here means the smallest end-to-end slice whose successful delivery proves the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID                      | Outcome (user can …)                                                                                              | Prerequisites | PRD refs                                    | Status   |
|------|--------------------------------|-------------------------------------------------------------------------------------------------------------------|---------------|---------------------------------------------|----------|
| F-01 | backend-bootstrap              | (foundation) Spring Boot backend deployed to Cloud Run; Google OAuth token validation; user accounts; JWT sessions; PostgreSQL user schema | —             | FR-001, FR-003, NFR (data persistence)      | ready    |
| S-01 | google-auth                    | sign in with Google and sign out; app remembers session across restarts                                           | F-01          | FR-001, FR-003, FR-004, US-01               | proposed |
| S-02 | partner-linking                | invite a partner via share link/code, accept an invite, and unlink                                                | S-01          | FR-005, FR-007, FR-008, US-01               | proposed |
| S-03 | contraction-tracking           | log contractions (start/stop timer, strength, description, manual time); view log with duration, gap, 5-1-1 signal; delete entries | S-01          | FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, US-01, Business Logic | proposed |
| S-04 | real-time-shared-contractions  | see a partner's contraction entries appear on-screen within seconds; see who logged each entry; edit or delete any entry | S-02, S-03    | FR-022, FR-023, FR-024, US-01               | proposed |
| S-05 | feeding-log                    | log a feeding event (type, amount, description); view feeding history; partner sees it in real time               | S-04          | FR-016, FR-017, FR-022, FR-023, FR-024, US-01 | proposed |
| S-06 | sleep-log                      | log a sleep session (start/end); view sleep history; partner sees it in real time                                 | S-04          | FR-018, FR-019, FR-022, FR-023, FR-024, US-01 | proposed |
| S-07 | medicine-log                   | log a medicine event (time, name, amount, reason); view medicine log; partner sees it in real time                | S-04          | FR-020, FR-021, FR-022, FR-023, FR-024, US-01 | proposed |

## Baseline

What's already in place in the codebase as of 2026-06-27 (auto-researched + user-confirmed). Foundations below assume these layers are present and do NOT re-scaffold them.

- **Frontend:** Partial — Expo Router v56 scaffold with tab navigator and theme system in place (`src/app/_layout.tsx`, `src/constants/theme.ts`, `ThemedText`, `ThemedView`). No BabyTrack screens or domain components yet.
- **Backend / API:** Absent — Kotlin/Spring Boot will live in `backend/` (monorepo, decided 2026-06-27); not yet initialized.
- **Data:** Absent — No DB driver, ORM, schema, migration tooling, or API client for the Spring Boot API.
- **Auth:** Absent — `expo-auth-session` not installed; `expo-web-browser` present (a dependency for it) but no Google OAuth integration code.
- **Deploy / infra:** Partial — Mobile: EAS declared in `tech-stack.md`; no `eas.json` or CI workflows in repo yet. Backend: GCP Cloud Run + Cloud SQL decided in `context/foundation/infrastructure.md`; no Dockerfile or CI workflows yet.
- **Observability:** Absent — No Sentry, no logging library. GCP Cloud Run logging is sufficient for MVP; no additional tooling planned.

## Foundations

### F-01: Spring Boot backend bootstrap + Cloud Run deploy

- **Outcome:** (foundation) Kotlin/Spring Boot project initialized in `backend/`; Dockerfile builds and runs; deployed to GCP Cloud Run (`europe-west3`); Cloud SQL PostgreSQL provisioned; `POST /api/auth/google` validates Google ID tokens and returns a JWT session; `users` table seeded; all subsequent slices can make authenticated API calls.
- **Change ID:** `backend-bootstrap`
- **PRD refs:** FR-001 (auth entry point), FR-003 (session persistence), NFR (no data loss — establishes Cloud SQL as the persistence layer), `context/foundation/infrastructure.md`
- **Unlocks:** S-01 (first slice that calls the backend); transitively all slices depend on this foundation via S-01.
- **Prerequisites:** — (no code prerequisites; requires a GCP project with billing enabled, which infrastructure.md documents)
- **Parallel with:** —
- **Blockers:** GCP project must exist with billing enabled and APIs enabled (`run.googleapis.com`, `sqladmin.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`).
- **Unknowns:**
  - What offline-first persistence strategy should the mobile app use to survive crash/network drop (NFR)? Likely MMKV + a sync queue, but library choice is deferred to `/10x-plan contraction-tracking`. Owner: user. Block: no (doesn't block F-01 itself; surfaces in S-03).
- **Risk:** First item on the critical path; delay here delays every slice. Kotlin/Spring Boot setup is familiar territory (per tech-stack.md), but Cloud SQL Auth Proxy wiring and Artifact Registry are known friction points — flag them early (see `infrastructure.md` risk register).
- **Status:** ready

---

## Slices

### S-01: Google OAuth sign-in and sign-out

- **Outcome:** User can sign in with Google and sign out. The app stores the JWT session token securely and restores auth state on app restart without requiring the user to sign in again. All UI is available in English and Polish (i18n infrastructure established here for all subsequent slices).
- **Change ID:** `google-auth`
- **PRD refs:** FR-001, FR-003, FR-004, US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Google OAuth redirect URI must be configured in Google Cloud Console for both Expo Go (dev) and standalone app (production). The dev URI scheme differs from the production URI — configure this before starting implementation. Owner: dev. Block: no (developer resolves this as a setup step; not a research question that blocks planning).
  - i18n library choice for Expo (react-i18next vs i18n-js + expo-localization). Either works; decision is low-stakes but should be made before S-01 ships so all subsequent screens use the same library. Owner: dev. Block: no (ship with EN-only first, PL strings can follow in the same PR).
- **Risk:** Sequenced first because auth is the prerequisite for all data-writing slices. Google OAuth on React Native has known redirect URI complexity between Expo Go and production builds; budget time for this in `/10x-plan`. Establish i18n infrastructure here to avoid retrofitting translation keys across all subsequent screens.
- **Status:** proposed

---

### S-02: Partner invite, link, and unlink

- **Outcome:** User can generate a share link/code, share it with a partner, and the partner can enter it to link accounts. Either partner can unlink at any time.
- **Change ID:** `partner-linking`
- **PRD refs:** FR-005, FR-007, FR-008, US-01
- **Prerequisites:** S-01
- **Parallel with:** S-03 (both depend only on S-01; a single agent can work on S-02 while another works on S-03)
- **Blockers:** —
- **Unknowns:**
  - What is the invite code format and expiry policy? (e.g., 6-character alphanumeric, 24h expiry). Owner: user. Block: no (any reasonable default works for MVP; can be tuned post-launch).
  - Deep link handling: when a partner taps the invite link, the app must open to the "accept invite" screen. Expo Router deep link config needs testing on iOS and Android. Owner: dev. Block: no (testable during implementation).
- **Risk:** Must land before S-04 (the north star depends on two linked accounts). Sequenced in parallel with S-03 to avoid blocking the north star on sequential execution. Invite link deep linking is the most likely source of unexpected platform friction.
- **Status:** proposed

---

### S-03: Solo contraction tracking with 5-1-1 signal

- **Outcome:** User can start and stop a contraction timer (duration logged automatically), rate strength, add a description, manually enter start/end time if the timer was missed, view the contraction log with duration, gap to previous, strength, and timestamp, and delete any entry. The contraction log screen shows the current 5-1-1 pattern status and displays a "may be time to go" signal when contractions meet the ≤5 min apart / ≥1 min long / ≥1 hour sustained threshold.
- **Change ID:** `contraction-tracking`
- **PRD refs:** FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, US-01, Business Logic (5-1-1 rule)
- **Prerequisites:** S-01
- **Parallel with:** S-02 (both depend only on S-01)
- **Blockers:** —
- **Unknowns:**
  - Offline persistence library (MMKV, AsyncStorage, react-native-sqlite-storage, or expo-sqlite) to satisfy the NFR that no logged entry is lost on crash or network drop. Owner: dev. Block: no — `/10x-plan contraction-tracking` will decide the library; it's an implementation detail, not a prerequisite for planning.
  - 5-1-1 exact parameters (5 min / 1 min / 1 hour) should be reviewed by a medical professional before launch. Standard guideline used for MVP; parameters can be updated post-launch without a code change if surfaced as a config value. Owner: user. Block: no.
- **Risk:** Largest slice by FR count (7 FRs + business logic). If scope feels too large during `/10x-plan`, split into `contraction-tracking-core` (FR-009–FR-014) and `contraction-signal` (FR-015 + 5-1-1 rule), but validate both before S-04. Offline persistence strategy is the highest-risk implementation decision here.
- **Status:** proposed

---

### S-04: Real-time shared contraction log — north star

- **Outcome:** When one partner logs a contraction, the other partner's contraction log screen updates within a few seconds without manual refresh. Each entry shows which partner created it. Either partner can edit or delete any entry in the shared log.
- **Change ID:** `real-time-shared-contractions`
- **PRD refs:** FR-022, FR-023, FR-024, US-01
- **Prerequisites:** S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Polling interval for near-real-time sync. PRD specifies "a few seconds"; a 3–5s poll interval is the planned mechanism (confirmed in infra research: no WebSocket required). Owner: dev. Block: no.
  - Push notification for contraction logged by partner (secondary success criterion, implied FR-025). If confirmed must-have before launch, add as FR-025 and include in this slice or create S-04b. Owner: user. Block: no for this slice, but the Open Roadmap Question must be resolved before final MVP scope is locked.
- **Risk:** This is the north star — the first moment the product's core thesis is verifiable. If S-02 (partner linking) or S-03 (contraction data) are incomplete, this slice cannot proceed. Sequence bias: prioritize unblocking S-04 over any polish on S-05–S-07.
- **Status:** proposed

---

### S-05: Feeding log with real-time partner visibility

- **Outcome:** A parent can log a feeding event (start time, duration or amount, milk type: breast / formula / pumped / other, optional description) and view feeding history in chronological order. The other partner sees new feeding entries appear within a few seconds.
- **Change ID:** `feeding-log`
- **PRD refs:** FR-016, FR-017, FR-022, FR-023, FR-024, US-01
- **Prerequisites:** S-04
- **Parallel with:** S-06, S-07 (all three post-birth care slices depend only on S-04; they can be executed in parallel by separate agent runs)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low technical risk — the real-time sync mechanism established in S-04 is reused here. Sequenced after S-04 to confirm the sync pattern works before multiplying it across three new entry types.
- **Status:** proposed

---

### S-06: Sleep session log with real-time partner visibility

- **Outcome:** A parent can log a sleep session (start time, end time) and view sleep history. The other partner sees new sleep entries appear within a few seconds.
- **Change ID:** `sleep-log`
- **PRD refs:** FR-018, FR-019, FR-022, FR-023, FR-024, US-01
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Same risk profile as S-05. The simplest of the three post-birth slices (only start/end time, no complex fields). Good candidate for parallel execution alongside S-05 and S-07.
- **Status:** proposed

---

### S-07: Medicine event log with real-time partner visibility

- **Outcome:** A parent can log a medicine event (time, medicine name, amount, reason, optional description) and view the medicine log. The other partner sees new medicine entries appear within a few seconds.
- **Change ID:** `medicine-log`
- **PRD refs:** FR-020, FR-021, FR-022, FR-023, FR-024, US-01
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Medicine logging carries the highest safety implication (accidental double-dose risk from incorrect or missing entries). A delete-confirmation UX is recommended (noted in PRD §FR-024 Socrates note). Owner: dev. Block: no — design decision for `/10x-plan medicine-log`.
- **Risk:** Same sync risk profile as S-05/S-06. The delete confirmation is the only additional UX concern — defer the design decision to `/10x-plan`.
- **Status:** proposed

---

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                            | Ready for `/10x-plan` | Notes |
|------------|-------------------------------|------------------------------------------------------------------|-----------------------|-------|
| F-01       | backend-bootstrap             | Bootstrap Spring Boot backend + Cloud Run deploy skeleton        | yes                   | Run `/10x-plan backend-bootstrap` first — all slices depend on it |
| S-01       | google-auth                   | Google OAuth sign-in, sign-out, and session persistence          | no                    | Needs F-01 complete; resolve Google OAuth redirect URI config first |
| S-02       | partner-linking               | Partner invite link/code, accept, and unlink                     | no                    | Needs S-01; can run in parallel with S-03 |
| S-03       | contraction-tracking          | Solo contraction tracking + 5-1-1 signal                        | no                    | Needs S-01; resolve offline persistence library before planning |
| S-04       | real-time-shared-contractions | Real-time shared contraction log (north star)                    | no                    | Needs S-02 + S-03; resolve push notification question before final scope |
| S-05       | feeding-log                   | Feeding log with real-time partner sync                          | no                    | Needs S-04; parallel with S-06 and S-07 |
| S-06       | sleep-log                     | Sleep session log with real-time partner sync                    | no                    | Needs S-04; parallel with S-05 and S-07 |
| S-07       | medicine-log                  | Medicine event log with real-time partner sync                   | no                    | Needs S-04; parallel with S-05 and S-06 |

## Open Roadmap Questions

1. **Should push notification when a partner logs a contraction be a v1 must-have?** The secondary success criterion implies it ("both partners receive a push notification without needing to have the app open"), but no FR captures it explicitly. If confirmed must-have, add as FR-025 before planning S-04. Owner: user. Block: S-04 scoping is pending this answer.

2. **Exact 5-1-1 threshold parameters should be reviewed by a medical professional before launch.** Standard guideline (5 min / 1 min / 1 hour) ships as v1 default; parameters should be surfaced as a config value so they can be updated without a code release. Owner: user. Block: no — ships with standard guideline.

3. **Should the app carry a medical or legal disclaimer?** Given the 5-1-1 signal and medicine logging, a disclaimer may be required depending on jurisdiction. Can be added as a screen or modal before launch. Owner: user. Block: no.

## Parked

- **AI hospital-timing risk signal** — Why parked: PRD §Non-Goals. Requires maps API, geolocation, and an ML model; adds 3+ weeks. Deferred to v2.
- **Maps / geolocation integration** — Why parked: PRD §Non-Goals. Required only for v2 AI risk signal.
- **In-app messaging between partners** — Why parked: PRD §Non-Goals. Partners use WhatsApp/SMS; messaging is coordination convenience, not safety-critical logging.
- **PDF export of contraction log** — Why parked: PRD §Non-Goals. Nice-to-have for doctor intake; deferred to v2 based on user demand.
- **Facebook OAuth** — Why parked: PRD §Non-Goals. Doubles OAuth surface for <10% of signups; add based on actual demand in v2.
- **QR code partner invite** — Why parked: PRD §Non-Goals. Requires camera permissions and QR generation/scan complexity; link/code covers the same in-person use case.
- **Multi-baby / multi-pregnancy tracking** — Why parked: PRD §Non-Goals. One active pregnancy and one baby per account at a time.
- **Medical advice or dosage recommendations** — Why parked: PRD §Non-Goals. The app is a log, not a clinical tool.
- **100x scale: aggregate contraction pattern model** — Why parked: PRD §Forward: 100x scale insight. V3+ opportunity; not a v1 concern.

## Done

(Empty on first generation. `/10x-archive` appends an entry here when a change whose Change ID matches a roadmap item is archived.)
