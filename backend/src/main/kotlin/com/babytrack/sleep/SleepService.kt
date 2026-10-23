package com.babytrack.sleep

import com.babytrack.partner.PartnerService
import com.babytrack.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

data class SleepUpsertResult(val sleep: Sleep, val created: Boolean)

@Service
class SleepService(
    private val sleepRepository: SleepRepository,
    private val userRepository: UserRepository,
    private val partnerService: PartnerService,
) {
    @Transactional
    fun create(
        userId: UUID,
        startedAt: Instant,
        endedAt: Instant,
        sleepType: SleepType,
        note: String?,
    ): Sleep {
        require(endedAt.isAfter(startedAt)) { "endedAt must be after startedAt" }
        val user = userRepository.getReferenceById(userId)
        val sleep = Sleep(
            user = user,
            // userId is a read-only mirror of user_id; set it so the returned DTO is correct before reload.
            userId = userId,
            sleepType = sleepType,
            startedAt = startedAt,
            endedAt = endedAt,
            durationMinutes = ChronoUnit.MINUTES.between(startedAt, endedAt).toInt(),
            note = note,
        )
        return sleepRepository.save(sleep)
    }

    @Transactional
    fun update(
        id: UUID,
        requesterId: UUID,
        startedAt: Instant?,
        endedAt: Instant?,
        sleepType: SleepType?,
        note: String?,
    ): Sleep {
        val sleep = sleepRepository.findById(id)
            .orElseThrow { SleepNotFoundException("Sleep not found") }
        val partnerId = partnerService.getPartnerId(requesterId)
        if (sleep.userId != requesterId && sleep.userId != partnerId) {
            throw SleepNotFoundException("Sleep not found")
        }
        val effectiveStartedAt = startedAt ?: sleep.startedAt
        val effectiveEndedAt = endedAt ?: sleep.endedAt
        require(effectiveEndedAt.isAfter(effectiveStartedAt)) { "endedAt must be after startedAt" }
        if (startedAt != null) sleep.startedAt = startedAt
        if (endedAt != null) sleep.endedAt = endedAt
        if (sleepType != null) sleep.sleepType = sleepType
        if (note != null) sleep.note = note
        sleep.durationMinutes = ChronoUnit.MINUTES.between(effectiveStartedAt, effectiveEndedAt).toInt()
        sleep.updatedAt = Instant.now()
        return sleepRepository.save(sleep)
    }

    /**
     * Creates the sleep under the client-supplied [id], or fully replaces it if it exists.
     * Unlike [update], a null [note] clears the stored value.
     * With [allowCreate] false a missing [id] throws [SleepNotFoundException] instead of being created.
     */
    @Transactional
    fun upsert(
        id: UUID,
        requesterId: UUID,
        startedAt: Instant,
        endedAt: Instant,
        sleepType: SleepType,
        note: String?,
        allowCreate: Boolean = true,
    ): SleepUpsertResult {
        require(endedAt.isAfter(startedAt)) { "endedAt must be after startedAt" }
        val durationMinutes = ChronoUnit.MINUTES.between(startedAt, endedAt).toInt()
        // Atomic insert: overlapping PUTs for the same new id can't both create it, and a row that
        // already exists always goes through the owner/partner check below.
        // Partner edits pass allowCreate = false: a sleep deleted meanwhile must not come back as the editor's own.
        if (allowCreate) {
            val inserted = sleepRepository.insertIfAbsent(
                id, requesterId, sleepType.name, startedAt, endedAt, durationMinutes, note, Instant.now(),
            )
            if (inserted == 1) {
                return SleepUpsertResult(sleepRepository.findById(id).orElseThrow(), created = true)
            }
        }
        val existing = sleepRepository.findById(id)
            .orElseThrow { SleepNotFoundException("Sleep not found") }
        val partnerId = partnerService.getPartnerId(requesterId)
        if (existing.userId != requesterId && existing.userId != partnerId) {
            throw SleepNotFoundException("Sleep not found")
        }
        existing.startedAt = startedAt
        existing.endedAt = endedAt
        existing.sleepType = sleepType
        existing.note = note
        existing.durationMinutes = durationMinutes
        existing.updatedAt = Instant.now()
        return SleepUpsertResult(sleepRepository.save(existing), created = false)
    }

    @Transactional(readOnly = true)
    fun listShared(userId: UUID): List<Sleep> {
        val partnerId = partnerService.getPartnerId(userId)
        return if (partnerId != null) {
            sleepRepository.findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userId, partnerId)
        } else {
            sleepRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)
        }
    }

    @Transactional(readOnly = true)
    fun list(userId: UUID): List<Sleep> =
        sleepRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)

    @Transactional
    fun delete(id: UUID, userId: UUID) {
        val sleep = sleepRepository.findById(id)
            .orElseThrow { SleepNotFoundException("Sleep not found") }
        val partnerId = partnerService.getPartnerId(userId)
        if (sleep.userId != userId && sleep.userId != partnerId) {
            throw SleepNotFoundException("Sleep not found")
        }
        sleepRepository.delete(sleep)
    }
}
