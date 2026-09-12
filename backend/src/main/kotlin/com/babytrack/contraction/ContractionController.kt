package com.babytrack.contraction

import com.babytrack.auth.AuthenticatedUser
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID

data class StartContractionRequest(@field:NotNull val startedAt: Instant)
data class FinalizeContractionRequest(@field:NotNull val endedAt: Instant)

data class ContractionDto(
    val id: UUID,
    val userId: UUID,
    val startedAt: Instant,
    val endedAt: Instant?,
    val durationSeconds: Int?,
    val strength: Int?,
    val note: String?,
    val createdAt: Instant,
)

fun Contraction.toDto() = ContractionDto(
    id = id,
    userId = userId,
    startedAt = startedAt,
    endedAt = endedAt,
    durationSeconds = durationSeconds,
    strength = strength,
    note = note,
    createdAt = createdAt,
)

@RestController
@RequestMapping("/api/contractions")
class ContractionController(private val contractionService: ContractionService) {

    private fun principal(): AuthenticatedUser =
        SecurityContextHolder.getContext().authentication?.principal as? AuthenticatedUser
            ?: throw IllegalStateException("No authenticated principal")

    @PostMapping
    fun start(@Valid @RequestBody request: StartContractionRequest): ResponseEntity<ContractionDto> {
        val user = principal()
        val contraction = contractionService.start(user.id, request.startedAt)
        return ResponseEntity.status(HttpStatus.CREATED).body(contraction.toDto())
    }

    @PatchMapping("/{id}")
    fun finalize(
        @PathVariable id: UUID,
        @Valid @RequestBody request: FinalizeContractionRequest,
    ): ResponseEntity<ContractionDto> {
        val user = principal()
        val contraction = contractionService.finalize(id, user.id, request.endedAt)
        return ResponseEntity.ok(contraction.toDto())
    }

    @GetMapping
    fun list(): ResponseEntity<List<ContractionDto>> {
        val user = principal()
        return ResponseEntity.ok(contractionService.list(user.id).map { it.toDto() })
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID): ResponseEntity<Void> {
        val user = principal()
        contractionService.delete(id, user.id)
        return ResponseEntity.noContent().build()
    }
}
