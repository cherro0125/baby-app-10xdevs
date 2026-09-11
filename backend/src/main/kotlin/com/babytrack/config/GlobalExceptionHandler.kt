package com.babytrack.config

import com.babytrack.auth.InvalidGoogleTokenException
import com.babytrack.auth.InvalidJwtException
import com.babytrack.contraction.ContractionNotFoundException
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
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
}
