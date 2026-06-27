# Backend Bootstrap — Plan Brief

> Full plan: `context/changes/backend-bootstrap/plan.md`

## What & Why

Initialize the Kotlin/Spring Boot backend (F-01) that every other BabyTrack slice depends on. Nothing can ship until there is a live API that validates Google ID tokens and issues session JWTs — this is the critical-path foundation for all 7 subsequent roadmap slices.

## Starting Point

The `backend/` directory does not exist. The repo contains only an Expo React Native scaffold (`src/`). GCP Cloud Run, Cloud SQL, and Artifact Registry are chosen but not yet provisioned; `infrastructure.md` documents all constraints and risk register entries.

## Desired End State

A Spring Boot 3.3.x / Kotlin / JVM 21 backend is live on Cloud Run (`europe-west3`). `POST /api/auth/google` accepts a Google ID token from the mobile app, verifies it, upserts the user, and returns a signed JWT. GitHub Actions deploys automatically on every push to `main` touching `backend/**`. The Cloud Run URL returns `{"status":"UP"}` on `/actuator/health`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Build tool | Gradle Kotlin DSL | Implied by `build.gradle.kts` examples throughout infrastructure.md | Research |
| Spring Boot version | 3.3.x (latest stable) | Current GA release; best library compatibility; no reason to start on an older branch | Plan |
| Database migrations | Flyway (SQL files) | Zero Spring config needed; Spring Boot auto-configures it; SQL-only is readable without DSL knowledge | Plan |
| Local dev database | docker-compose + Postgres 15 | Offline-capable; no GCP cost during dev; cleanly separated from Cloud SQL by Spring profile | Plan |
| Google token verification | `com.google.api-client:google-api-client:2.8.1` | `GoogleIdTokenVerifier` lives in this artifact; local key caching avoids per-request HTTP round-trips to Google | Plan |
| Session JWT | JJWT 0.12.x (HMAC-SHA256) | Most widely-used Kotlin/Java JWT library; simple API; signing key from Secret Manager | Plan |
| Error format | RFC 9457 Problem Details | Spring Boot 3.x built-in; zero custom serializer code; structured errors the mobile client can parse | Plan |
| CI/CD scope | Included in F-01 | All subsequent slices benefit immediately; avoids CI becoming a deprioritized debt item | Plan |
| Testing scope | One integration test for POST /auth/google | Proves the auth contract end-to-end; provides CI signal; respects 5-week sprint budget | Plan |
| GCP setup | `backend/scripts/gcp-setup.sh` | Risk register mitigation: "codify setup as a gcloud shell script on day one; commit to repo" | Research |

## Scope

**In scope:**
- `backend/` Gradle project with Spring Boot 3.3.x, Kotlin, JVM 21
- `docker-compose.yml` for local Postgres
- Flyway `V1__create_users.sql` migration
- `User` JPA entity + `UserRepository`
- `POST /api/auth/google` endpoint (verify → upsert → issue JWT)
- JJWT-based `JwtFilter` for protected routes
- RFC 9457 global exception handler
- One `@SpringBootTest` integration test with mocked Google verifier
- Multi-stage `Dockerfile` + `.dockerignore`
- `backend/scripts/gcp-setup.sh` (one-time GCP provisioning)
- `backend/README.md`
- `.github/workflows/backend-deploy.yml` (CI/CD pipeline)

**Out of scope:**
- Partner linking, contraction tracking, feeding/sleep/medicine (post-S-01 slices)
- FCM push notifications
- WebSocket / SSE (polling decided in infrastructure.md)
- Workload Identity Federation (service account JSON key is sufficient for sprint)
- GraalVM native image
- Multi-region or HA Cloud SQL

## Architecture / Approach

The backend is a standard layered Spring Boot REST API: Controller → Service → Repository → Cloud SQL. Google ID tokens are verified locally via `GoogleIdTokenVerifier` from `com.google.api-client:google-api-client:2.8.1` (keys cached in-process). BabyTrack-issued JWTs are HMAC-SHA256 signed with a Secret Manager key, validated on each request by a `OncePerRequestFilter`. All credentials flow through Secret Manager → Cloud Run env vars → Spring `@Value` injection. The prod JDBC URL uses the Cloud SQL Java Connector's socketFactory format (not TCP) — the key non-obvious constraint in this plan.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend project scaffold | Gradle project, Spring profiles, docker-compose, health check | Gradle wrapper setup and dependency resolution |
| 2. Database schema + Flyway | `users` table, JPA entity, repository | Flyway naming convention (`V1__` double underscore) |
| 3. Auth endpoint + JWT | `POST /api/auth/google`, JWT filter, integration test | Google library version compatibility; JJWT 0.12.x API differs from 0.11.x tutorials |
| 4. Dockerize + GCP setup | Multi-stage Dockerfile, gcp-setup.sh, README | Cloud SQL Java Connector JDBC URL format (socketFactory, not TCP) |
| 5. GitHub Actions CI/CD | Automated deploy on push to main | Service account roles; GCP_SA_KEY secret wiring |

**Prerequisites:** GCP project with billing enabled; `gcloud` CLI authenticated locally; GitHub repo remote set up.  
**Estimated effort:** ~2–3 focused sessions across 5 phases (Phase 4–5 have GCP wait times).

## Open Risks & Assumptions

- The `db-f1-micro` 25-connection ceiling is the single biggest production risk: `maximum-pool-size=5` must be set in `application-prod.yml` before the first Cloud Run deploy or connection exhaustion will occur
- Phase 3 manual verification (real Google ID token) requires an Expo dev build — if the mobile client isn't ready yet, defer to S-01 and note it as an open verification
- GCP budget: with `--min-instances=1`, VPC connector, and Secret Manager, the real cost is $20–40/month (not the "free tier" estimate) — set the $20 budget alert in Phase 5

## Success Criteria (Summary)

- `curl https://CLOUD_RUN_URL/actuator/health` returns `{"status":"UP"}` from the live Cloud Run service
- `POST /api/auth/google` with a valid Google ID token returns HTTP 200 with a signed JWT
- A push to `main` touching `backend/**` triggers a successful GitHub Actions deploy in under 10 minutes
