package com.babytrack.sleep

import com.babytrack.user.User
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

enum class SleepType { NAP, NIGHT, OTHER }

@Entity
@Table(name = "sleeps")
class Sleep(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    val user: User,

    @Column(name = "user_id", insertable = false, updatable = false)
    val userId: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "sleep_type", nullable = false)
    var sleepType: SleepType,

    @Column(name = "started_at", nullable = false)
    var startedAt: Instant,

    @Column(name = "ended_at", nullable = false)
    var endedAt: Instant,

    @Column(name = "duration_minutes")
    var durationMinutes: Int? = null,

    @Column
    var note: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
