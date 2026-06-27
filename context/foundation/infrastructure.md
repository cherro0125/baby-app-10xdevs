---
project: BabyTrack
researched_at: 2026-06-27
recommended_platform: GCP Cloud Run
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: Kotlin (backend) / TypeScript (frontend)
  framework: Spring Boot (backend) / Expo React Native (frontend)
  runtime: JVM 21 (backend) / EAS build pipeline (mobile)
  database: PostgreSQL via Cloud SQL
---

## Recommendation

**Deploy the Kotlin/Spring Boot backend on GCP Cloud Run (europe-west3, Frankfurt).**

At BabyTrack's expected QPS (10k–100k requests/month), Cloud Run's free tier covers the entire compute workload — only Cloud SQL adds a fixed cost (~$7–15/month for `db-f1-micro`). The developer has existing GCP familiarity, which offsets the platform's main weakness (IAM setup complexity) and keeps the 5-week after-hours sprint on schedule. Distributed managed infrastructure with automatic instance replacement is the correct choice for a backend used during active labor, where a single-node VPS outage is a medical-adjacent risk. Set `--min-instances=1` to keep the JVM warm and avoid cold starts during contraction-logging sessions.

Note: The React Native / Expo mobile app deploys via EAS (Expo Application Services) to the App Store and Google Play — this decision covers the backend API only.

---

## Platform Comparison

Platforms evaluated: Fly.io, Railway, Render, GCP Cloud Run, Koyeb, Hetzner + Coolify, Mikrus, AWS App Runner.

**Hard-dropped before scoring:**
- **AWS App Runner** — closed to new customers April 30, 2026. Official AWS successor is ECS Express Mode, but adds significant configuration overhead for an MVP sprint.
- **Mikrus** — zero SLA guarantee (terms explicitly state no uptime commitment), no dedicated public IPv4 (port-forwarding only, 2–7 ports), Docker-in-LXC instability, annual-only billing. Suitable for hobbyist projects; not suitable for a backend used during active labor.
- **Cloudflare Workers / Vercel / Netlify** — JS/TS-only serverless runtimes. Cannot run a persistent JVM process. Dropped before research.

**Scoring against the five agent-friendly criteria (Pass / Partial / Fail):**

| Platform | CLI-first | Managed | Agent-readable docs | Stable deploy API | MCP / Integration | Raw score |
|---|---|---|---|---|---|---|
| Fly.io | Pass | Pass | **Pass** (`fly.io/llms.txt` + `.md` URL suffix) | Pass | Partial (experimental MCP) | **4.5 / 5** |
| Railway | Pass | Pass | Partial (GitHub MDX, no `llms.txt`) | Pass | Partial (preview remote MCP) | **4.0 / 5** |
| Render | Partial (no CLI rollback cmd) | Pass | Partial (experimental `llms.txt`) | Pass | Pass (GA MCP server Aug 2025) | **4.0 / 5** |
| **GCP Cloud Run** | Pass | Pass | Fail (JS-rendered, no `llms.txt`) | Pass | Partial (preview / unofficial MCP) | **3.5 / 5** |
| Koyeb | Partial (no CLI rollback cmd) | Pass | Fail (JS-rendered, no `llms.txt`) | Pass | Pass (GA MCP server) | **3.5 / 5** |
| Hetzner + Coolify | Partial (REST API only, no mature CLI) | Partial (app managed, OS manual) | Partial (OpenAPI spec, GitHub examples) | Pass (REST POST `/api/v1/deploy`) | Partial (read-only MCP v4.1) | **3.5 / 5** |

**Monthly cost at BabyTrack scale (Spring Boot 1 GB RAM + PostgreSQL):**

| Platform | Est. monthly cost | Notes |
|---|---|---|
| GCP Cloud Run | **$7–15/month** | Free compute (100k req < free tier); Cloud SQL `db-f1-micro` dominates |
| Hetzner + Coolify | **€6.50/month** | CAX11 €5.99 + IPv4 €0.50; Coolify OSS free. Single-node; HA setup costs ~€25/month |
| Koyeb | **$3–20/month** | Paid nano ~$2–3/month; Neon Postgres free tier. Seed-stage company (~$14M raised) |
| Railway | **$10–15/month** | Hobby plan; co-located Postgres; Amsterdam EU region |
| Fly.io | **$10–18/month** | 1 GB RAM always-on; unmanaged Postgres. No free tier since 2024 |
| Render | **$32/month** | Standard $25 + Postgres Starter $7; cheapest plan OOMs Spring Boot |

**Soft-weight adjustments applied:**
- Cost minimization (primary): boosts GCP Cloud Run (free compute) and penalizes Render ($32/month floor).
- GCP/Azure/AWS familiarity: tie-breaks in favour of GCP Cloud Run.
- Single EU region (Poland/Europe): Frankfurt available on all surviving candidates; no edge-native bonus applies.
- Service co-location (undecided): neutral — Cloud SQL is a separate GCP service, not co-located in the PaaS sense, but within the same region.

---

### Shortlisted Platforms

#### 1. GCP Cloud Run (Recommended)

Wins on the combination of cost + familiarity + managed reliability. At BabyTrack's QPS, compute is free; only Cloud SQL adds cost. The developer's existing GCP experience converts the platform's main weakness (IAM setup complexity) from a blocker into a manageable setup day. Distributed managed infrastructure with no single point of failure is the right choice for a labor-tracking app. The docs and MCP story are the weakest of the shortlist — rely on `gcloud` CLI for agent operations.

#### 2. Fly.io

The best agent-friendliness of all candidates: `fly.io/llms.txt` is populated, every docs URL accepts a `.md` suffix, and `fly deploy` is the simplest one-command Docker deploy in the group. Persistent micro-VMs mean no cold-start risk and reliable background threads (FCM retries work without Cloud Tasks). At ~$10–18/month it's $3–8/month more than GCP, with no free tier. Strong runner-up if GCP IAM setup stalls the sprint.

#### 3. Railway

Best all-in-one DX for a solo sprint: co-located PostgreSQL (one-click service, automatic `DATABASE_URL` injection), a dedicated Claude Code integration page (`railway.com/agents/claude`), and a preview remote MCP server. The Hobby plan at ~$10–15/month all-in is predictable. Two mandatory Spring Boot config steps before first deploy: bind server to `${PORT:8080}` and manually decompose Railway's `postgres://` URL into `SPRING_DATASOURCE_*` variables. EU region is Amsterdam, not Frankfurt.

---

## Anti-Bias Cross-Check: GCP Cloud Run

### Devil's Advocate — Weaknesses

1. **IAM setup complexity threatens the 5-week deadline.** A fresh GCP project requires: Artifact Registry repository, a least-privilege service account, Cloud SQL Auth Proxy or Java connector library (added to `build.gradle.kts`), VPC private IP or proxy config, and Secret Manager wiring for credentials. Each step is documented; together they've consumed two weeks of solo MVPs in practice — even for developers with prior GCP experience.

2. **Background threads and FCM retries are unreliable by default.** Cloud Run is fundamentally request-driven. Even with `min-instances=1`, the platform recycles instances without notice for maintenance. Push notification retry loops and in-process polling background threads may be silently killed mid-send. Fixing this properly requires Cloud Scheduler + Cloud Tasks — two additional services that weren't in the original architecture.

3. **Cloud SQL `db-f1-micro` connection ceiling.** The cheapest Cloud SQL PostgreSQL option has a default maximum of 25 connections. Spring Boot's HikariCP defaults to a pool of 10. If Cloud Run auto-scales to 3 instances during a burst (both partners opening the app during labor), connection-refused errors appear before any application-level error handling fires.

4. **Frankfurt region (`europe-west3`) lacks Cloud Run domain mapping.** Custom domain mapping is region-limited in `europe-west3` — not available as of 2026-06-27. A custom domain requires a Global Load Balancer + serverless NEG (~$18/month extra). For a mobile API using the `*.run.app` URL, this is not a blocker at MVP, but it matters if a web frontend ever needs a real domain.

5. **The "free" compute story has hidden line items.** With `min-instances=1` (required for a responsive Spring Boot backend), a VPC connector, and Secret Manager API calls, the "free tier" quietly accumulates small charges. Under a realistic production configuration — Cloud SQL + VPC connector + Secret Manager — the bill reaches $20–40/month, not $7–15/month.

### Pre-Mortem — How This Could Fail

The team deployed BabyTrack's Spring Boot backend on Cloud Run in July 2026. Week one was consumed by GCP project setup: Artifact Registry, service account with least-privilege IAM roles, Cloud SQL Java connector configuration in `build.gradle.kts`, and Secret Manager wiring. The first Expo mobile client connected successfully on day eight.

Week two, FCM push notifications failed silently in ~15% of cases. Investigation revealed the Spring Boot FCM retry thread was being killed when Cloud Run recycled the instance during an overnight quiet period. Adding Cloud Tasks introduced a new async flow not in the original design, requiring changes to the contraction-logging and partner-linking flows. This pushed core feature work into week four.

The final monthly bill was $38 — Cloud SQL had to be upgraded from `db-f1-micro` after the first HikariCP connection pool exhaustion incident (three Cloud Run instances × 10 connections each exceeded the 25-connection default). The "free compute" premise held, but the surrounding services cost more than Railway or Fly.io would have charged for a simpler setup.

### Unknown Unknowns

- **Cloud SQL Auth Proxy / Java Connector is mandatory for secure connections.** Most tutorials either skip it or show a public IP (insecure for production). The Cloud SQL Java Connector (`com.google.cloud.sql:postgres-socket-factory`) must be added to `build.gradle.kts` and is version-sensitive against the JDBC driver. Not mentioned in Cloud Run quickstarts.
- **Artifact Registry replaced Container Registry — `gcr.io` is sunset for new projects in 2026.** Most 2023–2024 tutorials reference `gcr.io`. New projects must use Artifact Registry (`europe-west3-docker.pkg.dev`). Following an outdated tutorial fails silently until the push command.
- **Instance recycling is not configurable.** Unlike Fly.io VMs, Cloud Run instances are ephemeral containers GCP recycles on its own schedule. `min-instances=1` guarantees one instance is always running, not that the same instance persists. In-memory state (cached partner link, warm HikariCP pool) is reset on any recycle.
- **`gcloud beta run services logs tail` is a beta command.** Real-time log streaming via CLI is the most useful debugging tool during a sprint; it's in beta as of 2026-06-27. The stable alternative is `gcloud logging read` with polling, or the Cloud Logging console.
- **HikariCP default pool size × Cloud Run instance count exceeds `db-f1-micro` connection limit.** See devil's advocate #3. Set `spring.datasource.hikari.maximum-pool-size=5` in `application-prod.properties` before first deploy.

---

## Operational Story

- **Preview deploys:** Deploy a new revision with no traffic using `gcloud run deploy babytrack-backend --no-traffic --tag=canary`. Send a test fraction with `gcloud run services update-traffic babytrack-backend --to-revisions=REVISION_ID=10,STABLE_ID=90 --region=europe-west3`. The `*.run.app` URL with `--tag` produces a stable preview URL per revision. No Cloudflare Access protection needed for a mobile-only API endpoint.

- **Secrets:** All credentials (Cloud SQL password, Google OAuth client secret, FCM service account JSON) live in Google Secret Manager. Reference them at deploy time: `gcloud run deploy ... --set-secrets=DB_PASSWORD=babytrack-db-password:latest,GOOGLE_CLIENT_SECRET=google-oauth-secret:latest`. Rotation: update the Secret Manager version (`gcloud secrets versions add SECRET_NAME --data-file=new-value.txt`), then redeploy. Cloud Run picks up the new version on the next instance start; force it with a no-op redeploy.

- **Rollback:** `gcloud run services update-traffic babytrack-backend --to-revisions=STABLE_REVISION_ID=100 --region=europe-west3`. Traffic switches in ~30 seconds. DB schema migrations applied in the bad revision do **not** roll back automatically — always write backwards-compatible migrations (additive only; rename/drop in a subsequent deploy after rollback window closes).

- **Approval:** Agent may run unattended: `gcloud run deploy`, `gcloud run services update-traffic`, `gcloud run revisions list`, `gcloud logging read`, `gcloud builds submit`. Human-only: deleting Cloud SQL instances, dropping databases, rotating the primary service account key (`gcloud iam service-accounts keys delete`), and any billing account changes.

- **Logs:** Build logs: `gcloud builds log BUILD_ID --stream`. Runtime logs (stable): `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=babytrack-backend" --limit=100 --format=json --project=PROJECT_ID --region=europe-west3`. Runtime logs (real-time, beta): `gcloud beta run services logs tail babytrack-backend --region=europe-west3`.

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| IAM setup complexity stalls the 5-week sprint | Devil's advocate | M | M | Codify setup as a `gcloud` shell script on day one; commit to repo. Run in sequence, not interactively. |
| FCM push notification retries silently drop on instance recycle | Devil's advocate | H | M | Use Cloud Tasks for FCM delivery retry queue; treat Cloud Run instance as stateless from the start. |
| HikariCP pool exhaustion on `db-f1-micro` (25-connection limit) | Devil's advocate / Unknown unknowns | M | H | Set `spring.datasource.hikari.maximum-pool-size=5` before first deploy. Upgrade to `db-g1-small` (~$25/month) if pool errors appear in production. |
| `europe-west3` domain mapping unavailable — custom domain blocked | Unknown unknowns | H | L | Use `*.run.app` URL for the mobile API at MVP. If web frontend needs a custom domain, use Cloud Load Balancer + serverless NEG (adds ~$18/month). |
| Artifact Registry (not `gcr.io`) required for new GCP projects | Unknown unknowns | H | L | Always use `europe-west3-docker.pkg.dev/PROJECT_ID/babytrack/backend` as image path. Reject any tutorial referencing `gcr.io`. |
| Instance recycling kills in-process state / background threads | Unknown unknowns | M | M | Design Spring Boot app as fully stateless from day one. Use Cloud Scheduler + Cloud Tasks for all periodic work. |
| Cost creep beyond free-tier estimate ($38/month pre-mortem) | Pre-mortem | M | M | Set a GCP budget alert at $20/month. Monitor `db-f1-micro` connection count before upgrading tier. |
| `gcloud beta run services logs tail` instability (beta command) | Research finding | L | L | Fall back to `gcloud logging read` with `--freshness=1m` polling in agent workflows. |
| Cloud SQL Java Connector version mismatch with JDBC driver | Unknown unknowns | M | M | Pin `com.google.cloud.sql:postgres-socket-factory` version in `build.gradle.kts`; test locally before first deploy. |

---

## Getting Started

These steps assume a GCP project is already created and billed. Run in order.

**1. Enable required APIs:**
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

**2. Create Artifact Registry and Cloud SQL instance (Frankfurt):**
```bash
gcloud artifacts repositories create babytrack \
  --repository-format=docker \
  --location=europe-west3 \
  --description="BabyTrack backend images"

gcloud sql instances create babytrack-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west3 \
  --storage-auto-increase
```

**3. Add the Cloud SQL Java Connector to `build.gradle.kts`:**
```kotlin
implementation("com.google.cloud.sql:postgres-socket-factory:1.20.0")
```
Set HikariCP pool size in `src/main/resources/application-prod.properties`:
```properties
spring.datasource.hikari.maximum-pool-size=5
server.port=${PORT:8080}
```

**4. Build and push the Docker image:**
```bash
gcloud builds submit \
  --tag europe-west3-docker.pkg.dev/PROJECT_ID/babytrack/backend:latest \
  --region=europe-west3
```

**5. Deploy to Cloud Run with min-instances and Cloud SQL wiring:**
```bash
gcloud run deploy babytrack-backend \
  --image europe-west3-docker.pkg.dev/PROJECT_ID/babytrack/backend:latest \
  --region=europe-west3 \
  --platform=managed \
  --min-instances=1 \
  --memory=1Gi \
  --add-cloudsql-instances=PROJECT_ID:europe-west3:babytrack-db \
  --set-env-vars="SPRING_PROFILES_ACTIVE=prod" \
  --set-secrets="DB_PASSWORD=babytrack-db-password:latest,GOOGLE_CLIENT_SECRET=google-oauth-secret:latest"
```

---

## Out of Scope

The following were not evaluated in this research:
- Docker image optimisation (layer caching, GraalVM native image, Jib thin JAR)
- CI/CD pipeline setup (GitHub Actions → Cloud Build → Cloud Run)
- Production-scale architecture (multi-region, HA Cloud SQL, Cloud Armor WAF)
- EAS build pipeline configuration for the Expo mobile app (handled separately via `eas.json`)
