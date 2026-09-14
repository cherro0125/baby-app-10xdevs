package com.babytrack.feeding

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FeedingRepository : JpaRepository<Feeding, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Feeding>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Feeding>
}
