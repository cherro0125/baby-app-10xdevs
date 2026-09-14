package com.babytrack.feeding

import com.babytrack.partner.PartnerService
import com.babytrack.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class FeedingService(
    private val feedingRepository: FeedingRepository,
    private val userRepository: UserRepository,
    private val partnerService: PartnerService,
) {
    @Transactional
    fun create(
        userId: UUID,
        startedAt: Instant,
        endedAt: Instant,
        milkType: MilkType,
        amountMl: Int?,
        note: String?,
    ): Feeding {
        require(endedAt.isAfter(startedAt)) { "endedAt must be after startedAt" }
        val user = userRepository.getReferenceById(userId)
        val feeding = Feeding(
            user = user,
            milkType = milkType,
            startedAt = startedAt,
            endedAt = endedAt,
            durationMinutes = ChronoUnit.MINUTES.between(startedAt, endedAt).toInt(),
            amountMl = amountMl,
            note = note,
        )
        return feedingRepository.save(feeding)
    }

    @Transactional
    fun update(
        id: UUID,
        requesterId: UUID,
        startedAt: Instant?,
        endedAt: Instant?,
        milkType: MilkType?,
        amountMl: Int?,
        note: String?,
    ): Feeding {
        val feeding = feedingRepository.findById(id)
            .orElseThrow { FeedingNotFoundException("Feeding not found") }
        val partnerId = partnerService.getPartnerId(requesterId)
        if (feeding.userId != requesterId && feeding.userId != partnerId) {
            throw FeedingNotFoundException("Feeding not found")
        }
        val effectiveStartedAt = startedAt ?: feeding.startedAt
        val effectiveEndedAt = endedAt ?: feeding.endedAt
        require(effectiveEndedAt.isAfter(effectiveStartedAt)) { "endedAt must be after startedAt" }
        if (startedAt != null) feeding.startedAt = startedAt
        if (endedAt != null) feeding.endedAt = endedAt
        if (milkType != null) feeding.milkType = milkType
        if (amountMl != null) feeding.amountMl = amountMl
        if (note != null) feeding.note = note
        feeding.durationMinutes = ChronoUnit.MINUTES.between(effectiveStartedAt, effectiveEndedAt).toInt()
        feeding.updatedAt = Instant.now()
        return feedingRepository.save(feeding)
    }

    @Transactional(readOnly = true)
    fun listShared(userId: UUID): List<Feeding> {
        val partnerId = partnerService.getPartnerId(userId)
        return if (partnerId != null) {
            feedingRepository.findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userId, partnerId)
        } else {
            feedingRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)
        }
    }

    @Transactional(readOnly = true)
    fun list(userId: UUID): List<Feeding> =
        feedingRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)

    @Transactional
    fun delete(id: UUID, userId: UUID) {
        val feeding = feedingRepository.findById(id)
            .orElseThrow { FeedingNotFoundException("Feeding not found") }
        val partnerId = partnerService.getPartnerId(userId)
        if (feeding.userId != userId && feeding.userId != partnerId) {
            throw FeedingNotFoundException("Feeding not found")
        }
        feedingRepository.delete(feeding)
    }
}
