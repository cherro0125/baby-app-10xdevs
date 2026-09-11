package com.babytrack.auth

import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class GoogleTokenClaims(val sub: String, val email: String, val displayName: String?)

class InvalidGoogleTokenException(message: String) : RuntimeException(message)

@Component
class GoogleTokenVerifier(
    @Value("\${app.google.client-id}") clientId: String,
    @Value("\${app.google.ios-client-id:}") iosClientId: String,
) {
    private val verifier: GoogleIdTokenVerifier = GoogleIdTokenVerifier.Builder(
        NetHttpTransport(),
        GsonFactory.getDefaultInstance()
    ).setAudience(listOfNotNull(clientId, iosClientId.ifBlank { null })).build()

    fun verify(idToken: String): GoogleTokenClaims {
        val token = try {
            verifier.verify(idToken)
        } catch (e: Exception) {
            throw InvalidGoogleTokenException("Token verification failed: ${e.message}")
        } ?: throw InvalidGoogleTokenException("Token is null or invalid")

        val payload = token.payload
        return GoogleTokenClaims(
            sub = payload.subject,
            email = payload.email,
            displayName = payload["name"] as? String,
        )
    }
}
