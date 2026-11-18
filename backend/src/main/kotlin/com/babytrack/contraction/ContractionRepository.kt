package com.babytrack.contraction

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

interface ContractionRepository : JpaRepository<Contraction, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Contraction>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Contraction>

    /** Inserts the contraction unless the id exists; returns 1 if inserted, 0 otherwise. */
    @Modifying
    @Query(
        value = """
            INSERT INTO contractions (id, user_id, started_at, ended_at, duration_seconds, strength, note, created_at, updated_at)
            VALUES (:id, :userId, :startedAt, :endedAt, :durationSeconds, :strength, :note, :now, :now)
            ON CONFLICT (id) DO NOTHING
        """,
        nativeQuery = true,
    )
    fun insertIfAbsent(
        id: UUID,
        userId: UUID,
        startedAt: Instant,
        endedAt: Instant,
        durationSeconds: Int,
        strength: Int?,
        note: String?,
        now: Instant,
    ): Int
}
