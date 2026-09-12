package com.babytrack.contraction

import com.babytrack.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class ContractionService(
    private val contractionRepository: ContractionRepository,
    private val userRepository: UserRepository,
) {
    @Transactional
    fun start(userId: UUID, startedAt: Instant): Contraction {
        val user = userRepository.getReferenceById(userId)
        val contraction = Contraction(user = user, startedAt = startedAt)
        return contractionRepository.save(contraction)
    }

    @Transactional
    fun finalize(id: UUID, userId: UUID, endedAt: Instant): Contraction {
        val contraction = contractionRepository.findById(id)
            .filter { it.user.id == userId }
            .orElseThrow { ContractionNotFoundException("Contraction not found") }
        if (contraction.endedAt != null) return contraction
        require(endedAt.isAfter(contraction.startedAt)) { "endedAt must be after startedAt" }
        contraction.endedAt = endedAt
        contraction.durationSeconds = ChronoUnit.SECONDS.between(contraction.startedAt, endedAt).toInt()
        contraction.updatedAt = Instant.now()
        return contractionRepository.save(contraction)
    }

    @Transactional(readOnly = true)
    fun list(userId: UUID): List<Contraction> =
        contractionRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)

    @Transactional
    fun delete(id: UUID, userId: UUID) {
        val contraction = contractionRepository.findById(id)
            .filter { it.user.id == userId }
            .orElseThrow { ContractionNotFoundException("Contraction not found") }
        contractionRepository.delete(contraction)
    }
}
