package com.babytrack.contraction

import com.babytrack.partner.PartnerService
import com.babytrack.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

data class ContractionUpsertResult(val contraction: Contraction, val created: Boolean)

@Service
class ContractionService(
    private val contractionRepository: ContractionRepository,
    private val userRepository: UserRepository,
    private val partnerService: PartnerService,
) {
    @Transactional
    fun start(userId: UUID, startedAt: Instant): Contraction {
        val user = userRepository.getReferenceById(userId)
        // userId is a read-only mirror of user_id; set it so the returned DTO is correct before reload.
        val contraction = Contraction(user = user, userId = userId, startedAt = startedAt)
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

    /**
     * Creates the finished contraction under the client-supplied [id], or fully replaces it if it exists.
     * Unlike [update], null [strength] / [note] clear the stored value.
     * With [allowCreate] false a missing [id] throws [ContractionNotFoundException] instead of being created.
     */
    @Transactional
    fun upsert(
        id: UUID,
        requesterId: UUID,
        startedAt: Instant,
        endedAt: Instant,
        strength: Int?,
        note: String?,
        allowCreate: Boolean = true,
    ): ContractionUpsertResult {
        require(endedAt.isAfter(startedAt)) { "endedAt must be after startedAt" }
        val durationSeconds = ChronoUnit.SECONDS.between(startedAt, endedAt).toInt()
        // Atomic insert: overlapping PUTs for the same new id can't both create it, and a row that
        // already exists always goes through the owner/partner check below.
        // Partner edits pass allowCreate = false: a contraction deleted meanwhile must not come back as the editor's own.
        if (allowCreate) {
            val inserted = contractionRepository.insertIfAbsent(
                id, requesterId, startedAt, endedAt, durationSeconds, strength, note, Instant.now(),
            )
            if (inserted == 1) {
                return ContractionUpsertResult(contractionRepository.findById(id).orElseThrow(), created = true)
            }
        }
        val existing = contractionRepository.findById(id)
            .orElseThrow { ContractionNotFoundException("Contraction not found") }
        val partnerId = partnerService.getPartnerId(requesterId)
        if (existing.userId != requesterId && existing.userId != partnerId) {
            throw ContractionNotFoundException("Contraction not found")
        }
        existing.startedAt = startedAt
        existing.endedAt = endedAt
        existing.strength = strength
        existing.note = note
        existing.durationSeconds = durationSeconds
        existing.updatedAt = Instant.now()
        return ContractionUpsertResult(contractionRepository.save(existing), created = false)
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
