---
bootstrapped_at: 2026-06-09T15:19:00Z
starter_id: expo
starter_name: "Expo (React Native)"
project_name: baby-track
language_family: multi
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "null"
---

## Hand-off

```yaml
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
```

### Why this stack

BabyTrack is a mobile-primary product with real-time partner sharing and Google OAuth — a solo builder's 5-week after-hours sprint. Expo is the recommended default for `(mobile, js)` and the only mobile starter in the registry with `bootstrapper_confidence: verified`, meaning scaffolding is smooth out of the box. React Native covers iOS, Android, and responsive web from a single TypeScript codebase, directly satisfying both the mobile-primary surface and the secondary responsive web surface raised in PRD Open Question 4. TypeScript throughout clears the typed gate; Expo Router conventions clear convention-based; Expo is among the most-represented mobile frameworks in JS training data; docs are current and version-pinned. Auth (Google OAuth via `expo-auth-session`) and near-real-time partner sync both need manual setup on top of the scaffold — neither is bundled first-class — and the user confirmed both will be wired manually. The Kotlin/Spring Boot backend is a separate service outside this starter's scope; bootstrapper scaffolds the React Native mobile app only.

## Pre-scaffold verification

| Signal       | Value                                      | Severity | Notes                              |
| ------------ | ------------------------------------------ | -------- | ---------------------------------- |
| npm package  | create-expo-app v4.0.0 published 2026-05-15 | fresh    | resolved from cmd_template         |
| GitHub repo  | not run                                    | —        | docs_url (https://docs.expo.dev) is not a GitHub URL; no push check available |

## Scaffold log

**Resolved invocation**: `npx create-expo-app .bootstrap-scaffold --yes --template default`
**Strategy**: subdir-then-move (scaffold into temp directory, then move files up)
**Exit code**: 0
**Files moved**: 13 items (`.gitignore`, `.vscode/`, `AGENTS.md`, `app.json`, `assets/`, `LICENSE`, `node_modules/`, `package-lock.json`, `package.json`, `README.md`, `scripts/`, `src/`, `tsconfig.json`; plus `.claude/settings.json` merged into existing `.claude/`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (scaffold's copy of CLAUDE.md; cwd's CLAUDE.md preserved)
**context/ handling**: no `context/` directory in scaffold — nothing to drop; cwd `context/` untouched
**.gitignore handling**: moved silently (absent in cwd; scaffold's copy installed as-is)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: skipped — no built-in audit tool for `multi` language family
**Recommended external tool**: No single audit tool covers this multi-language stack. For the React Native / JS layer, run `npm audit` manually from the project root. For the Kotlin/Spring Boot backend (separate service, not scaffolded here), use OWASP Dependency-Check or Snyk against the JVM dependency tree.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | verified             |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | appstore-via-eas     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | true                 |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review `CLAUDE.md.scaffold` — this is the expo starter's Claude Code instructions. `diff CLAUDE.md CLAUDE.md.scaffold` to see what it ships vs what you had. Incorporate anything useful.
- `npm run ios` / `npm run android` / `npm run web` from the project root to verify the scaffold runs.
- `npm audit` to review the JS layer's dependency advisory state (11 moderate vulnerabilities were noted during install; none are blocking).
- Address audit findings per your project's risk tolerance — `npm audit fix` handles the non-breaking ones.
- For the Kotlin/Spring Boot backend: scaffold separately; this run covers the React Native mobile app only.
