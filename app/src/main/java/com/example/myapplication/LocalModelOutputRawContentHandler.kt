package com.example.myapplication

object LocalModelOutputRawContentHandler {

    private fun normalize(raw: String): String = raw.replace("\r\n", "\n")

    fun sanitizeThinkingContent(rawThinking: String?): String? {
        if (rawThinking.isNullOrBlank()) return null
        val cleaned = normalize(rawThinking)
            .removePrefix(LocalModelTokens.THINK_CHANNEL)
            .removePrefix(LocalModelTokens.CHANNEL_START)
            .replace(LocalModelTokens.TURN_END, "")
            .trim()
        return cleaned.takeIf { it.isNotBlank() }
    }

    fun sanitizeAssistantHistoryContent(rawAssistantContent: String): String {
        var cleaned = normalize(rawAssistantContent).trim()

        if (cleaned.contains(LocalModelTokens.CHANNEL_END)) {
            cleaned = cleaned.substringAfter(LocalModelTokens.CHANNEL_END)
        }

        cleaned = cleaned
            .removePrefix(LocalModelTokens.THINK_CHANNEL)
            .removePrefix(LocalModelTokens.CHANNEL_START)
            .replace(LocalModelTokens.TURN_END, "")
            .replace(LocalModelTokens.TURN_MODEL, "")
            .replace(LocalModelTokens.TURN_USER, "")
            .replace(LocalModelTokens.TURN_SYSTEM, "")
            .trim()

        return cleaned
    }

    // Sanity check: raw_output should never contain turn headers.
    // If it does, the model started hallucinating a new prompt — treat as error.
    fun validateRawOutput(raw: String): Boolean {
        return !raw.contains(LocalModelTokens.TURN_SYSTEM) &&
                !raw.contains(LocalModelTokens.TURN_USER)
    }

    // Extract thinking content (text before <channel|>)
    fun extractOutputThinkingContent(raw: String): String? {
        val normalizedRaw = normalize(raw)
        val channelEndIdx = normalizedRaw.indexOf(LocalModelTokens.CHANNEL_END)
            .takeIf { it != -1 } ?: return null

        val thinking = normalizedRaw.substring(0, channelEndIdx)
        return sanitizeThinkingContent(thinking)
    }

    // Extract clean answer (text after <channel|>, strip any trailing <turn|>)
    fun extractOutputCleanContent(raw: String): String {
        val normalizedRaw = normalize(raw)
        val candidate = normalizedRaw.substringAfter(LocalModelTokens.CHANNEL_END, normalizedRaw)
        return sanitizeAssistantHistoryContent(candidate)
    }
}