package com.babytrack.sleep

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

interface SleepRepository : JpaRepository<Sleep, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Sleep>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Sleep>

    /** Inserts the sleep unless the id exists; returns 1 if inserted, 0 otherwise. */
    @Modifying
    @Query(
        value = """
            INSERT INTO sleeps (id, user_id, sleep_type, started_at, ended_at, duration_minutes, note, created_at, updated_at)
            VALUES (:id, :userId, :sleepType, :startedAt, :endedAt, :durationMinutes, :note, :now, :now)
            ON CONFLICT (id) DO NOTHING
        """,
        nativeQuery = true,
    )
    fun insertIfAbsent(
        id: UUID,
        userId: UUID,
        sleepType: String,
        startedAt: Instant,
        endedAt: Instant,
        durationMinutes: Int,
        note: String?,
        now: Instant,
    ): Int
}
