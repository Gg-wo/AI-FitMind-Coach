package com.example.myapplication

// PromptMapper, clean tags
object PromptMapper {
    private const val TURN_START = "<|turn|>"
    private const val TURN_END = "<turn|>"


    //change history to Gemma 4 Prompt
    fun mapToGemma4Prompt(history: List<ChatMessage>, newUserInput: String): String {
        val sb = StringBuilder()

        // 1. append history
        history.takeLast(10).forEach { msg ->
            // trim()
            val cleanContent = msg.content.trim()
            if (cleanContent.isNotEmpty()) {
                sb.append(TURN_START).append(msg.role).append("\n")
                sb.append(cleanContent).append(TURN_END).append("\n")
            }
        }

        // 2. append user input
        sb.append(TURN_START).append("user\n").append(newUserInput).append(TURN_END).append("\n")

        // 3. append model turn
        sb.append(TURN_START).append("model\n")

        return sb.toString()
    }

    fun cleanResponse(text: String): String {
        return text
//            .replace("<|turn|>", "")
//            .replace("<turn|>", "")
//            .replace("<|think|>", "\n[Thinking...]\n") // for thinking mode, [Thinking...]
//            .replace("<|channel|>", "")
//            .replace("model\n", "")
//            .replace("user\n", "")
    }
}