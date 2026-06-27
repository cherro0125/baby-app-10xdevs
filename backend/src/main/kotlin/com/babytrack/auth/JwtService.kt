package com.babytrack.auth

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.Date
import java.util.UUID
import javax.crypto.SecretKey

data class JwtClaims(val userId: UUID, val email: String)

class InvalidJwtException(message: String) : RuntimeException(message)

@Service
class JwtService(@Value("\${app.jwt.secret}") secret: String) {
    private val key: SecretKey = Keys.hmacShaKeyFor(secret.toByteArray())
    private val thirtyDaysMs = 30L * 24 * 60 * 60 * 1000

    fun issue(userId: UUID, email: String): String =
        Jwts.builder()
            .subject(userId.toString())
            .claim("email", email)
            .issuedAt(Date())
            .expiration(Date(System.currentTimeMillis() + thirtyDaysMs))
            .signWith(key)
            .compact()

    fun parse(token: String): JwtClaims {
        val claims = try {
            Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .payload
        } catch (e: Exception) {
            throw InvalidJwtException("Invalid JWT: ${e.message}")
        }
        return JwtClaims(
            userId = UUID.fromString(claims.subject),
            email = claims["email"] as String,
        )
    }
}
