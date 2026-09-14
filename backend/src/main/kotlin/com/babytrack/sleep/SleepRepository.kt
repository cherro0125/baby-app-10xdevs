package com.babytrack.sleep

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface SleepRepository : JpaRepository<Sleep, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Sleep>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Sleep>
}
