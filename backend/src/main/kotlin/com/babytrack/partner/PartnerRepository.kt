package com.babytrack.partner

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface PartnerInviteRepository : JpaRepository<PartnerInvite, UUID> {
    fun findByToken(token: String): PartnerInvite?
    fun findByInviterIdAndAcceptedAtIsNull(inviterId: UUID): PartnerInvite?
    fun deleteByInviterIdAndAcceptedAtIsNull(inviterId: UUID)
}

interface PartnerLinkRepository : JpaRepository<PartnerLink, UUID> {
    fun findByUserAIdOrUserBId(userAId: UUID, userBId: UUID): PartnerLink?

    @Modifying
    @Query("DELETE FROM PartnerLink p WHERE p.userAId = :userId OR p.userBId = :userId")
    fun deleteByUserId(userId: UUID)
}
