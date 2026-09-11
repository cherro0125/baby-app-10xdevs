package com.babytrack.auth

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class GoogleTokenClaims(val sub: String, val email: String, val displayName: String?)

class InvalidGoogleTokenException(message: String) : RuntimeException(message)

@Component
class GoogleTokenVerifier(
    @Value("\${app.google.client-id}") clientId: String,
    @Value("\${app.google.ios-client-id:}") iosClientId: String,
) {
    private val logger = LoggerFactory.getLogger(GoogleTokenVerifier::class.java)

    // Both IDs belong to the same GCP project.
    // Native iOS Sign-In issues tokens with the iOS client ID as audience.
    private val verifier: GoogleIdTokenVerifier = GoogleIdTokenVerifier.Builder(
        NetHttpTransport(),
        GsonFactory.getDefaultInstance()
    ).setAudience(listOfNotNull(clientId, iosClientId.ifBlank { null })).build()

    fun verify(idToken: String): GoogleTokenClaims {
        val token = try {
            verifier.verify(idToken)
        } catch (e: Exception) {
            logger.warn("Google token verification failed", e)
            throw InvalidGoogleTokenException("Invalid or expired Google ID token")
        } ?: throw InvalidGoogleTokenException("Invalid or expired Google ID token")

        val payload = token.payload
        return GoogleTokenClaims(
            sub = payload.subject,
            email = payload.email,
            displayName = payload["name"] as? String,
        )
    }
}
