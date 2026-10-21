package com.babytrack.feeding

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant
import java.util.UUID

interface FeedingRepository : JpaRepository<Feeding, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Feeding>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Feeding>

    /** Inserts the feeding unless the id exists; returns 1 if inserted, 0 otherwise. */
    @Modifying
    @Query(
        value = """
            INSERT INTO feedings (id, user_id, milk_type, started_at, ended_at, duration_minutes, amount_ml, note, created_at, updated_at)
            VALUES (:id, :userId, :milkType, :startedAt, :endedAt, :durationMinutes, :amountMl, :note, :now, :now)
            ON CONFLICT (id) DO NOTHING
        """,
        nativeQuery = true,
    )
    fun insertIfAbsent(
        id: UUID,
        userId: UUID,
        milkType: String,
        startedAt: Instant,
        endedAt: Instant,
        durationMinutes: Int,
        amountMl: Int?,
        note: String?,
        now: Instant,
    ): Int
}
