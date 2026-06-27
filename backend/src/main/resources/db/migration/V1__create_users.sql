CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub   VARCHAR(255) UNIQUE NOT NULL,
    email        VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
