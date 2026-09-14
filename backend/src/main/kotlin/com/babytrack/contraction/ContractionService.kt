package com.babytrack.contraction

import com.babytrack.partner.PartnerService
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
    private val partnerService: PartnerService,
) {
    @Transactional
    fun start(userId: UUID, startedAt: Instant): Contraction {
        val user = userRepository.getReferenceById(userId)
        val contraction = Contraction(user = user, startedAt = startedAt)
        return contractionRepository.save(contraction)
    }

    @Transactional
    fun update(id: UUID, requesterId: UUID, startedAt: Instant?, endedAt: Instant): Contraction {
        val contraction = contractionRepository.findById(id)
            .orElseThrow { ContractionNotFoundException("Contraction not found") }
        val partnerId = partnerService.getPartnerId(requesterId)
        if (contraction.userId != requesterId && contraction.userId != partnerId) {
            throw ContractionNotFoundException("Contraction not found")
        }
        val effectiveStartedAt = startedAt ?: contraction.startedAt
        require(endedAt.isAfter(effectiveStartedAt)) { "endedAt must be after startedAt" }
        if (startedAt != null) contraction.startedAt = startedAt
        contraction.endedAt = endedAt
        contraction.durationSeconds = ChronoUnit.SECONDS.between(effectiveStartedAt, endedAt).toInt()
        contraction.updatedAt = Instant.now()
        return contractionRepository.save(contraction)
    }

    @Transactional(readOnly = true)
    fun listShared(userId: UUID): List<Contraction> {
        val partnerId = partnerService.getPartnerId(userId)
        return if (partnerId != null) {
            contractionRepository.findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userId, partnerId)
        } else {
            contractionRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)
        }
    }

    @Transactional(readOnly = true)
    fun list(userId: UUID): List<Contraction> =
        contractionRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)

    @Transactional
    fun delete(id: UUID, userId: UUID) {
        val contraction = contractionRepository.findById(id)
            .orElseThrow { ContractionNotFoundException("Contraction not found") }
        val partnerId = partnerService.getPartnerId(userId)
        if (contraction.userId != userId && contraction.userId != partnerId) {
            throw ContractionNotFoundException("Contraction not found")
        }
        contractionRepository.delete(contraction)
    }
}
