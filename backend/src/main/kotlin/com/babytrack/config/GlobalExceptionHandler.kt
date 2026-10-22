package com.babytrack.config

import com.babytrack.auth.InvalidGoogleTokenException
import com.babytrack.auth.InvalidJwtException
import com.babytrack.contraction.ContractionNotFoundException
import com.babytrack.feeding.FeedingNotFoundException
import com.babytrack.sleep.SleepNotFoundException
import com.babytrack.partner.AlreadyLinkedException
import com.babytrack.partner.PartnerInviteExpiredException
import com.babytrack.partner.PartnerInviteNotFoundException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.orm.jpa.JpaObjectRetrievalFailureException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import java.net.URI

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(InvalidGoogleTokenException::class)
    fun handleInvalidGoogleToken(ex: InvalidGoogleTokenException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED).apply {
            type = URI.create("urn:babytrack:error:invalid-google-token")
            title = "Invalid Google Token"
            detail = ex.message
        }

    @ExceptionHandler(InvalidJwtException::class)
    fun handleInvalidJwt(ex: InvalidJwtException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED).apply {
            type = URI.create("urn:babytrack:error:invalid-jwt")
            title = "Invalid JWT"
            detail = ex.message
        }

    @ExceptionHandler(ContractionNotFoundException::class)
    fun handleContractionNotFound(ex: ContractionNotFoundException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.NOT_FOUND).apply {
            type = URI.create("urn:babytrack:error:contraction-not-found")
            title = "Contraction Not Found"
            detail = ex.message
        }

    @ExceptionHandler(FeedingNotFoundException::class)
    fun handleFeedingNotFound(ex: FeedingNotFoundException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.NOT_FOUND).apply {
            type = URI.create("urn:babytrack:error:feeding-not-found")
            title = "Feeding Not Found"
            detail = ex.message
        }

    @ExceptionHandler(SleepNotFoundException::class)
    fun handleSleepNotFound(ex: SleepNotFoundException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.NOT_FOUND).apply {
            type = URI.create("urn:babytrack:error:sleep-not-found")
            title = "Sleep Not Found"
            detail = ex.message
        }

    @ExceptionHandler(PartnerInviteNotFoundException::class)
    fun handlePartnerInviteNotFound(ex: PartnerInviteNotFoundException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.NOT_FOUND).apply {
            type = URI.create("urn:babytrack:error:invite-not-found")
            title = "Invite Not Found"
            detail = ex.message
        }

    @ExceptionHandler(PartnerInviteExpiredException::class)
    fun handlePartnerInviteExpired(ex: PartnerInviteExpiredException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.GONE).apply {
            type = URI.create("urn:babytrack:error:invite-expired")
            title = "Invite Expired"
            detail = ex.message
        }

    @ExceptionHandler(AlreadyLinkedException::class)
    fun handleAlreadyLinked(ex: AlreadyLinkedException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.CONFLICT).apply {
            type = URI.create("urn:babytrack:error:already-linked")
            title = "Already Linked"
            detail = ex.message
        }

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleIllegalArgument(ex: IllegalArgumentException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.BAD_REQUEST).apply {
            type = URI.create("urn:babytrack:error:invalid-argument")
            title = "Invalid Argument"
            detail = ex.message
        }

    // Without these, malformed bodies (missing/unparseable fields), @Valid failures and
    // unparseable path/query values (non-UUID id, ?create=foo) would fall through to
    // handleGeneric and surface as 500.
    @ExceptionHandler(
        HttpMessageNotReadableException::class,
        MethodArgumentNotValidException::class,
        MethodArgumentTypeMismatchException::class,
    )
    fun handleInvalidRequest(ex: Exception): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.BAD_REQUEST).apply {
            type = URI.create("urn:babytrack:error:invalid-request")
            title = "Invalid Request"
            detail = "The request is missing required fields or contains invalid values"
        }

    @ExceptionHandler(IllegalStateException::class)
    fun handleIllegalState(ex: IllegalStateException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR).apply {
            type = URI.create("urn:babytrack:error:internal")
            title = "Internal Server Error"
            detail = "An unexpected error occurred"
        }

    @ExceptionHandler(JpaObjectRetrievalFailureException::class)
    fun handleJpaObjectNotFound(ex: JpaObjectRetrievalFailureException): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.NOT_FOUND).apply {
            type = URI.create("urn:babytrack:error:user-not-found")
            title = "User Not Found"
            detail = "The authenticated user no longer exists"
        }

    @ExceptionHandler(Exception::class)
    fun handleGeneric(ex: Exception): ProblemDetail =
        ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR).apply {
            type = URI.create("urn:babytrack:error:internal")
            title = "Internal Server Error"
            detail = "An unexpected error occurred"
        }
}
