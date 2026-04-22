package com.example.myapplication

import java.util.UUID

data class UiChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: String,          // "user" / "assistant" / "system"
    val answer: String = "",
    val thinking: String? = null,
    val isThinkingExpanded: Boolean = false,
)
