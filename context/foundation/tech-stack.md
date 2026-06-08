---
starter_id: expo
package_manager: npm
project_name: baby-track
hints:
  language_family: multi
  team_size: solo
  deployment_target: appstore-via-eas
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: false
  has_background_jobs: false
---

## Why this stack

BabyTrack is a mobile-primary product with real-time partner sharing and Google OAuth — a solo builder's 5-week after-hours sprint. Expo is the recommended default for `(mobile, js)` and the only mobile starter in the registry with `bootstrapper_confidence: verified`, meaning scaffolding is smooth out of the box. React Native covers iOS, Android, and responsive web from a single TypeScript codebase, directly satisfying both the mobile-primary surface and the secondary responsive web surface raised in PRD Open Question 4. TypeScript throughout clears the typed gate; Expo Router conventions clear convention-based; Expo is among the most-represented mobile frameworks in JS training data; docs are current and version-pinned. Auth (Google OAuth via `expo-auth-session`) and near-real-time partner sync both need manual setup on top of the scaffold — neither is bundled first-class — and the user confirmed both will be wired manually. The Kotlin/Spring Boot backend is a separate service outside this starter's scope; bootstrapper scaffolds the React Native mobile app only.
