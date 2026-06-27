package com.babytrack

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class BabyTrackApplication

fun main(args: Array<String>) {
    runApplication<BabyTrackApplication>(*args)
}
