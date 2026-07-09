# BabyTrack Backend

Kotlin/Spring Boot 3.3.x backend for BabyTrack. Deployed to GCP Cloud Run (`europe-west3`). Database: Cloud SQL PostgreSQL 15.

## Prerequisites

- JDK 21 (temurin recommended)
- Docker
- `gcloud` CLI authenticated (`gcloud auth login`)
- PostgreSQL client (`psql`) for local inspection

## Local development

**1. Start the local Postgres:**
```bash
docker-compose up -d
```

**2. Run the app with the dev profile:**
```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

The app starts on port 8080. Flyway migrations run automatically on startup.

**3. Verify:**
```bash
curl http://localhost:8080/actuator/health
# → {"status":"UP"}
```

**4. Stop:**
```bash
docker-compose down
```

## Running tests

```bash
./gradlew test
```

Tests use Testcontainers (spins up a real Postgres container). Docker must be running.

## GCP setup (one-time)

Run once before the first deploy to provision all GCP resources:

```bash
export GCP_PROJECT_ID=your-gcp-project-id
bash scripts/gcp-setup.sh
```

The script creates:
- Artifact Registry repo `babytrack` in `europe-west3`
- Cloud SQL instance `babytrack-db` (POSTGRES_15, db-f1-micro)
- Cloud SQL database and user `babytrack`
- Secret Manager secrets: `babytrack-db-password`, `jwt-secret`, `google-client-id`
- Service account `babytrack-backend-sa` with least-privilege roles

After the script completes, populate the secrets:
```bash
echo -n 'YOUR_DB_PASSWORD'      | gcloud secrets versions add babytrack-db-password --data-file=-
echo -n 'YOUR_JWT_SECRET'       | gcloud secrets versions add jwt-secret --data-file=-
echo -n 'YOUR_GOOGLE_CLIENT_ID' | gcloud secrets versions add google-client-id --data-file=-
```

## First deploy

Set the following GitHub Secrets before pushing:

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | JSON key for `babytrack-backend-sa` (create with `gcloud iam service-accounts keys create`) |
| `GCP_PROJECT_ID` | Your GCP project ID |
| `CLOUD_SQL_INSTANCE` | `PROJECT_ID:europe-west3:babytrack-db` |

Then push any change to `backend/**` on `main` — GitHub Actions handles the rest.

## Environment variables reference

| Variable | Profile | Description |
|----------|---------|-------------|
| `SPRING_PROFILES_ACTIVE` | all | `dev` locally, `prod` on Cloud Run |
| `PORT` | prod | Injected by Cloud Run; app binds to this port |
| `CLOUD_SQL_INSTANCE` | prod | Cloud SQL connection name (`PROJECT:REGION:INSTANCE`) |
| `DB_USER` | prod | Cloud SQL username |
| `DB_PASSWORD` | prod | Cloud SQL password (from Secret Manager) |
| `JWT_SECRET` | prod | HMAC-SHA256 signing key (from Secret Manager, min 32 chars) |
| `GOOGLE_CLIENT_ID` | prod | OAuth 2.0 client ID from Google Cloud Console |

## Known constraints

**HikariCP pool size**: `maximum-pool-size=5` per instance. Cloud SQL `db-f1-micro` has a hard ceiling of 25 connections. At 3 Cloud Run instances × 5 = 15 connections — safe headroom. Do not increase `maximum-pool-size` without upgrading the Cloud SQL tier.

**Cloud SQL Java Connector URL**: The prod JDBC URL uses the socket factory format, not a TCP hostname:
```
jdbc:postgresql:///babytrack?cloudSqlInstance=PROJECT:europe-west3:babytrack-db&socketFactory=com.google.cloud.sql.postgres.SocketFactory
```
Direct TCP connection (`jdbc:postgresql://IP:5432/babytrack`) bypasses the connector and requires a public IP or VPC peering — do not use it in prod.

**Artifact Registry, not gcr.io**: New GCP projects in 2026 use `europe-west3-docker.pkg.dev`, not the deprecated `gcr.io`. The CI workflow and gcp-setup.sh are already configured correctly.
