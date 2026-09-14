package com.babytrack.feeding

import com.babytrack.partner.PartnerService
import com.babytrack.user.User
import com.babytrack.user.UserRepository
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.InjectMocks
import org.mockito.Mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.mockito.junit.jupiter.MockitoExtension
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
class FeedingServiceTest {

    @Mock private lateinit var feedingRepository: FeedingRepository
    @Mock private lateinit var userRepository: UserRepository
    @Mock private lateinit var partnerService: PartnerService

    @InjectMocks private lateinit var feedingService: FeedingService

    private val userId = UUID.randomUUID()
    private val partnerId = UUID.randomUUID()
    private val startedAt = Instant.parse("2026-09-14T10:00:00Z")
    private val endedAt = Instant.parse("2026-09-14T10:30:00Z") // 30 minutes

    private fun makeUser(id: UUID = userId) = User(
        id = id, googleSub = "sub-$id", email = "user-$id@test.com"
    )

    private fun makeFeeding(ownerId: UUID = userId) = Feeding(
        user = makeUser(ownerId),
        userId = ownerId,
        milkType = MilkType.BREAST,
        startedAt = startedAt,
        endedAt = endedAt,
    )

    // --- create ---

    @Test
    fun `create saves feeding with server-derived durationMinutes`() {
        `when`(userRepository.getReferenceById(userId)).thenReturn(makeUser())
        `when`(feedingRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Feeding }

        val result = feedingService.create(userId, startedAt, endedAt, MilkType.FORMULA, null, null)

        assertEquals(30, result.durationMinutes)
        assertEquals(MilkType.FORMULA, result.milkType)
        verify(feedingRepository).save(org.mockito.kotlin.any())
    }

    @Test
    fun `create throws when endedAt is before startedAt`() {
        assertThrows<IllegalArgumentException> {
            feedingService.create(userId, endedAt, startedAt, MilkType.BREAST, null, null)
        }
    }

    @Test
    fun `create stores amountMl and note when provided`() {
        `when`(userRepository.getReferenceById(userId)).thenReturn(makeUser())
        `when`(feedingRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Feeding }

        val result = feedingService.create(userId, startedAt, endedAt, MilkType.PUMPED, 120, "After bath")

        assertEquals(120, result.amountMl)
        assertEquals("After bath", result.note)
    }

    // --- update ---

    @Test
    fun `update by owner succeeds and recalculates durationMinutes`() {
        val feeding = makeFeeding(userId)
        val newEnd = endedAt.plusSeconds(1800) // +30 min → 60 min total
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(feedingRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Feeding }

        val result = feedingService.update(feeding.id, userId, null, newEnd, null, null, null)

        assertEquals(60, result.durationMinutes)
    }

    @Test
    fun `update by partner succeeds`() {
        val feeding = makeFeeding(userId)
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)
        `when`(feedingRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Feeding }

        val result = feedingService.update(feeding.id, partnerId, null, null, MilkType.FORMULA, null, null)

        assertEquals(MilkType.FORMULA, result.milkType)
    }

    @Test
    fun `update by non-partner throws FeedingNotFoundException`() {
        val feeding = makeFeeding(userId)
        val stranger = UUID.randomUUID()
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<FeedingNotFoundException> {
            feedingService.update(feeding.id, stranger, null, null, null, null, null)
        }
    }

    @Test
    fun `update throws when result would have endedAt before startedAt`() {
        val feeding = makeFeeding(userId)
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)

        assertThrows<IllegalArgumentException> {
            feedingService.update(feeding.id, userId, endedAt, startedAt, null, null, null)
        }
    }

    @Test
    fun `update on missing feeding throws FeedingNotFoundException`() {
        val id = UUID.randomUUID()
        `when`(feedingRepository.findById(id)).thenReturn(Optional.empty())

        assertThrows<FeedingNotFoundException> {
            feedingService.update(id, userId, null, null, null, null, null)
        }
    }

    // --- delete ---

    @Test
    fun `delete by owner succeeds`() {
        val feeding = makeFeeding(userId)
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)

        feedingService.delete(feeding.id, userId)

        verify(feedingRepository).delete(feeding)
    }

    @Test
    fun `delete by partner succeeds`() {
        val feeding = makeFeeding(userId)
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)

        feedingService.delete(feeding.id, partnerId)

        verify(feedingRepository).delete(feeding)
    }

    @Test
    fun `delete by non-partner throws FeedingNotFoundException`() {
        val feeding = makeFeeding(userId)
        val stranger = UUID.randomUUID()
        `when`(feedingRepository.findById(feeding.id)).thenReturn(Optional.of(feeding))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<FeedingNotFoundException> {
            feedingService.delete(feeding.id, stranger)
        }
    }

    // --- list / listShared ---

    @Test
    fun `list returns own records only`() {
        val feedings = listOf(makeFeeding(), makeFeeding())
        `when`(feedingRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)).thenReturn(feedings)

        val result = feedingService.list(userId)

        assertEquals(2, result.size)
    }

    @Test
    fun `listShared without partner returns own records`() {
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(feedingRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)).thenReturn(listOf(makeFeeding()))

        val result = feedingService.listShared(userId)

        assertEquals(1, result.size)
    }

    @Test
    fun `listShared with partner returns combined records`() {
        val combined = listOf(makeFeeding(userId), makeFeeding(partnerId))
        `when`(partnerService.getPartnerId(userId)).thenReturn(partnerId)
        `when`(feedingRepository.findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userId, partnerId)).thenReturn(combined)

        val result = feedingService.listShared(userId)

        assertEquals(2, result.size)
        assertNotNull(result.find { it.user.id == userId })
        assertNotNull(result.find { it.user.id == partnerId })
    }
}
