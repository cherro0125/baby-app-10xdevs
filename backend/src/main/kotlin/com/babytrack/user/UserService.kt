package com.babytrack.user

import com.babytrack.auth.GoogleTokenClaims
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class UserService(private val userRepository: UserRepository) {

    @Transactional
    fun upsertUser(claims: GoogleTokenClaims): User {
        val existing = userRepository.findByGoogleSub(claims.sub)
        return if (existing == null) {
            userRepository.save(
                User(
                    googleSub = claims.sub,
                    email = claims.email,
                    displayName = claims.displayName,
                )
            )
        } else {
            if (existing.email != claims.email || existing.displayName != claims.displayName) {
                existing.email = claims.email
                existing.displayName = claims.displayName
                existing.updatedAt = Instant.now()
                userRepository.save(existing)
            } else {
                existing
            }
        }
    }
}
