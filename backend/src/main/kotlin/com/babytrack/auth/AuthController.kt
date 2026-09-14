package com.babytrack.auth

import com.babytrack.user.UserService
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.http.HttpStatus
import java.util.UUID

data class AuthRequest(@field:NotBlank val idToken: String)
data class UserDto(val id: UUID, val email: String, val displayName: String?)
data class AuthResponse(val token: String, val user: UserDto)

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val googleTokenVerifier: GoogleTokenVerifier,
    private val userService: UserService,
    private val jwtService: JwtService,
) {
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout() = Unit

    @PostMapping("/google")
    fun googleAuth(@Valid @RequestBody request: AuthRequest): ResponseEntity<AuthResponse> {
        val claims = googleTokenVerifier.verify(request.idToken)
        val user = userService.upsertUser(claims)
        val token = jwtService.issue(user.id, user.email)
        return ResponseEntity.ok(
            AuthResponse(
                token = token,
                user = UserDto(id = user.id, email = user.email, displayName = user.displayName),
            )
        )
    }
}
