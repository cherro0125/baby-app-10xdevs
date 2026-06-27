---
change_id: backend-bootstrap
title: Spring Boot backend bootstrap + Cloud Run deploy
status: plan_reviewed
created: 2026-06-27
updated: 2026-06-27
roadmap_id: F-01
prd_refs:
  - FR-001
  - FR-003
  - NFR (data persistence)
unlocks:
  - google-auth (S-01)
---

## Summary

Kotlin/Spring Boot 3.3.x backend initialized in `backend/`; Dockerfile builds and runs; deployed to GCP Cloud Run (`europe-west3`); Cloud SQL PostgreSQL provisioned; `POST /api/auth/google` validates Google ID tokens and returns a JWT session; `users` table migrated via Flyway; GitHub Actions CI/CD pipeline deploys on push to main.

## Key Decisions

- Build tool: Gradle Kotlin DSL
- Spring Boot: 3.3.x
- Migrations: Flyway (SQL)
- Google token verification: `com.google.api-client:google-api-client:2.8.1` (GoogleIdTokenVerifier)
- Session JWT: JJWT 0.12.x (HMAC-SHA256, Secret Manager key)
- Error format: RFC 9457 Problem Details
- Local dev DB: docker-compose + local Postgres
- CI/CD: GitHub Actions in F-01 scope
- Testing: one integration test for POST /auth/google
- GCP setup: `backend/scripts/gcp-setup.sh`
