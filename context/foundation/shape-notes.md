---
project: "BabyTrack"
context_type: greenfield
created: 2026-06-08
updated: 2026-06-08
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis (when to go to hospital), coordination overhead (partner sync), data trapped in heads (no quick structured log under stress), workflow friction after birth (feeding/sleep/medicine), and absence of a good existing app"
    - topic: "primary persona"
      decision: "pregnant woman herself; partner is secondary"
    - topic: "context type"
      decision: "greenfield — fresh template repo, no existing system"
    - topic: "auth strategy"
      decision: "SSO OAuth (Google + Facebook); no email/password auth"
    - topic: "partner invite method"
      decision: "all three supported: invite link/code, invite by email, QR code scan"
    - topic: "role model"
      decision: "flat / symmetric — both partners see and do everything; no role distinction"
    - topic: "MVP v1 scope"
      decision: "OAuth + contraction tracking + real-time partner sync + feeding + sleep tracking + medicine tracking. Messaging between parents deferred to v2. AI hospital-timing risk signal and maps/geolocation deferred to v2."
    - topic: "timeline"
      decision: "5 weeks after-hours; user scoped down from 8 to 4-6 weeks by deferring messaging to v2"
    - topic: "primary success criterion"
      decision: "woman and partner tracked labor together in real time AND logged post-birth care (feeding/sleep/medicine) together"
    - topic: "secondary success criterion"
      decision: "both partners receive a push notification when a new contraction is logged (PDF export deferred to v2)"
    - topic: "guardrail"
      decision: "data must never be lost — crash or network drop cannot erase a logged contraction or feeding"
  frs_drafted: 22
  quality_check_status: accepted
---

## Vision & Problem Statement

A pregnant woman in active labor has no structured, shared tool that tells her — and her partner — *when it's time to go*. Today, couples use a stopwatch and mental math, cross-referencing with notes on a phone while shouting across rooms. Contraction timing apps exist but are single-user, no intelligent risk signal, and they vanish after birth — leaving post-birth care (feeding, sleep, medicine) equally fragmented between two exhausted parents.

The insight this product bets on: the most dangerous moment in labor is not the contraction itself, it's the decision gap — "is it time to leave for the hospital?" — made under stress, with incomplete information, by two people who aren't looking at the same data. A unified product that covers contraction tracking through hospital timing through post-birth care coordination, with AI-assisted risk signaling and real-time partner sync, fills a gap no existing app closes end-to-end.

## User & Persona

### Primary persona
A pregnant woman (first or subsequent pregnancy) tracking contractions during active labor at home. She is stressed, in pain, and needs to make a high-stakes timing decision — often together with a partner. She needs fast, one-tap logging and a clear signal about when to act.

### Secondary persona
Her partner / support person — tracking the same data in real time, managing logistics (driving, packing), and sharing the picture of what's happening without needing to ask. Post-birth: equally primary as a co-caregiver logging feeding, sleep, and medicine.

## Success Criteria

### Primary
Both a woman and her partner can open the app, see the same contraction log updating in real time during labor, and after birth both can log baby care events (feeding, sleep, medicine) that the other sees without manual sync.

### Secondary
Both partners receive a push notification when a new contraction is logged by either partner, without needing to have the app open.

### Guardrails
- A logged contraction or baby care event must survive a crash, app backgrounding, or network drop. Data loss during labor or in the post-birth period is a medical risk.

## Timeline acknowledgment
Scoped to 5 weeks after-hours. User reduced scope from 8 weeks (full product) by deferring messaging between parents to v2. Acknowledged on 2026-06-08: 5-week MVP requires sustained dedication; user accepted. AI hospital-timing risk signal and maps integration are explicitly v2.

## Functional Requirements

### Authentication
- FR-001: User can sign up via Google OAuth. Priority: must-have
- ~~FR-002: User can sign up via Facebook OAuth.~~ **Deferred to v2.** Socrates resolution: Facebook login declining among target demographic; doubles OAuth surface for < 10% of signups. Launch Google-only; add Facebook based on actual demand.
- FR-003: User can sign in via previously used OAuth provider. Priority: must-have
- FR-004: User can sign out. Priority: must-have

### Partner linking
- FR-005: User can invite a partner by generating a share link/code. Priority: must-have
- ~~FR-006: User can invite a partner by showing a QR code.~~ **Deferred to v2.** Socrates resolution: QR requires camera permissions + QR generation/scan complexity; link/code covers the same in-person case with less code. Add QR in v2 based on user feedback.
- FR-007: User can accept a partner invitation via share link/code. Priority: must-have
- FR-008: User can unlink a partner. Priority: must-have

### Contraction tracking
- FR-009: User can start a contraction timer. Priority: must-have
- FR-010: User can stop a contraction timer (logs duration automatically). Priority: must-have
- FR-011: User can log contraction strength on a scale. Priority: must-have
- FR-012: User can add an optional text description to a contraction entry. Priority: must-have
- FR-013: User can manually set the start and/or end time of a contraction instead of using the live timer. Priority: must-have
  > Socrates: Counter-argument considered: "manual time entry under stress creates incorrect data that v2 AI will misread." Resolution: kept; manual time is essential for cases where the timer was forgotten. The live timer remains the default; manual entry is a clearly secondary UI path.
- FR-014: User can view the contraction log with duration, gap to previous, strength, and timestamp for each entry. Priority: must-have
- FR-015: User can delete a contraction entry. Priority: must-have

### Post-birth: Feeding
- FR-016: Parent can log a feeding event with start time, duration or amount, milk type (breast / formula / pumped / other), and optional description. Priority: must-have
- FR-017: Parent can view feeding history in chronological order. Priority: must-have

### Post-birth: Sleep
- FR-018: Parent can log a sleep session with start time and end time. Priority: must-have
- FR-019: Parent can view sleep history. Priority: must-have

### Post-birth: Medicine
- FR-020: Parent can log a medicine event with time, medicine name, amount, reason, and optional description. Priority: must-have
- FR-021: Parent can view medicine log. Priority: must-have

### Real-time sharing
- FR-022: All contraction, feeding, sleep, and medicine entries logged by either partner are visible to both within a few seconds of being saved (no manual refresh required). Priority: must-have
  > Socrates: Counter-argument considered: "true sub-second streaming is expensive to build; near-real-time (~2-5s delay) is indistinguishable to the user." Resolution: 'real-time' redefined as 'visible to partner within a few seconds of saving.' Sub-second WebSocket streaming is not required.
- FR-023: Each log entry shows which partner created it. Priority: must-have
- FR-024: Either partner can edit or delete any entry in the shared log. Priority: must-have
  > Socrates: Counter-argument considered: "accidental delete of a medicine entry could cause double-dosing." Resolution: kept; symmetric edit/delete is the correct model. Implementation should include delete confirmation — a downstream UX decision, not an FR change.

## Business Logic

BabyTrack classifies the logged contraction pattern against the 5-1-1 guideline — contractions 5 minutes apart, lasting 1 minute, for at least 1 hour — and signals both partners when the pattern indicates it may be time to go to the hospital.

The inputs are the user-logged contraction entries: each entry carries a start time, an end time (duration), and an optional strength rating. The rule consumes the most recent N contractions and computes: (a) average gap between contraction starts, (b) average duration. When both the gap falls to ≤ 5 minutes and the average duration reaches ≥ 1 minute, sustained for ≥ 1 hour of logged data, the classification produces a visible "may be time to go" signal — displayed to both partners simultaneously. Below that threshold, the classification shows the current pattern state ("contractions X min apart, Y min long") without a directional signal.

The user encounters this rule as a status display on the contraction log screen. It updates automatically as new contractions are logged — no user action is required to trigger the classification.

Note: the 5-1-1 threshold is the standard starting guideline, but the exact parameters should be surfaced as Open Questions for medical review before launch.

## Non-Functional Requirements

- No logged contraction or baby-care entry is lost due to app crash, backgrounding, or network interruption. A user who force-closes and reopens the app finds all previously saved entries intact.
- A logged entry is visible to the linked partner within a few seconds of being saved, without the partner needing to manually refresh.
- All core logging actions (start contraction, stop contraction, log feeding) are reachable and operable with one hand on a standard smartphone screen.
- The full app interface is available in English and Polish. Language selection is user-controlled.

## Non-Goals

- No AI hospital-timing risk signal in v1. The 5-1-1 rule-based classification is v1; AI/ML inference on contraction patterns + travel time is v2. Rationale: requires maps API, geolocation, and model integration — adds 3+ weeks to build.
- No in-app messaging between parents in v1. Partners use WhatsApp/SMS for coordination. Rationale: reduces real-time infrastructure scope; messaging is coordination convenience, not safety-critical logging.
- No PDF export of contraction log in v1. Deferred to v2 based on user demand. Rationale: nice-to-have for doctor intake; not required for the MVP proof.
- No Facebook OAuth in v1. Google-only launch; Facebook added if user demand warrants it. Rationale: doubles OAuth surface for < 10% of signups.
- No QR code partner invite in v1. Link/code only. Rationale: QR requires camera permissions + QR generation/scan complexity; link/code covers the same cases.
- No multi-baby or multi-pregnancy tracking. The app tracks one active pregnancy and one baby at a time. Historical records and sibling tracking are out of scope for v1.
- No medical advice or dosage recommendations. The app is a log, not a clinical tool. It records what the user inputs; it does not validate medicine doses, flag drug interactions, or suggest treatments.

## V2 scope (deferred from v1)
- AI hospital-timing risk signal (predict whether arrival before birth is high-risk) + maps/geolocation integration
- Birth type setting (hospital / home birth) + destination hospital address (needed for AI risk signal)
- In-app messaging between parents
- PDF export of contraction log (for doctor intake)
- Facebook OAuth
- QR code partner invite

## Forward: product framing
- product_type: mobile (primary) + web (responsive, secondary)
- target_scale: medium (dozens to a few hundred users — small community / friends / family launch)
- hard_deadline: 2026-08-10
- after_hours_only: true
- mvp_weeks: 5

## Quality cross-check

All 5 greenfield gates passed. No gaps.

- Access Control: present — Google OAuth SSO, link/code partner invite, flat symmetric role model.
- Business Logic: present — one-sentence rule: 5-1-1 classification signal fires when contractions are ≤5 min apart, ≥1 min long, for ≥1 hour.
- Project artifacts: present — shape-notes.md with valid frontmatter checkpoint.
- Timeline-cost acknowledged: present — 5-week MVP acknowledged 2026-06-08; scope reduced from 8 weeks by deferring messaging to v2.
- Non-Goals: present — 7 explicit non-goals with rationale.

## Open Questions

1. **What is the exact 5-1-1 threshold?** The standard medical guideline is used as the v1 default, but parameters (5 min / 1 min / 1 hour) should be reviewed by a medical professional before launch. Owner: user. Block: no (ships with standard guideline; can be updated post-launch).
2. **Should the app carry any medical disclaimer?** Given the 5-1-1 signal and medicine logging, a legal/medical disclaimer may be required depending on jurisdiction. Owner: user. Block: no (can add before launch).
3. **What is the push notification strategy?** FR is implied by the secondary SC but not listed as an explicit FR. Block: no (can be added as FR-025 before PRD if confirmed must-have).

## Forward: 100x scale insight
At hundreds of thousands of users, anonymized aggregate contraction pattern data could train a more calibrated classification model than the fixed 5-1-1 guideline — personalizing the labor progression signal per user history or demographic. This is a v3+ opportunity, not a v1 concern.


## Access Control

Authentication: OAuth SSO only — Google and Facebook. No email/password registration. Users sign up and sign in exclusively via OAuth provider.

Partner linking — all three methods supported:
- **Invite link/code**: one partner generates a share code or link; the other enters it. Works without knowing the partner's exact provider email.
- **Invite by email**: one partner enters the other's email address to send an invite.
- **QR code scan**: one partner shows a QR code on-screen; the other scans it with the app.

Role model: **flat / symmetric**. Once two partners are linked, both accounts see and can act on all shared data equally. No owner/viewer distinction. Either partner can log, edit, or delete any entry.

Unauthenticated access: none. All app data requires a logged-in account.

## User Stories

### US-01: Full arc — labor tracking through post-birth care

- **Given** a woman in active labor with her partner's account linked to hers
- **When** she taps "start contraction," then "stop" and rates the strength
- **Then** both she and her partner see the contraction logged with duration, gap to previous, and strength — in real time, without either opening a separate app or sending a message

- **And given** the same couple after birth
- **When** one parent logs a feeding event (milk type, amount, description) or a medicine dose
- **Then** the other parent sees it immediately in their shared log, attributed to the parent who logged it

#### Acceptance Criteria
- Contraction entry appears on the partner's screen within a few seconds of being saved — no manual refresh
- Each entry shows which parent created it
- A network interruption does not erase a logged entry; it persists locally and syncs when connectivity returns
- Either parent can edit or delete any entry in the shared log
