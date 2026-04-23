package com.example.myapplication

object PromptMapper {
    /**
     * Build a Gemma prompt from chat history.
     *
     * When [enableThinking] is true, seed the model turn with the thought channel token,
     * otherwise start directly with a plain model turn.
     */
    fun mapToGemma4Prompt(
        history: List<ChatMessage>,
        newUserInput: String,
        enableThinking: Boolean = false
    ): String {
        val sb = StringBuilder()

        history.takeLast(10).forEach { msg ->
            val cleanContent = msg.content.trim()
            if (cleanContent.isNotEmpty()) {
                sb.append(LocalModelTokens.TURN_START).append(msg.role).append("\n")
                sb.append(cleanContent).append(LocalModelTokens.TURN_END)
            }
        }

        sb.append(LocalModelTokens.TURN_USER)
            .append(newUserInput)
            .append(LocalModelTokens.TURN_END)

        sb.append(LocalModelTokens.TURN_MODEL)
        if (enableThinking) {
            sb.append(LocalModelTokens.THINK_CHANNEL)
        }

        return sb.toString()
    }

    fun cleanResponse(text: String): String = text
}