package com.babytrack.sleep

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
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
class SleepServiceTest {

    @Mock private lateinit var sleepRepository: SleepRepository
    @Mock private lateinit var userRepository: UserRepository
    @Mock private lateinit var partnerService: PartnerService

    @InjectMocks private lateinit var sleepService: SleepService

    private val userId = UUID.randomUUID()
    private val partnerId = UUID.randomUUID()
    private val startedAt = Instant.parse("2026-09-14T22:00:00Z")
    private val endedAt = Instant.parse("2026-09-14T23:30:00Z") // 90 minutes

    private fun makeUser(id: UUID = userId) = User(
        id = id, googleSub = "sub-$id", email = "user-$id@test.com"
    )

    private fun makeSleep(ownerId: UUID = userId) = Sleep(
        user = makeUser(ownerId),
        userId = ownerId,
        sleepType = SleepType.NAP,
        startedAt = startedAt,
        endedAt = endedAt,
    )

    // --- create ---

    @Test
    fun `create saves sleep with server-derived durationMinutes`() {
        val user = makeUser()
        `when`(userRepository.getReferenceById(userId)).thenReturn(user)
        `when`(sleepRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.create(userId, startedAt, endedAt, SleepType.NIGHT, null)

        assertEquals(90, result.durationMinutes)
        assertEquals(SleepType.NIGHT, result.sleepType)
        verify(sleepRepository).save(org.mockito.kotlin.any())
    }

    @Test
    fun `create returns the requester as userId`() {
        `when`(userRepository.getReferenceById(userId)).thenReturn(makeUser())
        `when`(sleepRepository.save(any<Sleep>())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.create(userId, startedAt, endedAt, SleepType.NAP, null)

        assertEquals(userId, result.userId)
    }

    @Test
    fun `create throws when endedAt is before startedAt`() {
        assertThrows<IllegalArgumentException> {
            sleepService.create(userId, endedAt, startedAt, SleepType.NAP, null)
        }
    }

    @Test
    fun `create stores note when provided`() {
        `when`(userRepository.getReferenceById(userId)).thenReturn(makeUser())
        `when`(sleepRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.create(userId, startedAt, endedAt, SleepType.NAP, "Napped well")

        assertEquals("Napped well", result.note)
    }

    // --- update ---

    @Test
    fun `update by owner succeeds and recalculates durationMinutes`() {
        val sleep = makeSleep(userId)
        val newEnd = endedAt.plusSeconds(1800) // +30 min → 120 min total
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(sleepRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.update(sleep.id, userId, null, newEnd, null, null)

        assertEquals(120, result.durationMinutes)
    }

    @Test
    fun `update by partner succeeds`() {
        val sleep = makeSleep(userId)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)
        `when`(sleepRepository.save(org.mockito.kotlin.any())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.update(sleep.id, partnerId, null, null, SleepType.NIGHT, null)

        assertEquals(SleepType.NIGHT, result.sleepType)
    }

    @Test
    fun `update by non-partner throws SleepNotFoundException`() {
        val sleep = makeSleep(userId)
        val stranger = UUID.randomUUID()
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<SleepNotFoundException> {
            sleepService.update(sleep.id, stranger, null, null, null, null)
        }
    }

    @Test
    fun `update throws when result would have endedAt before startedAt`() {
        val sleep = makeSleep(userId)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)

        assertThrows<IllegalArgumentException> {
            sleepService.update(sleep.id, userId, endedAt, startedAt, null, null)
        }
    }

    @Test
    fun `update on missing sleep throws SleepNotFoundException`() {
        val id = UUID.randomUUID()
        `when`(sleepRepository.findById(id)).thenReturn(Optional.empty())

        assertThrows<SleepNotFoundException> {
            sleepService.update(id, userId, null, null, null, null)
        }
    }

    // --- upsert ---

    private fun stubInsertIfAbsent(result: Int) {
        `when`(
            sleepRepository.insertIfAbsent(any(), any(), any(), any(), any(), any(), anyOrNull(), any()),
        ).thenReturn(result)
    }

    @Test
    fun `upsert on unknown id inserts it with client id, requester as owner and derived duration`() {
        val id = UUID.randomUUID()
        stubInsertIfAbsent(1)
        `when`(sleepRepository.findById(id)).thenReturn(Optional.of(makeSleep(userId)))

        val result = sleepService.upsert(id, userId, startedAt, endedAt, SleepType.NIGHT, "Night")

        assertEquals(true, result.created)
        verify(sleepRepository).insertIfAbsent(
            eq(id), eq(userId), eq("NIGHT"), eq(startedAt), eq(endedAt), eq(90), eq("Night"), any(),
        )
        verify(partnerService, never()).getPartnerId(any())
    }

    @Test
    fun `upsert by owner replaces all fields and clears the note`() {
        val sleep = makeSleep(userId).apply { note = "Before" }
        val newEnd = endedAt.plusSeconds(1800) // 120 min total
        stubInsertIfAbsent(0)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(sleepRepository.save(any<Sleep>())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.upsert(sleep.id, userId, startedAt, newEnd, SleepType.OTHER, null)

        assertEquals(false, result.created)
        assertEquals(SleepType.OTHER, result.sleep.sleepType)
        assertEquals(120, result.sleep.durationMinutes)
        assertNull(result.sleep.note)
    }

    @Test
    fun `upsert by partner succeeds and keeps the original owner`() {
        val sleep = makeSleep(userId)
        stubInsertIfAbsent(0)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)
        `when`(sleepRepository.save(any<Sleep>())).thenAnswer { it.arguments[0] as Sleep }

        val result = sleepService.upsert(sleep.id, partnerId, startedAt, endedAt, SleepType.NIGHT, "Partner")

        assertEquals(false, result.created)
        assertEquals(userId, result.sleep.userId)
        assertEquals("Partner", result.sleep.note)
    }

    @Test
    fun `upsert by non-partner on existing id throws SleepNotFoundException`() {
        val sleep = makeSleep(userId)
        val stranger = UUID.randomUUID()
        stubInsertIfAbsent(0)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<SleepNotFoundException> {
            sleepService.upsert(sleep.id, stranger, startedAt, endedAt, SleepType.NAP, null)
        }
        verify(sleepRepository, never()).save(any<Sleep>())
    }

    @Test
    fun `upsert with allowCreate false on unknown id throws SleepNotFoundException and inserts nothing`() {
        val id = UUID.randomUUID()
        `when`(sleepRepository.findById(id)).thenReturn(Optional.empty())

        assertThrows<SleepNotFoundException> {
            sleepService.upsert(id, partnerId, startedAt, endedAt, SleepType.NAP, null, allowCreate = false)
        }
        verify(sleepRepository, never()).insertIfAbsent(any(), any(), any(), any(), any(), any(), anyOrNull(), any())
        verify(sleepRepository, never()).save(any<Sleep>())
    }

    @Test
    fun `upsert throws when endedAt is not after startedAt`() {
        assertThrows<IllegalArgumentException> {
            sleepService.upsert(UUID.randomUUID(), userId, startedAt, startedAt, SleepType.NAP, null)
        }
    }

    // --- delete ---

    @Test
    fun `delete by owner succeeds`() {
        val sleep = makeSleep(userId)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)

        sleepService.delete(sleep.id, userId)

        verify(sleepRepository).delete(sleep)
    }

    @Test
    fun `delete by partner succeeds`() {
        val sleep = makeSleep(userId)
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(partnerId)).thenReturn(userId)

        sleepService.delete(sleep.id, partnerId)

        verify(sleepRepository).delete(sleep)
    }

    @Test
    fun `delete by non-partner throws SleepNotFoundException`() {
        val sleep = makeSleep(userId)
        val stranger = UUID.randomUUID()
        `when`(sleepRepository.findById(sleep.id)).thenReturn(Optional.of(sleep))
        `when`(partnerService.getPartnerId(stranger)).thenReturn(null)

        assertThrows<SleepNotFoundException> {
            sleepService.delete(sleep.id, stranger)
        }
    }

    // --- list / listShared ---

    @Test
    fun `list returns own records only`() {
        val sleeps = listOf(makeSleep(), makeSleep())
        `when`(sleepRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)).thenReturn(sleeps)

        val result = sleepService.list(userId)

        assertEquals(2, result.size)
    }

    @Test
    fun `listShared without partner returns own records`() {
        `when`(partnerService.getPartnerId(userId)).thenReturn(null)
        `when`(sleepRepository.findTop200ByUserIdOrderByStartedAtDesc(userId)).thenReturn(listOf(makeSleep()))

        val result = sleepService.listShared(userId)

        assertEquals(1, result.size)
    }

    @Test
    fun `listShared with partner returns combined records`() {
        val combined = listOf(makeSleep(userId), makeSleep(partnerId))
        `when`(partnerService.getPartnerId(userId)).thenReturn(partnerId)
        `when`(sleepRepository.findTop200ByUserIdOrUserIdOrderByStartedAtDesc(userId, partnerId)).thenReturn(combined)

        val result = sleepService.listShared(userId)

        assertEquals(2, result.size)
        assertNotNull(result.find { it.user.id == userId })
        assertNotNull(result.find { it.user.id == partnerId })
    }
}
