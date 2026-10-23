package com.babytrack

import com.babytrack.contraction.ContractionRepository
import com.babytrack.feeding.FeedingRepository
import com.babytrack.feeding.MilkType
import com.babytrack.sleep.SleepRepository
import com.babytrack.sleep.SleepType
import com.babytrack.user.User
import com.babytrack.user.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.Instant
import java.util.UUID

/**
 * The native `insertIfAbsent` upserts against the real Flyway schema: column lists, null binding of
 * optional fields, ON CONFLICT and CHECK constraints are invisible to the Mockito service tests.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class InsertIfAbsentRepositoryTest {

    companion object {
        @Container
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:15-alpine")
            .withDatabaseName("babytrack")
            .withUsername("babytrack")
            .withPassword("babytrack")

        @DynamicPropertySource
        @JvmStatic
        fun registerProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }

    @Autowired private lateinit var userRepository: UserRepository
    @Autowired private lateinit var feedingRepository: FeedingRepository
    @Autowired private lateinit var sleepRepository: SleepRepository
    @Autowired private lateinit var contractionRepository: ContractionRepository

    private lateinit var userId: UUID
    private val startedAt = Instant.parse("2026-10-23T10:00:00Z")
    private val endedAt = Instant.parse("2026-10-23T10:30:00Z")
    private val now = Instant.parse("2026-10-23T10:31:00Z")

    @BeforeEach
    fun createUser() {
        userId = userRepository.save(User(googleSub = "sub-${UUID.randomUUID()}", email = "insert@test.com")).id
    }

    @Test
    fun `feeding insertIfAbsent inserts once with null optional fields`() {
        val id = UUID.randomUUID()

        val first = feedingRepository.insertIfAbsent(id, userId, MilkType.BREAST.name, startedAt, endedAt, 30, null, null, now)
        val second = feedingRepository.insertIfAbsent(id, userId, MilkType.FORMULA.name, startedAt, endedAt, 30, 90, "x", now)

        assertEquals(1, first)
        assertEquals(0, second)
        val stored = feedingRepository.findById(id).orElseThrow()
        assertEquals(userId, stored.userId)
        assertEquals(MilkType.BREAST, stored.milkType)
        assertNull(stored.amountMl)
        assertNull(stored.note)
    }

    @Test
    fun `sleep insertIfAbsent inserts once with a null note`() {
        val id = UUID.randomUUID()

        val first = sleepRepository.insertIfAbsent(id, userId, SleepType.NIGHT.name, startedAt, endedAt, 30, null, now)
        val second = sleepRepository.insertIfAbsent(id, userId, SleepType.NAP.name, startedAt, endedAt, 30, "x", now)

        assertEquals(1, first)
        assertEquals(0, second)
        val stored = sleepRepository.findById(id).orElseThrow()
        assertEquals(userId, stored.userId)
        assertEquals(SleepType.NIGHT, stored.sleepType)
        assertEquals(30, stored.durationMinutes)
        assertNull(stored.note)
    }

    @Test
    fun `sleep insertIfAbsent rejects an unknown sleep type via the CHECK constraint`() {
        assertThrows<DataIntegrityViolationException> {
            sleepRepository.insertIfAbsent(UUID.randomUUID(), userId, "SIESTA", startedAt, endedAt, 30, null, now)
        }
    }

    @Test
    fun `contraction insertIfAbsent inserts once with null strength and note`() {
        val id = UUID.randomUUID()

        val first = contractionRepository.insertIfAbsent(id, userId, startedAt, endedAt, 1800, null, null, now)
        val second = contractionRepository.insertIfAbsent(id, userId, startedAt, endedAt, 1800, 5, "x", now)

        assertEquals(1, first)
        assertEquals(0, second)
        val stored = contractionRepository.findById(id).orElseThrow()
        assertEquals(userId, stored.userId)
        assertEquals(endedAt, stored.endedAt)
        assertEquals(1800, stored.durationSeconds)
        assertNull(stored.strength)
        assertNull(stored.note)
    }
}
