package com.babytrack.partner

import com.babytrack.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

private val TOKEN_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".toCharArray()
private val SECURE_RANDOM = SecureRandom()

private fun generateToken(): String = buildString(8) {
    repeat(8) { append(TOKEN_CHARSET[SECURE_RANDOM.nextInt(TOKEN_CHARSET.size)]) }
}

@Service
class PartnerService(
    private val partnerInviteRepository: PartnerInviteRepository,
    private val partnerLinkRepository: PartnerLinkRepository,
    private val userRepository: UserRepository,
) {
    @Transactional
    fun generateInvite(inviterId: UUID): PartnerInviteDto {
        val now = Instant.now()
        val existing = partnerInviteRepository.findByInviterIdAndAcceptedAtIsNull(inviterId)
        if (existing != null && existing.expiresAt.isAfter(now)) {
            return existing.toInviteDto()
        }
        val invite = PartnerInvite(
            inviterId = inviterId,
            token = generateToken(),
            expiresAt = now.plus(24, ChronoUnit.HOURS),
        )
        return partnerInviteRepository.save(invite).toInviteDto()
    }

    @Transactional(readOnly = true)
    fun getInviteInfo(token: String): InviterInfoDto {
        val invite = partnerInviteRepository.findByToken(token)
            ?: throw PartnerInviteNotFoundException("Invite not found")
        validateInviteActive(invite)
        val inviter = userRepository.findById(invite.inviterId)
            .orElseThrow { PartnerInviteNotFoundException("Inviter not found") }
        return InviterInfoDto(inviterName = inviter.displayName, inviterEmail = inviter.email)
    }

    @Transactional
    fun acceptInvite(token: String, acceptingUserId: UUID): PartnerLinkDto {
        val invite = partnerInviteRepository.findByToken(token)
            ?: throw PartnerInviteNotFoundException("Invite not found")
        validateInviteActive(invite)
        val inviterId = invite.inviterId
        require(acceptingUserId != inviterId) { "Cannot accept your own invite" }
        if (partnerLinkRepository.findByUserAIdOrUserBId(inviterId, inviterId) != null) {
            throw AlreadyLinkedException("Inviter is already linked to a partner")
        }
        if (partnerLinkRepository.findByUserAIdOrUserBId(acceptingUserId, acceptingUserId) != null) {
            throw AlreadyLinkedException("You are already linked to a partner")
        }
        val (userAId, userBId) = if (inviterId < acceptingUserId) inviterId to acceptingUserId
                                  else acceptingUserId to inviterId
        partnerLinkRepository.save(PartnerLink(userAId = userAId, userBId = userBId))
        invite.acceptedAt = Instant.now()
        partnerInviteRepository.save(invite)
        val partner = userRepository.findById(inviterId)
            .orElseThrow { PartnerInviteNotFoundException("Inviter not found") }
        return PartnerLinkDto(
            partnerId = partner.id,
            partnerName = partner.displayName,
            partnerEmail = partner.email,
        )
    }

    @Transactional(readOnly = true)
    fun getPartnerStatus(userId: UUID): PartnerDto? {
        val link = partnerLinkRepository.findByUserAIdOrUserBId(userId, userId) ?: return null
        val partnerId = if (link.userAId == userId) link.userBId else link.userAId
        val partner = userRepository.findById(partnerId).orElse(null) ?: return null
        return PartnerDto(id = partner.id, email = partner.email, displayName = partner.displayName)
    }

    @Transactional
    fun unlink(userId: UUID) {
        partnerLinkRepository.deleteByUserId(userId)
        partnerInviteRepository.deleteByInviterIdAndAcceptedAtIsNull(userId)
    }

    private fun validateInviteActive(invite: PartnerInvite) {
        if (invite.acceptedAt != null || invite.expiresAt.isBefore(Instant.now())) {
            throw PartnerInviteExpiredException("Invite has expired or already been used")
        }
    }
}

