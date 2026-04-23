package com.example.myapplication

/**
 *
 * @param role: "system", "user", or "model"
 * @param content: message text
 */
data class ChatMessage(
    val role: String,
    val content: String
)
