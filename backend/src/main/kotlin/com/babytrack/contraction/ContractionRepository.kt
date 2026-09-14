package com.babytrack.contraction

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ContractionRepository : JpaRepository<Contraction, UUID> {
    fun findTop200ByUserIdOrderByStartedAtDesc(userId: UUID): List<Contraction>
    fun findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userIdA: UUID, userIdB: UUID): List<Contraction>
}
