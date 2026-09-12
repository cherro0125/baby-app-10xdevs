package com.babytrack.contraction

import com.babytrack.user.User
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "contractions")
class Contraction(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    val user: User,

    @Column(name = "user_id", insertable = false, updatable = false)
    val userId: UUID = UUID.randomUUID(),

    @Column(name = "started_at", nullable = false)
    var startedAt: Instant,

    @Column(name = "ended_at")
    var endedAt: Instant? = null,

    @Column(name = "duration_seconds")
    var durationSeconds: Int? = null,

    @Column
    var strength: Int? = null,

    @Column
    var note: String? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
