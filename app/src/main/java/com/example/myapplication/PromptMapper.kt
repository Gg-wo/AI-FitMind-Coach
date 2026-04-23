package com.example.myapplication

import com.example.myapplication.LocalModelTokens.THINK_CHANNEL
import com.example.myapplication.LocalModelTokens.THINK_TRIGGER
import com.example.myapplication.LocalModelTokens.TURN_END
import com.example.myapplication.LocalModelTokens.TURN_MODEL
import com.example.myapplication.LocalModelTokens.TURN_START
import com.example.myapplication.LocalModelTokens.TURN_USER

// PromptMapper, clean tags
object PromptMapper {

    private const val MAX_HISTORY_TURNS = 10

    /**
     * Build a Gemma 4 prompt from chat history.
     *
     * @param enableThinking  When true:
     *   - Inserts <|think|> immediately after "<|turn>system\n" (before system content)
     *   - Appends <|channel>thought at the end of the model turn prefix to seed thinking
     *
     * Sample when enableThinking = true:
     *   <|turn>system\n<|think|>You are a helpful ai fitness coach.<turn|>\n
     *   <|turn>user\nHello<turn|>\n
     *   <|turn>model\n<|channel>thought
     */
    fun mapToGemma4Prompt(
        history: List<ChatMessage>,
        newUserInput: String,
        enableThinking: Boolean = false
    ): String {
        val sb = StringBuilder()

        val systemMessage = history.firstOrNull { it.role == "system" }
        val recentMessages = history
            .filterNot { it.role == "system" }
            .takeLast(MAX_HISTORY_TURNS)

        // 1. append system turn first so it never falls out of the prompt window
        systemMessage?.let { msg ->
            val cleanContent = msg.content.trim()
            if (cleanContent.isNotEmpty()) {
                sb.append(TURN_START).append(msg.role).append("\n")
                if (enableThinking) {
                    sb.append(THINK_TRIGGER)
                }
                sb.append(cleanContent).append(TURN_END)
            }
        }

        // 2. append recent non-system history, sanitizing assistant turns defensively
        recentMessages.forEach { msg ->
            val cleanContent = when (msg.role) {
                "model" -> LocalModelOutputRawContentHandler.sanitizeAssistantHistoryContent(msg.content)
                else -> msg.content.trim()
            }
            if (cleanContent.isNotEmpty()) {
                sb.append(TURN_START).append(msg.role).append("\n")
                sb.append(cleanContent).append(TURN_END)
            }
        }

        // 3. append user input
        sb.append(TURN_USER).append(newUserInput).append(TURN_END)

        // 4. append model turn prefix; seed thinking channel if enabled
        sb.append(TURN_MODEL)
        if (enableThinking) {
            sb.append(THINK_CHANNEL)  // "<|channel>thought" – model output starts inside thinking
        }

        return sb.toString()
    }
}