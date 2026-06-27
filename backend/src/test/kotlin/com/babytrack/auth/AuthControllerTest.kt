package com.babytrack.auth

import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AuthControllerTest {

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
            registry.add("app.jwt.secret") { "test-secret-minimum-32-chars-for-hs256" }
            registry.add("app.google.client-id") { "test-google-client-id" }
        }
    }

    @Autowired
    private lateinit var mockMvc: MockMvc

    @MockBean
    private lateinit var googleTokenVerifier: GoogleTokenVerifier

    @Test
    fun `valid token returns 200 with JWT and user`() {
        `when`(googleTokenVerifier.verify("valid-token")).thenReturn(
            GoogleTokenClaims(sub = "google-sub-123", email = "test@example.com", displayName = "Test User")
        )

        mockMvc.post("/api/auth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"idToken":"valid-token"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.token") { isNotEmpty() }
            jsonPath("$.user.email") { value("test@example.com") }
            jsonPath("$.user.displayName") { value("Test User") }
        }
    }

    @Test
    fun `invalid token returns 401 Problem Details`() {
        `when`(googleTokenVerifier.verify("bad-token"))
            .thenThrow(InvalidGoogleTokenException("Token is invalid"))

        mockMvc.post("/api/auth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"idToken":"bad-token"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.status") { value(401) }
            jsonPath("$.title") { value("Invalid Google Token") }
        }
    }
}
