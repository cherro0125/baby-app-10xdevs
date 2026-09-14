package com.babytrack.sleep

import com.babytrack.auth.AuthenticatedUser
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
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

data class CreateSleepRequest(
    @field:NotNull val startedAt: Instant,
    @field:NotNull val endedAt: Instant,
    @field:NotNull val sleepType: SleepType,
    @field:Size(max = 2000) val note: String? = null,
)

data class UpdateSleepRequest(
    val startedAt: Instant? = null,
    val endedAt: Instant? = null,
    val sleepType: SleepType? = null,
    @field:Size(max = 2000) val note: String? = null,
)

data class SleepDto(
    val id: UUID,
    val userId: UUID,
    val sleepType: SleepType,
    val startedAt: Instant,
    val endedAt: Instant,
    val durationMinutes: Int?,
    val note: String?,
    val createdAt: Instant,
)

fun Sleep.toDto() = SleepDto(
    id = id,
    userId = userId,
    sleepType = sleepType,
    startedAt = startedAt,
    endedAt = endedAt,
    durationMinutes = durationMinutes,
    note = note,
    createdAt = createdAt,
)

@RestController
@RequestMapping("/api/sleeps")
class SleepController(private val sleepService: SleepService) {

    private fun principal(): AuthenticatedUser =
        SecurityContextHolder.getContext().authentication?.principal as? AuthenticatedUser
            ?: throw IllegalStateException("No authenticated principal")

    @PostMapping
    fun create(@Valid @RequestBody request: CreateSleepRequest): ResponseEntity<SleepDto> {
        val user = principal()
        val sleep = sleepService.create(
            userId = user.id,
            startedAt = request.startedAt,
            endedAt = request.endedAt,
            sleepType = request.sleepType,
            note = request.note,
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(sleep.toDto())
    }

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: UUID,
        @Valid @RequestBody request: UpdateSleepRequest,
    ): ResponseEntity<SleepDto> {
        val user = principal()
        val sleep = sleepService.update(
            id = id,
            requesterId = user.id,
            startedAt = request.startedAt,
            endedAt = request.endedAt,
            sleepType = request.sleepType,
            note = request.note,
        )
        return ResponseEntity.ok(sleep.toDto())
    }

    @GetMapping
    fun list(): ResponseEntity<List<SleepDto>> {
        val user = principal()
        return ResponseEntity.ok(sleepService.list(user.id).map { it.toDto() })
    }

    @GetMapping("/shared")
    fun shared(): ResponseEntity<List<SleepDto>> {
        val user = principal()
        return ResponseEntity.ok(sleepService.listShared(user.id).map { it.toDto() })
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID): ResponseEntity<Void> {
        val user = principal()
        sleepService.delete(id, user.id)
        return ResponseEntity.noContent().build()
    }
}
