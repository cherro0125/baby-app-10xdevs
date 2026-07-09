#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"

echo "==> Setting active GCP project to ${GCP_PROJECT_ID}"
gcloud config set project "${GCP_PROJECT_ID}"

echo "==> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Creating Artifact Registry repository"
gcloud artifacts repositories create babytrack \
  --repository-format=docker \
  --location=europe-west3 \
  --description="BabyTrack backend images" \
  || echo "Artifact Registry repo already exists, skipping"

echo "==> Creating Cloud SQL instance (takes a few minutes)"
gcloud sql instances create babytrack-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west3 \
  --storage-auto-increase \
  || echo "Cloud SQL instance already exists, skipping"

echo "==> Creating Cloud SQL database"
gcloud sql databases create babytrack \
  --instance=babytrack-db \
  || echo "Database already exists, skipping"

echo "==> Creating Cloud SQL user"
gcloud sql users create babytrack \
  --instance=babytrack-db \
  --password="$(openssl rand -base64 32)" \
  || echo "User already exists, skipping"

echo "==> Creating Secret Manager secrets"
gcloud secrets create babytrack-db-password \
  --replication-policy=automatic \
  || echo "Secret babytrack-db-password already exists, skipping"

gcloud secrets create jwt-secret \
  --replication-policy=automatic \
  || echo "Secret jwt-secret already exists, skipping"

gcloud secrets create google-client-id \
  --replication-policy=automatic \
  || echo "Secret google-client-id already exists, skipping"

echo ""
echo "==> Populate secrets with actual values before deploying:"
echo "    echo -n 'YOUR_DB_PASSWORD'    | gcloud secrets versions add babytrack-db-password --data-file=-"
echo "    echo -n 'YOUR_JWT_SECRET'     | gcloud secrets versions add jwt-secret --data-file=-"
echo "    echo -n 'YOUR_GOOGLE_CLIENT_ID' | gcloud secrets versions add google-client-id --data-file=-"

echo "==> Creating service account"
gcloud iam service-accounts create babytrack-backend-sa \
  --display-name="BabyTrack Backend Service Account" \
  || echo "Service account already exists, skipping"

SA_EMAIL="babytrack-backend-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Granting IAM roles to service account"
for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor roles/run.invoker; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --condition=None \
    || echo "Role ${ROLE} binding already exists, skipping"
done

echo ""
echo "==> GCP setup complete!"
echo "    Next steps:"
echo "    1. Populate the Secret Manager secrets (see above)"
echo "    2. Set GitHub Secrets: GCP_SA_KEY, GCP_PROJECT_ID, CLOUD_SQL_INSTANCE"
echo "       CLOUD_SQL_INSTANCE = ${GCP_PROJECT_ID}:europe-west3:babytrack-db"
echo "    3. Push to main to trigger the CI deploy, or run:"
echo "       gcloud run deploy babytrack-backend --image europe-west3-docker.pkg.dev/${GCP_PROJECT_ID}/babytrack/backend:latest --region europe-west3"
