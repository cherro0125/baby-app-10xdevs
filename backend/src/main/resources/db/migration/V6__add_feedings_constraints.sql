ALTER TABLE feedings
    ADD CONSTRAINT milk_type_valid CHECK (milk_type IN ('BREAST', 'FORMULA', 'PUMPED', 'OTHER')),
    ADD CONSTRAINT feedings_temporal_order CHECK (ended_at > started_at);
