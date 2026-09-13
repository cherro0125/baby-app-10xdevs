package com.babytrack.partner

import com.babytrack.auth.AuthenticatedUser
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

data class PartnerInviteDto(val token: String, val deepLink: String, val expiresAt: Instant)
data class InviterInfoDto(val inviterName: String?, val inviterEmail: String)
data class PartnerLinkDto(val partnerId: UUID, val partnerName: String?, val partnerEmail: String)
data class PartnerDto(val id: UUID, val email: String, val displayName: String?)

data class LinkRequest(val token: String)

@RestController
@RequestMapping("/api/partner")
class PartnerController(private val partnerService: PartnerService) {

    private fun principal(): AuthenticatedUser =
        SecurityContextHolder.getContext().authentication?.principal as? AuthenticatedUser
            ?: throw IllegalStateException("No authenticated principal")

    @PostMapping("/invite")
    fun generateInvite(): ResponseEntity<PartnerInviteDto> {
        val user = principal()
        val dto = partnerService.generateInvite(user.id)
        return ResponseEntity.status(HttpStatus.CREATED).body(dto)
    }

    @GetMapping("/invite/{token}")
    fun getInviteInfo(@PathVariable token: String): ResponseEntity<InviterInfoDto> {
        val dto = partnerService.getInviteInfo(token)
        return ResponseEntity.ok(dto)
    }

    @PostMapping("/link")
    fun acceptInvite(@RequestBody request: LinkRequest): ResponseEntity<PartnerLinkDto> {
        val user = principal()
        val dto = partnerService.acceptInvite(request.token, user.id)
        return ResponseEntity.ok(dto)
    }

    @DeleteMapping
    fun unlink(): ResponseEntity<Void> {
        val user = principal()
        partnerService.unlink(user.id)
        return ResponseEntity.noContent().build()
    }

    @GetMapping
    fun getStatus(): ResponseEntity<PartnerDto> {
        val user = principal()
        val dto = partnerService.getPartnerStatus(user.id)
            ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(dto)
    }
}
