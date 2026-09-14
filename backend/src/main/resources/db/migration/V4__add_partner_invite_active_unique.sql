-- Remove duplicate active invites, keeping only the most recent per inviter
DELETE FROM partner_invites
WHERE id NOT IN (
    SELECT DISTINCT ON (inviter_id) id
    FROM partner_invites
    WHERE accepted_at IS NULL
    ORDER BY inviter_id, created_at DESC
)
AND accepted_at IS NULL;

-- Enforce at most one active invite per user at the DB level
CREATE UNIQUE INDEX idx_partner_invites_active_inviter
    ON partner_invites(inviter_id)
    WHERE accepted_at IS NULL;

-- Remove the redundant non-unique index on token (UNIQUE constraint already creates one)
DROP INDEX idx_partner_invites_token;
