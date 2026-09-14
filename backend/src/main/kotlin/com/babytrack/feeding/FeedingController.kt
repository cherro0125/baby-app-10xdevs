package com.babytrack.feeding

import com.babytrack.auth.AuthenticatedUser
import jakarta.validation.Valid
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Positive
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

data class CreateFeedingRequest(
    @field:NotNull val startedAt: Instant,
    @field:NotNull val endedAt: Instant,
    @field:NotNull val milkType: MilkType,
    @field:Positive val amountMl: Int? = null,
    @field:Size(max = 2000) val note: String? = null,
)

data class UpdateFeedingRequest(
    val startedAt: Instant? = null,
    val endedAt: Instant? = null,
    val milkType: MilkType? = null,
    @field:Positive val amountMl: Int? = null,
    @field:Size(max = 2000) val note: String? = null,
)

data class FeedingDto(
    val id: UUID,
    val userId: UUID,
    val milkType: MilkType,
    val startedAt: Instant,
    val endedAt: Instant,
    val durationMinutes: Int?,
    val amountMl: Int?,
    val note: String?,
    val createdAt: Instant,
)

fun Feeding.toDto() = FeedingDto(
    id = id,
    userId = userId,
    milkType = milkType,
    startedAt = startedAt,
    endedAt = endedAt,
    durationMinutes = durationMinutes,
    amountMl = amountMl,
    note = note,
    createdAt = createdAt,
)

@RestController
@RequestMapping("/api/feedings")
class FeedingController(private val feedingService: FeedingService) {

    private fun principal(): AuthenticatedUser =
        SecurityContextHolder.getContext().authentication?.principal as? AuthenticatedUser
            ?: throw IllegalStateException("No authenticated principal")

    @PostMapping
    fun create(@Valid @RequestBody request: CreateFeedingRequest): ResponseEntity<FeedingDto> {
        val user = principal()
        val feeding = feedingService.create(
            userId = user.id,
            startedAt = request.startedAt,
            endedAt = request.endedAt,
            milkType = request.milkType,
            amountMl = request.amountMl,
            note = request.note,
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(feeding.toDto())
    }

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: UUID,
        @Valid @RequestBody request: UpdateFeedingRequest,
    ): ResponseEntity<FeedingDto> {
        val user = principal()
        val feeding = feedingService.update(
            id = id,
            requesterId = user.id,
            startedAt = request.startedAt,
            endedAt = request.endedAt,
            milkType = request.milkType,
            amountMl = request.amountMl,
            note = request.note,
        )
        return ResponseEntity.ok(feeding.toDto())
    }

    @GetMapping
    fun list(): ResponseEntity<List<FeedingDto>> {
        val user = principal()
        return ResponseEntity.ok(feedingService.list(user.id).map { it.toDto() })
    }

    @GetMapping("/shared")
    fun shared(): ResponseEntity<List<FeedingDto>> {
        val user = principal()
        return ResponseEntity.ok(feedingService.listShared(user.id).map { it.toDto() })
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID): ResponseEntity<Void> {
        val user = principal()
        feedingService.delete(id, user.id)
        return ResponseEntity.noContent().build()
    }
}
