CREATE TABLE partner_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(8) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_partner_invites_token   ON partner_invites(token);
CREATE INDEX idx_partner_invites_inviter ON partner_invites(inviter_id);

CREATE TABLE partner_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  user_b_id  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a_id <> user_b_id)
);
