ALTER TABLE sleeps
    ADD CONSTRAINT sleep_type_valid CHECK (sleep_type IN ('NAP', 'NIGHT', 'OTHER')),
    ADD CONSTRAINT sleeps_temporal_order CHECK (ended_at > started_at);
