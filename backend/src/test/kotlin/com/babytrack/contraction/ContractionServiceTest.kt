package com.babytrack.contraction

import com.babytrack.partner.PartnerService
import com.babytrack.user.User
import com.babytrack.user.UserRepository
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.InjectMocks
import org.mockito.Mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
class ContractionServiceTest {

    @Mock private lateinit var contractionRepository: ContractionRepository
    @Mock private lateinit var userRepository: UserRepository
    @Mock private lateinit var partnerService: PartnerService

    @InjectMocks private lateinit var contractionService: ContractionService

    private val userId = UUID.randomUUID()
    private val partnerId = UUID.randomUUID()
    private val startedAt = Instant.parse("2026-10-23T10:00:00Z")
    private val endedAt = Instant.parse("2026-10-23T10:01:05Z") // 65 seconds

    private fun makeUser(id: UUID = userId) = User(
        id = id, googleSub = "sub-$id", email = "user-$id@test.com"
    )

    private fun makeContraction(ownerId: UUID = userId) = Contraction(
        user = makeUser(ownerId),
        userId = ownerId,
        startedAt = startedAt,
        endedAt = endedAt,
        durationSeconds = 65,
    )

    private fun stubInsertIfAbsent(result: Int) {
        `when`(
            contractionRepository.insertIfAbsent(any(), any(), any(), any(), any(), anyOrNull(), anyOrNull(), any()),
        ).thenReturn(result)
    }

    // --- start ---

    @Test
    fun `start returns the requester as userId`() {
        `when`(userRepository.getReferenceById(userId)).thenReturn(makeUser())
        `when`(contractionRepository.save(any<Contraction>())).thenAnswer { it.arguments[0] as Contraction }

        val result = contractionService.start(userId, startedAt)

        assertEquals(userId, result.userId)
    }

    // --- upsert ---

    @Test
    fun `upsert on unknown id inserts it with client id, requester as owner and derived duration`() {
        val id = UUID.randomUUID()
        stubInsertIfAbsent(1)
        `when`(contractionRepository.findById(id)).thenReturn(Optional.of(makeContraction(userId)))

        val result = contractionService.upsert(id, userId, startedAt, endedAt, 7, "Strong")

        assertEquals(true, result.created)
        verify(contractionRepository).insertIfAbsent(
            eq(id), eq(userId), eq(startedAt), eq(endedAt), eq(65), eq(7), eq("Strong"), any(),
        )
        verify(partnerService, never()).getPartnerId(any())
    }

    @Test
    fun `upsert by owner replaces all fields and clears strength and note`() {
        val contraction = makeContraction(userId).apply {
            strength = 5
            note = "Before"
        }
        val newEnd = endedAt.plusSeconds(25) // 90 s total
        stubInsertIfAbsent(0)
        `when`(contractionRepository.findById(contraction.id)).thenReturn(Optional.of(contraction))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(contractionRepository.save(any<Contraction>())).thenAnswer { it.arguments[0] as Contraction }

        val result = contractionService.upsert(contraction.id, userId, startedAt, newEnd, null, null)

        assertEquals(false, result.created)
        assertEquals(90, result.contraction.durationSeconds)
        assertEquals(newEnd, result.contraction.endedAt)
        assertNull(result.contraction.strength)
        assertNull(result.contraction.note)
    }

    @Test
    fun `upsert by partner succeeds and keeps the original owner`() {
        val contraction = makeContraction(userId)
        stubInsertIfAbsent(0)
        `when`(contractionRepository.findById(contraction.id)).thenReturn(Optional.of(contraction))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)
        `when`(contractionRepository.save(any<Contraction>())).thenAnswer { it.arguments[0] as Contraction }

        val result = contractionService.upsert(contraction.id, partnerId, startedAt, endedAt, 3, "Partner")

        assertEquals(false, result.created)
        assertEquals(userId, result.contraction.userId)
        assertEquals(3, result.contraction.strength)
        assertEquals("Partner", result.contraction.note)
    }

    @Test
    fun `upsert by non-partner on existing id throws ContractionNotFoundException`() {
        val contraction = makeContraction(userId)
        val stranger = UUID.randomUUID()
        stubInsertIfAbsent(0)
        `when`(contractionRepository.findById(contraction.id)).thenReturn(Optional.of(contraction))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<ContractionNotFoundException> {
            contractionService.upsert(contraction.id, stranger, startedAt, endedAt, null, null)
        }
        verify(contractionRepository, never()).save(any<Contraction>())
    }

    @Test
    fun `upsert with allowCreate false on unknown id throws ContractionNotFoundException and inserts nothing`() {
        val id = UUID.randomUUID()
        `when`(contractionRepository.findById(id)).thenReturn(Optional.empty())

        assertThrows<ContractionNotFoundException> {
            contractionService.upsert(id, partnerId, startedAt, endedAt, null, null, allowCreate = false)
        }
        verify(contractionRepository, never()).insertIfAbsent(
            any(), any(), any(), any(), any(), anyOrNull(), anyOrNull(), any(),
        )
        verify(contractionRepository, never()).save(any<Contraction>())
    }

    @Test
    fun `upsert throws when endedAt is not after startedAt`() {
        assertThrows<IllegalArgumentException> {
            contractionService.upsert(UUID.randomUUID(), userId, startedAt, startedAt, null, null)
        }
    }
}
