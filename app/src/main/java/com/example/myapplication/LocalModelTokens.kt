package com.example.myapplication

object LocalModelTokens {
    // ====================== turn ======================
    const val TURN_START = "<|turn>"
    const val TURN_END = "<turn|>\\n"
    const val TURN_SYSTEM = "<|turn>system\\n"
    const val TURN_USER = "<|turn>user\\n"
    const val TURN_MODEL = "<|turn>model\\n"

    // ====================== think ======================
    const val THINK_TRIGGER = "<|think|>"
    const val CHANNEL_START = "<|channel>"
    const val CHANNEL_END = "<channel|>"
    const val THINK_CHANNEL = "<|channel>thought"

    // ======================  tool, not support ======================
    const val TOOL_DEFINE_START = "<|tool>"
    const val TOOL_DEFINE_END = "<tool|>"
    const val TOOL_CALL_START = "<|tool_call>"
    const val TOOL_CALL_END = "<tool_call|>"
    const val TOOL_RESPONSE_START = "<|tool_response>"
    const val TOOL_RESPONSE_END = "<tool_response|>"

    // ====================== Multi-modalities, not support ======================
    const val IMAGE_START = "<|image>"
    const val IMAGE_END = "<image|>"
    const val IMAGE_PLACEHOLDER = "<|image|>"

    const val AUDIO_START = "<|audio>"
    const val AUDIO_END = "<audio|>"
    const val AUDIO_PLACEHOLDER = "<|audio|>"
}
