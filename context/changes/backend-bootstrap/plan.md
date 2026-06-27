# Backend Bootstrap — Implementation Plan

## Overview

Initialize the Kotlin/Spring Boot backend from scratch in `backend/`, wire it to Cloud SQL PostgreSQL, implement Google OAuth token validation with JWT session issuance, containerize with Docker, and ship a GitHub Actions CI/CD pipeline that deploys to GCP Cloud Run (`europe-west3`) on every push to `main`. When this plan is complete, every subsequent slice (S-01 through S-07) can make authenticated API calls against a live, versioned backend.

## Current State Analysis

The `backend/` directory does not exist. There are no Docker files, CI workflows, GCP configuration files, or Spring Boot code anywhere in the repo. The frontend (`src/`) is a complete Expo React Native scaffold with theme, routing, and tab navigation — entirely unrelated to the backend.

**Locked decisions from `context/foundation/infrastructure.md`:**
- Deployment: GCP Cloud Run, region `europe-west3`
- Database: Cloud SQL PostgreSQL `db-f1-micro` (max 25 connections)
- Image registry: Artifact Registry (`europe-west3-docker.pkg.dev`) — NOT `gcr.io` (deprecated for new GCP projects in 2026)
- Minimum instances: 1 (keeps JVM warm during labor sessions)
- Memory: 1 Gi
- HikariCP pool size: 5 (3 Cloud Run instances × 5 = 15, safely under the 25-connection ceiling)
- Cloud SQL connection: Cloud SQL Java Connector (`com.google.cloud.sql:postgres-socket-factory`) — not direct TCP

## Desired End State

A Spring Boot 3.3.x / Kotlin / JVM 21 backend lives in `backend/`. Running `./gradlew bootRun --args='--spring.profiles.active=dev'` starts the app locally against a docker-compose Postgres. `POST /api/auth/google` accepts a Google ID token, verifies it, upserts the user in the `users` table, and returns a signed JWT. A GitHub Actions workflow deploys the backend to Cloud Run on every push to `main` that touches `backend/**`. The Cloud Run URL returns `{"status":"UP"}` on `GET /actuator/health`.

### Key Discoveries:

- `infrastructure.md` documents all 5 required `gcloud` commands, the full deploy command with flags, and 9 risk register entries — all incorporated into this plan
- `lessons.md` has one entry (typed Expo routes) — no backend lessons yet; this plan establishes the first backend patterns
- Spring Boot 3.3.x includes RFC 9457 Problem Details support with zero custom code: `spring.mvc.problemdetails.enabled=true`
- JJWT 0.12.x changed its API significantly from 0.11.x — the `Jwts.builder()` fluent API is the stable interface; avoid older tutorials

## What We're NOT Doing

- WebSocket / Server-Sent Events — real-time sync will be polling (decided in infrastructure.md)
- FCM push notifications — deferred to S-04 scope
- Partner linking, contraction tracking, feeding/sleep/medicine — all post-S-01 slices
- GraalVM native image — saves startup time but adds build complexity; defer to post-MVP
- Liquibase — Flyway chosen; do not add Liquibase
- Spring OAuth2 Authorization Server — JJWT + custom filter is sufficient; do not introduce the full AS
- Multi-region or HA Cloud SQL — `db-f1-micro` single-region is correct for MVP
- Workload Identity Federation for CI — service account JSON key in GitHub Secrets is sufficient for the sprint

## Implementation Approach

Five sequential phases: scaffold the project → add the database layer → implement the auth endpoint → containerize and write the GCP setup script → add GitHub Actions CI/CD. Each phase has runnable verification before the next begins. Phases 1–2 are pure local work; Phase 3 adds the auth contract; Phases 4–5 introduce GCP dependencies and require a GCP project with billing enabled.

## Critical Implementation Details

**Cloud SQL JDBC URL format in prod:** The Cloud SQL Java Connector does NOT use a TCP hostname. The prod JDBC URL must be:
`jdbc:postgresql:///babytrack?cloudSqlInstance=PROJECT_ID:europe-west3:babytrack-db&socketFactory=com.google.cloud.sql.postgres.SocketFactory`
Direct hostname connection (`jdbc:postgresql://IP:5432/babytrack`) bypasses the connector and requires a public IP or VPC peering. Use the socketFactory format only.

**Cloud Run PORT binding:** Cloud Run injects a `PORT` environment variable (default 8080) and routes all traffic to it. `server.port=${PORT:8080}` in `application.yml` is mandatory — if the app binds to a hardcoded port, Cloud Run health checks fail and the deploy rolls back.

**HikariCP pool ceiling:** With `--min-instances=1` and potential auto-scale to 3 instances, the safe ceiling is `maximum-pool-size=5` per instance (3 × 5 = 15, under the `db-f1-micro` max of 25). Set this in `application-prod.yml` before the first Cloud Run deploy.

---

## Phase 1: Backend project scaffold

### Overview

Initialize `backend/` as a standalone Gradle Kotlin DSL project with Spring Boot 3.3.x. Add all required dependencies. Set up three Spring profiles (base, dev, prod). Add a `docker-compose.yml` for local Postgres. Verify the app starts locally and the health check returns 200.

### Changes Required:

#### 1. Gradle build files

**File**: `backend/settings.gradle.kts`

**Intent**: Declare the root project name so Gradle knows what to call the build artifact.

**Contract**: `rootProject.name = "babytrack-backend"`

---

**File**: `backend/build.gradle.kts`

**Intent**: Declare all runtime and test dependencies, Kotlin compiler options, and the Spring Boot plugin so the project builds a runnable fat JAR.

**Contract**: Dependencies to include:
- `org.springframework.boot:spring-boot-starter-web`
- `org.springframework.boot:spring-boot-starter-data-jpa`
- `org.springframework.boot:spring-boot-starter-actuator`
- `org.springframework.boot:spring-boot-starter-security`
- `org.springframework.boot:spring-boot-starter-validation`
- `org.flywaydb:flyway-core` + `org.flywaydb:flyway-database-postgresql`
- `org.postgresql:postgresql`
- `com.google.cloud.sql:postgres-socket-factory:1.20.0` (pin this version — version-sensitive against the JDBC driver)
- `com.google.api-client:google-api-client:2.8.1` (for `GoogleIdTokenVerifier` — the verifier lives here, NOT in `google-auth-library`)
- `io.jsonwebtoken:jjwt-api:0.12.6` + `io.jsonwebtoken:jjwt-impl:0.12.6` + `io.jsonwebtoken:jjwt-jackson:0.12.6`
- `com.fasterxml.jackson.module:jackson-module-kotlin`
- Test: `org.springframework.boot:spring-boot-starter-test`
- Kotlin: `org.jetbrains.kotlin:kotlin-reflect`, `org.jetbrains.kotlin:kotlin-stdlib`

Kotlin compiler options: `freeCompilerArgs = listOf("-Xjsr305=strict")`, `jvmTarget = "21"`.

Gradle wrapper: run `gradle wrapper --gradle-version 8.8` inside `backend/` after creating the build files, or copy a wrapper from the standard Gradle distribution.

---

#### 2. Gradle wrapper files

**Files**: `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/gradle-wrapper.jar`, `backend/gradle/wrapper/gradle-wrapper.properties`

**Intent**: Commit the wrapper so any machine (and the Phase 4 Dockerfile) can build without a local Gradle installation. The Dockerfile Stage 1 explicitly COPYs `gradle/` and `gradlew` — they must exist in the repo.

**Contract**: Generated by `gradle wrapper --gradle-version 8.8` run from `backend/`. Commit all four files. Add `.gradle/` (the local Gradle cache) to `backend/.gitignore` but never add `gradle/wrapper/` to `.gitignore`.

---

#### 3. Spring application entry point

**File**: `backend/src/main/kotlin/com/babytrack/BabyTrackApplication.kt`

**Intent**: Standard Spring Boot main class — entry point for `./gradlew bootRun`.

**Contract**: `@SpringBootApplication` on an `object` with a `main` function calling `runApplication<BabyTrackApplication>(*args)`.

---

#### 4. Spring application configuration

**File**: `backend/src/main/resources/application.yml`

**Intent**: Shared configuration inherited by all profiles. Enable Problem Details and Actuator health endpoint.

**Contract**: Set `spring.mvc.problemdetails.enabled: true` and `management.endpoints.web.exposure.include: health`. Leave `spring.datasource.*` blank here (overridden per profile). `server.port: ${PORT:8080}`.

---

**File**: `backend/src/main/resources/application-dev.yml`

**Intent**: Local development profile config pointing at the docker-compose Postgres instance.

**Contract**: `spring.datasource.url: jdbc:postgresql://localhost:5432/babytrack`, username `babytrack`, password `babytrack`. `spring.jpa.show-sql: true`. `app.jwt.secret: dev-secret-minimum-32-chars-for-hs256` (dummy key for local dev only).

---

**File**: `backend/src/main/resources/application-prod.yml`

**Intent**: Cloud Run production profile. Uses Cloud SQL Java Connector URL, Secret Manager env vars, and HikariCP pool tuning.

**Contract**:
```yaml
spring:
  datasource:
    url: jdbc:postgresql:///babytrack?cloudSqlInstance=${CLOUD_SQL_INSTANCE}&socketFactory=com.google.cloud.sql.postgres.SocketFactory
    username: ${DB_USER}
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 5
app:
  jwt:
    secret: ${JWT_SECRET}
  google:
    client-id: ${GOOGLE_CLIENT_ID}
```
`CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, and `GOOGLE_CLIENT_ID` are injected by Cloud Run from Secret Manager references (set at deploy time).

---

#### 5. Local development docker-compose

**File**: `backend/docker-compose.yml`

**Intent**: One-command local Postgres for dev; keeps production Cloud SQL completely separate.

**Contract**: A single `postgres:15-alpine` service, port 5432, database `babytrack`, user/password `babytrack`, named volume for data persistence. Add a health-check so `docker-compose up --wait` is usable.

---

### Success Criteria:

#### Automated Verification:

- `./gradlew build` succeeds (compiles, no test failures yet — test stubs only at this stage)
- `docker-compose up -d` starts Postgres without errors
- `./gradlew bootRun --args='--spring.profiles.active=dev'` starts without errors

#### Manual Verification:

- `curl http://localhost:8080/actuator/health` returns `{"status":"UP"}`
- App restarts cleanly after `docker-compose down && docker-compose up -d`

**Implementation Note**: Pause here and confirm the health check is green before proceeding to Phase 2.

---

## Phase 2: Database schema + Flyway migrations

### Overview

Add the `users` table via a Flyway SQL migration and expose it through a Spring Data JPA entity and repository. Flyway runs automatically on startup via Spring Boot's auto-configuration — no additional wiring needed beyond the dependency already declared in Phase 1.

### Changes Required:

#### 1. Flyway migration

**File**: `backend/src/main/resources/db/migration/V1__create_users.sql`

**Intent**: Define the `users` table that every authenticated user maps to. `google_sub` is the stable Google identity anchor (survives email changes); `email` and `display_name` are cached from the ID token for display.

**Contract**:
```sql
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub   VARCHAR(255) UNIQUE NOT NULL,
    email        VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Filename must start with `V1__` (two underscores) — Flyway naming convention.

---

#### 2. JPA entity

**File**: `backend/src/main/kotlin/com/babytrack/user/User.kt`

**Intent**: Map the `users` table to a Kotlin data class for use by Spring Data JPA.

**Contract**: `@Entity @Table(name = "users")` with `@Id @GeneratedValue(strategy = GenerationType.UUID)` on `id: UUID`. Fields: `googleSub: String`, `email: String`, `displayName: String?`, `createdAt: Instant`, `updatedAt: Instant`. Use `@Column(name = "google_sub", unique = true, nullable = false)` on `googleSub`.

---

#### 3. Repository

**File**: `backend/src/main/kotlin/com/babytrack/user/UserRepository.kt`

**Intent**: Provide database access methods needed by the auth flow — find by Google subject and save/update.

**Contract**: `interface UserRepository : JpaRepository<User, UUID>` with one custom finder: `fun findByGoogleSub(googleSub: String): User?`.

---

### Success Criteria:

#### Automated Verification:

- `./gradlew bootRun --args='--spring.profiles.active=dev'` applies the migration on startup without errors
- Flyway logs show `Successfully applied 1 migration` in stdout

#### Manual Verification:

- `psql postgresql://babytrack:babytrack@localhost:5432/babytrack -c '\dt'` lists the `users` table
- `psql ... -c '\d users'` shows the correct column types and constraints

**Implementation Note**: Confirm the migration applied and the table schema is correct before proceeding to Phase 3.

---

## Phase 3: Google auth endpoint + JWT sessions

### Overview

Implement the `POST /api/auth/google` endpoint: verify the incoming Google ID token, upsert the user in the `users` table, issue a BabyTrack-signed JWT, and return it. Add a JWT filter so all subsequent protected routes can validate sessions. Configure Spring Security to open `/api/auth/**` and `/actuator/health` while requiring authentication everywhere else. Write one integration test. **Session restore note**: `GET /api/users/me` is deferred to S-01; S-01 should cache the `UserDto` returned by `POST /api/auth/google` in secure local storage at sign-in and use the cached value on restart — this avoids blocking app launch on a network call and works offline.

### Changes Required:

#### 1. Google ID token verifier

**File**: `backend/src/main/kotlin/com/babytrack/auth/GoogleTokenVerifier.kt`

**Intent**: Wrap `google-auth-library-oauth2-http` to verify a Google ID token string and return the verified claims (sub, email, name). Isolate the Google library dependency here so it can be mocked in tests.

**Contract**: A `@Component` class with a single method `fun verify(idToken: String): GoogleTokenClaims` that throws `InvalidGoogleTokenException` (a custom exception) on failure. `GoogleTokenClaims` is a data class: `(sub: String, email: String, displayName: String?)`. Use `GoogleIdTokenVerifier.Builder` from `com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier` (artifact: `com.google.api-client:google-api-client`) with the `GOOGLE_CLIENT_ID` config value as the audience.

---

#### 2. JWT service

**File**: `backend/src/main/kotlin/com/babytrack/auth/JwtService.kt`

**Intent**: Issue and validate BabyTrack-signed JWTs using JJWT 0.12.x. Signing key is loaded from the `app.jwt.secret` config property (dev: dummy string; prod: Secret Manager value).

**Contract**: A `@Service` with two methods:
- `fun issue(userId: UUID, email: String): String` — builds a JWT with `sub` = userId, `email` claim, issued-at now, expiry 30 days, signed with HMAC-SHA256
- `fun parse(token: String): JwtClaims` — validates signature and expiry, returns `JwtClaims(userId: UUID, email: String)`, throws `InvalidJwtException` on failure

Use `Jwts.builder()` / `Jwts.parser()` (JJWT 0.12.x API — not the deprecated 0.11.x `parserBuilder()`).

---

#### 3. Auth controller

**File**: `backend/src/main/kotlin/com/babytrack/auth/AuthController.kt`

**Intent**: Handle `POST /api/auth/google` — receive the Google ID token from the mobile app, verify it, upsert the user, issue a JWT, and return it.

**Contract**: `@RestController @RequestMapping("/api/auth")`. One endpoint: `@PostMapping("/google")` accepting `AuthRequest(idToken: String)`, returning `AuthResponse(token: String, user: UserDto)` where `UserDto(id: UUID, email: String, displayName: String?)`. Calls `GoogleTokenVerifier`, then `UserService.upsertUser()`, then `JwtService.issue()`. Returns HTTP 200 on success; Problem Details errors propagate from `@ControllerAdvice`.

---

#### 4. User service

**File**: `backend/src/main/kotlin/com/babytrack/user/UserService.kt`

**Intent**: Encapsulate the upsert logic: find user by `google_sub`, create if absent, update `email`/`display_name` if changed.

**Contract**: `@Service` with `fun upsertUser(claims: GoogleTokenClaims): User`. Looks up by `googleSub`; if absent, creates and saves a new `User`; if present, updates `email` and `displayName` if they differ and saves. Returns the persisted entity.

---

#### 5. JWT filter

**File**: `backend/src/main/kotlin/com/babytrack/auth/JwtFilter.kt`

**Intent**: Extract the `Authorization: Bearer <token>` header on each request, validate the JWT, and set the Spring Security authentication context so controllers can use `@AuthenticationPrincipal`.

**Contract**: Extends `OncePerRequestFilter`. On missing or invalid token: do nothing (let Spring Security's `HttpSecurity` config reject if the endpoint is protected). On valid token: set `UsernamePasswordAuthenticationToken` in `SecurityContextHolder`. Add a custom `AuthenticatedUser(id: UUID, email: String)` principal type.

---

#### 6. Spring Security config

**File**: `backend/src/main/kotlin/com/babytrack/config/SecurityConfig.kt`

**Intent**: Configure HTTP security — permit auth and health endpoints, require authentication on all others, disable CSRF (REST API with JWT has no session), add the JWT filter.

**Contract**: `@Configuration @EnableWebSecurity`. `SecurityFilterChain` bean that: disables CSRF, permits `POST /api/auth/**` and `GET /actuator/health`, authenticates all other requests, adds `JwtFilter` before `UsernamePasswordAuthenticationFilter`.

---

#### 7. Global exception handler

**File**: `backend/src/main/kotlin/com/babytrack/config/GlobalExceptionHandler.kt`

**Intent**: Map domain exceptions to RFC 9457 Problem Details responses so the mobile client gets structured, predictable error payloads.

**Contract**: `@RestControllerAdvice`. Map `InvalidGoogleTokenException` → 401, `InvalidJwtException` → 401, `MethodArgumentNotValidException` → 400. Each returns a `ProblemDetail` (Spring's built-in class) with `type`, `title`, `status`, and `detail` fields.

---

#### 8. Integration test

**File**: `backend/src/test/kotlin/com/babytrack/auth/AuthControllerTest.kt`

**Intent**: Verify the `POST /api/auth/google` contract end-to-end against a real test database (Testcontainers Postgres) with the `GoogleTokenVerifier` mocked to return a fixed `GoogleTokenClaims`.

**Contract**: `@SpringBootTest(webEnvironment = RANDOM_PORT)`. Use `@MockBean GoogleTokenVerifier` to skip real Google verification. Two test cases: (1) valid mock token → 200 with a JWT in the response body; (2) verifier throws `InvalidGoogleTokenException` → 401 Problem Details.

---

#### 9. Testcontainers dependency (build.gradle.kts modification)

**File**: `backend/build.gradle.kts`

**Intent**: Add Testcontainers PostgreSQL so the integration test can spin up a real Postgres instance without a Docker daemon precondition.

**Contract**: Add to the test dependencies block:
```kotlin
testImplementation("org.testcontainers:postgresql:1.19.8")
testImplementation("org.testcontainers:junit-jupiter:1.19.8")
```

---

### Success Criteria:

#### Automated Verification:

- `./gradlew test` passes (the integration test runs green)
- No compilation errors

#### Manual Verification:

- With the app running locally (`spring.profiles.active=dev`): `curl -X POST http://localhost:8080/api/auth/google -H 'Content-Type: application/json' -d '{"idToken":"invalid"}' ` returns HTTP 401 Problem Details
- A test call with a valid real Google ID token (obtained from the Expo dev build) returns HTTP 200 with a non-empty `token` field
- `GET /actuator/health` still returns 200 without a JWT
- `GET /api/auth/google` (wrong method) returns 405

**Implementation Note**: The real Google token test (second manual verification) requires a working Expo dev client. If the mobile client is not yet set up, confirm the mock-token path only and note the real token test for S-01.

---

## Phase 4: Dockerize + GCP setup script

### Overview

Create a multi-stage Dockerfile so the backend builds and runs as a container. Write `gcp-setup.sh` — the single runnable script that provisions all GCP resources needed before the first deploy. Write `backend/README.md` documenting the full local + prod setup flow.

### Changes Required:

#### 1. Dockerfile

**File**: `backend/Dockerfile`

**Intent**: Multi-stage build: stage 1 uses Gradle to compile and assemble the fat JAR; stage 2 copies the JAR into a minimal JVM 21 runtime image. Keeps the final image small (no JDK, no Gradle).

**Contract**: Stage 1: `FROM eclipse-temurin:21-jdk-alpine AS builder`; copies `build.gradle.kts`, `settings.gradle.kts`, `gradle/`, `gradlew`, and `src/`; runs `./gradlew bootJar --no-daemon`. Stage 2: `FROM eclipse-temurin:21-jre-alpine`; copies the JAR from the builder stage; `EXPOSE 8080`; `ENTRYPOINT ["java", "-jar", "/app/babytrack-backend.jar"]`. The `ENTRYPOINT` must not hardcode a port — Cloud Run injects `PORT` and the app reads it via `server.port=${PORT:8080}`.

---

#### 2. Docker ignore

**File**: `backend/.dockerignore`

**Intent**: Exclude local build artifacts and sensitive files from the Docker build context to keep builds fast and images clean.

**Contract**: Ignore `.gradle/`, `build/`, `.env`, `*.local.yml`, `docker-compose.yml`, `.idea/`, `.vscode/`, `*.md`, `scripts/`.

---

#### 3. GCP setup script

**File**: `backend/scripts/gcp-setup.sh`

**Intent**: One-time GCP provisioning script. Encodes the risk-register mitigation: "codify setup as a `gcloud` shell script on day one; commit to repo." Run once manually before the first CI deploy.

**Contract**: Bash script with `set -euo pipefail`. Requires one env var: `GCP_PROJECT_ID`. Runs in order:
1. `gcloud config set project $GCP_PROJECT_ID`
2. Enable APIs: `run.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com`
3. Create Artifact Registry repo `babytrack` in `europe-west3` (docker format)
4. Create Cloud SQL instance `babytrack-db` (POSTGRES_15, db-f1-micro, europe-west3, storage-auto-increase)
5. Create Cloud SQL database `babytrack` and user `babytrack` inside the instance
6. Create Secret Manager secrets: `babytrack-db-password`, `jwt-secret`, `google-client-id`
7. Create a least-privilege service account `babytrack-backend-sa` with roles: `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, `roles/run.invoker`
8. Echo next steps: "Run `gcloud run deploy` or push to main to trigger CI."

Each command should be guarded with a `|| echo "already exists, skipping"` where idempotency matters.

---

#### 4. Backend README

**File**: `backend/README.md`

**Intent**: Developer onboarding doc — covers local setup, prod deploy, and the key constraints (HikariCP pool, Artifact Registry, Java Connector URL format).

**Contract**: Sections: Prerequisites, Local development (docker-compose + bootRun), Running tests, GCP setup (link to gcp-setup.sh), First deploy, Environment variables reference, Known constraints (pool size, Java Connector URL, Artifact Registry not gcr.io).

---

### Success Criteria:

#### Automated Verification:

- `docker build -t babytrack-backend:local .` (run from `backend/`) succeeds
- `docker run -e PORT=8080 -e SPRING_PROFILES_ACTIVE=dev -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/babytrack -e SPRING_DATASOURCE_USERNAME=babytrack -e SPRING_DATASOURCE_PASSWORD=babytrack -e APP_JWT_SECRET=dev-secret-minimum-32-chars babytrack-backend:local` starts the app

#### Manual Verification:

- `curl http://localhost:8080/actuator/health` (against the running container) returns `{"status":"UP"}`
- `bash backend/scripts/gcp-setup.sh` runs without errors against a real GCP project (requires `GCP_PROJECT_ID` set and `gcloud auth login` done)
- Cloud SQL instance appears in GCP console after the script completes

**Implementation Note**: The `gcp-setup.sh` run is a one-time manual step that must complete successfully before Phase 5 CI can push to Artifact Registry and connect to Cloud SQL.

---

## Phase 5: GitHub Actions CI/CD pipeline

### Overview

Add a GitHub Actions workflow that builds the Docker image, pushes it to Artifact Registry, and deploys to Cloud Run on every push to `main` that touches `backend/**`. Uses a GCP service account JSON key stored in GitHub Secrets. After this phase, all subsequent slices deploy automatically.

### Changes Required:

#### 1. GitHub Actions workflow

**File**: `.github/workflows/backend-deploy.yml`

**Intent**: Automate the full build → containerize → deploy cycle so no slice requires manual `gcloud` commands after F-01 lands.

**Contract**: Trigger: `push` to `main` with `paths: ['backend/**']`. Jobs: one job `deploy` running on `ubuntu-latest`. Steps:
1. `actions/checkout@v4`
2. `actions/setup-java@v4` with `java-version: '21'` and `distribution: 'temurin'`
3. `./gradlew test` (run tests; fail build on failure)
4. `google-github-actions/auth@v2` with `credentials_json: ${{ secrets.GCP_SA_KEY }}`
5. `google-github-actions/setup-gcloud@v2`
6. `gcloud auth configure-docker europe-west3-docker.pkg.dev`
7. `docker build -t europe-west3-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/babytrack/backend:${{ github.sha }} ./backend`
8. `docker push europe-west3-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/babytrack/backend:${{ github.sha }}`
9. `gcloud run deploy babytrack-backend --image ... --region europe-west3 --platform managed --min-instances 1 --memory 1Gi --add-cloudsql-instances ${{ secrets.GCP_PROJECT_ID }}:europe-west3:babytrack-db --set-env-vars SPRING_PROFILES_ACTIVE=prod,CLOUD_SQL_INSTANCE=${{ secrets.CLOUD_SQL_INSTANCE }},DB_USER=babytrack --set-secrets DB_PASSWORD=babytrack-db-password:latest,JWT_SECRET=jwt-secret:latest,GOOGLE_CLIENT_ID=google-client-id:latest --allow-unauthenticated`

Required GitHub Secrets to set before first run: `GCP_SA_KEY` (JSON key for `babytrack-backend-sa`), `GCP_PROJECT_ID`, `CLOUD_SQL_INSTANCE` (`PROJECT_ID:europe-west3:babytrack-db`).

---

#### 2. Service account key (manual step, not a file)

**Intent**: Create and download the service account JSON key for `babytrack-backend-sa` (created in Phase 4 by `gcp-setup.sh`) and store it in GitHub Secrets as `GCP_SA_KEY`.

**Contract**: Run `gcloud iam service-accounts keys create /tmp/sa-key.json --iam-account=babytrack-backend-sa@PROJECT_ID.iam.gserviceaccount.com`, then add the contents as a GitHub Secret. This is a one-time manual step; the key is never committed to the repo.

---

### Success Criteria:

#### Automated Verification:

- Push a trivial change to `backend/src/` on `main` — the GitHub Actions workflow runs green (all steps pass)
- The workflow completes in under 10 minutes

#### Manual Verification:

- After the workflow completes, `curl https://babytrack-backend-HASH-ew.a.run.app/actuator/health` returns `{"status":"UP"}`
- `POST /api/auth/google` with a real Google ID token from an Expo dev build returns HTTP 200 with a JWT
- Cloud Run console shows the new revision as `100% traffic`
- GCP budget alert is set at $20/month (manual step in GCP console) to catch cost creep early

**Implementation Note**: This is the final gate for F-01. Once the Cloud Run URL is live and returning 200, record it in `backend/README.md` and notify S-01 planning that the backend is ready.

---

## Testing Strategy

### Unit Tests:

- `JwtService` — test token issuance round-trips (issue then parse returns the same claims); test expired token rejection; test tampered signature rejection

### Integration Tests:

- `AuthControllerTest` — POST /auth/google with mocked GoogleTokenVerifier: valid token → 200 + JWT; invalid token → 401 Problem Details; missing body → 400 Problem Details

### Manual Testing Steps:

1. Start local stack: `docker-compose up -d && ./gradlew bootRun --args='--spring.profiles.active=dev'`
2. Hit health check: `curl http://localhost:8080/actuator/health` → `{"status":"UP"}`
3. Hit auth with bad token: `curl -X POST http://localhost:8080/api/auth/google -H 'Content-Type: application/json' -d '{"idToken":"garbage"}'` → 401 Problem Details JSON
4. After CI deploys: hit Cloud Run health check URL → `{"status":"UP"}`
5. After Expo dev build is available (S-01): sign in with Google and verify JWT is returned

## Performance Considerations

- `--min-instances=1` keeps the JVM warm — avoid cold starts during labor sessions (a cold JVM start takes 3–8 seconds on Cloud Run)
- `maximum-pool-size=5` per instance is conservative; the `db-f1-micro` ceiling of 25 connections is the hard limit — do not increase without upgrading the Cloud SQL tier
- The multi-stage Dockerfile keeps the runtime image small; the JRE-only final stage avoids shipping the JDK and Gradle

## Migration Notes

No existing data to migrate — this is a greenfield `users` table. Flyway `V1__` migration runs automatically on first startup. For future migrations in subsequent slices: add `V2__`, `V3__`, etc. following the same Flyway naming convention. Always write additive-only migrations during the MVP sprint (add columns/tables; never drop or rename in a migration that might need rollback).

## References

- Infrastructure decisions: `context/foundation/infrastructure.md`
- Roadmap item: `context/foundation/roadmap.md` (F-01)
- Infrastructure getting-started commands: `infrastructure.md § Getting Started`
- Risk register: `infrastructure.md § Risk Register`
- Change identity: `context/changes/backend-bootstrap/change.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend project scaffold

#### Automated

- [ ] 1.1 `./gradlew build` succeeds (compiles, no test failures)
- [ ] 1.2 `docker-compose up -d` starts Postgres without errors
- [ ] 1.3 `./gradlew bootRun --args='--spring.profiles.active=dev'` starts without errors

#### Manual

- [ ] 1.4 `curl http://localhost:8080/actuator/health` returns `{"status":"UP"}`
- [ ] 1.5 App restarts cleanly after `docker-compose down && docker-compose up -d`

### Phase 2: Database schema + Flyway migrations

#### Automated

- [ ] 2.1 `./gradlew bootRun --args='--spring.profiles.active=dev'` applies migration without errors
- [ ] 2.2 Flyway logs show `Successfully applied 1 migration` in stdout

#### Manual

- [ ] 2.3 `psql` confirms `users` table exists with correct column types and constraints

### Phase 3: Google auth endpoint + JWT sessions

#### Automated

- [ ] 3.1 `./gradlew test` passes (integration test green)
- [ ] 3.2 No compilation errors

#### Manual

- [ ] 3.3 `POST /api/auth/google` with invalid token returns 401 Problem Details
- [ ] 3.4 `POST /api/auth/google` with valid real Google ID token returns 200 + JWT
- [ ] 3.5 `GET /actuator/health` returns 200 without a JWT
- [ ] 3.6 `GET /api/auth/google` (wrong method) returns 405

### Phase 4: Dockerize + GCP setup script

#### Automated

- [ ] 4.1 `docker build -t babytrack-backend:local .` succeeds from `backend/`
- [ ] 4.2 Docker container starts and responds on port 8080

#### Manual

- [ ] 4.3 `curl http://localhost:8080/actuator/health` against running container returns `{"status":"UP"}`
- [ ] 4.4 `bash backend/scripts/gcp-setup.sh` runs without errors against real GCP project
- [ ] 4.5 Cloud SQL instance appears in GCP console after the script completes

### Phase 5: GitHub Actions CI/CD pipeline

#### Automated

- [ ] 5.1 Push to `main` touching `backend/**` triggers GitHub Actions workflow
- [ ] 5.2 Workflow completes green in under 10 minutes

#### Manual

- [ ] 5.3 Cloud Run URL returns `{"status":"UP"}` on `GET /actuator/health`
- [ ] 5.4 `POST /api/auth/google` on Cloud Run URL with real Google ID token returns 200 + JWT
- [ ] 5.5 Cloud Run console shows new revision at 100% traffic
- [ ] 5.6 GCP budget alert set at $20/month in GCP console
