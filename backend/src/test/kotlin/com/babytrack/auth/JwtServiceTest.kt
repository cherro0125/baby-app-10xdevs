package com.babytrack.auth

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.Assertions.assertEquals
import java.util.UUID

class JwtServiceTest {

    private val secret = "test-secret-minimum-32-chars-for-hs256"
    private val jwtService = JwtService(secret)

    @Test
    fun `issue and parse round-trip returns correct claims`() {
        val userId = UUID.randomUUID()
        val email = "user@example.com"

        val token = jwtService.issue(userId, email)
        val claims = jwtService.parse(token)

        assertEquals(userId, claims.userId)
        assertEquals(email, claims.email)
    }

    @Test
    fun `parse throws InvalidJwtException for tampered signature`() {
        val token = jwtService.issue(UUID.randomUUID(), "user@example.com")
        val tampered = token.dropLast(5) + "XXXXX"

        assertThrows<InvalidJwtException> { jwtService.parse(tampered) }
    }

    @Test
    fun `parse throws InvalidJwtException for token signed with wrong key`() {
        val otherService = JwtService("other-secret-minimum-32-chars-for-hs256")
        val token = otherService.issue(UUID.randomUUID(), "user@example.com")

        assertThrows<InvalidJwtException> { jwtService.parse(token) }
    }

    @Test
    fun `parse throws InvalidJwtException for malformed token`() {
        assertThrows<InvalidJwtException> { jwtService.parse("not.a.jwt") }
    }

    @Test
    fun `issue produces three-segment JWT`() {
        val token = jwtService.issue(UUID.randomUUID(), "user@example.com")
        assertEquals(3, token.split(".").size)
    }
}
