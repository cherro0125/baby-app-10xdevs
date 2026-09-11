package com.babytrack.contraction

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ContractionRepository : JpaRepository<Contraction, UUID> {
    fun findAllByUserIdOrderByStartedAtDesc(userId: UUID): List<Contraction>
}
