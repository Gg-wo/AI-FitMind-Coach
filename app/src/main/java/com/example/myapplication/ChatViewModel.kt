/*
This is a modified version of the original native compose code of the testing project;
So both logic for native and webview code exits
*/
package com.example.myapplication

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

class ChatViewModel : ViewModel() {
    private var isInitialized = false
    private val isWebGenerating = AtomicBoolean(false)
    private val tokenUiThrottleMs = 100L

    private val messageHistory = mutableListOf<ChatMessage>(
        ChatMessage("system", "You are a helpful ai fitness coach.")
    )

    var inputText by mutableStateOf("")
        private set

    var isModelLoading by mutableStateOf(false)
        private set

    var messages by mutableStateOf(listOf<UiChatMessage>())
        private set

    private var engine: InferenceEngine? = null

    fun isReady(): Boolean = isInitialized && engine != null && !isModelLoading


    fun initializeModel(context: Context, modelPath: String) {
        if (isInitialized) return
        viewModelScope.launch(Dispatchers.IO) {
            try {
                isModelLoading = true

                val inferenceEngine = AiChat.getInferenceEngine(context)
                engine = inferenceEngine

                inferenceEngine.loadModel(modelPath)

                inferenceEngine.setSystemPrompt("You are a helpful ai coach.")

                withContext(Dispatchers.Main) {
                    addMessage(UiChatMessage(role = "system", answer = "Model initialized success!"))

                    isInitialized = true
                    isModelLoading = false
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    addMessage(UiChatMessage(role = "system", answer = "Fail: ${e.localizedMessage}"))

                    isModelLoading = false
                }
            }
        }
    }

    fun onInputChange(newValue: String) {
        inputText = newValue
    }

    private fun addMessage(msg: UiChatMessage) {
        messages = messages + msg
    }

    fun toggleThinking(id: String) {
        messages = messages.map {
            if (it.id == id) it.copy(isThinkingExpanded = !it.isThinkingExpanded) else it
        }
    }

    fun sendMessage() {
        val userContent = inputText
        if (userContent.isNotBlank() && !isModelLoading) {

            // add user message
            val userMsg = UiChatMessage(role = "user", answer = userContent)
            addMessage(userMsg)

            // model message
            val aiMsg = UiChatMessage(role = "assistant", answer = "")
            addMessage(aiMsg)

            val formattedPrompt = PromptMapper.mapToGemma4Prompt(messageHistory, userContent)
            Log.d(LogTags.CHATVM, "============================================")
            Log.d(LogTags.CHATVM, ">>> INPUT PROMPT >>>\n$formattedPrompt")
            Log.d(LogTags.CHATVM, "============================================")
            messageHistory.add(ChatMessage("user", userContent))
            inputText = ""

            viewModelScope.launch(Dispatchers.IO) {
                try {
                    isModelLoading = true
                    var fullAiResponse = ""
                    var isInsideThinking = false
                    val pendingThinking = StringBuilder()
                    val pendingAnswer = StringBuilder()
                    var lastUiFlushAt = 0L

                    suspend fun flushUi(force: Boolean = false) {
                        if (pendingThinking.isEmpty() && pendingAnswer.isEmpty()) return
                        val now = System.currentTimeMillis()
                        if (!force && now - lastUiFlushAt < tokenUiThrottleMs) return

                        val thinkingChunk = pendingThinking.toString()
                        val answerChunk = pendingAnswer.toString()
                        pendingThinking.clear()
                        pendingAnswer.clear()
                        lastUiFlushAt = now

                        withContext(Dispatchers.Main) {
                            messages = messages.map { msg ->
                                if (msg.id == aiMsg.id) {
                                    msg.copy(
                                        thinking = if (thinkingChunk.isNotEmpty()) (msg.thinking ?: "") + thinkingChunk else msg.thinking,
                                        answer = if (answerChunk.isNotEmpty()) msg.answer + answerChunk else msg.answer
                                    )
                                } else {
                                    msg
                                }
                            }
                        }
                    }

                    engine?.sendUserPrompt(formattedPrompt, 1024)?.collect { token ->
                        fullAiResponse += token

                        when {
                            token.contains("<|channel>") -> {
                                isInsideThinking = true
                                val cleanedToken = token.replace("<|channel>thought", "").replace("<|channel>", "")
                                pendingThinking.append(cleanedToken)
                            }
                            token.contains("<channel|>") -> {
                                isInsideThinking = false
                                val cleanedToken = token.replace("<channel|>", "")
                                pendingAnswer.append(cleanedToken)
                            }
                            isInsideThinking -> pendingThinking.append(token)
                            else -> pendingAnswer.append(token)
                        }

                        flushUi()
                    }

                    flushUi(force = true)

                    Log.d(LogTags.CHATVM, "============================================")
                    Log.d(LogTags.CHATVM, "<<< FULL OUTPUT <<<\n$fullAiResponse")
                    Log.d(LogTags.CHATVM, "============================================")
                    // add to history
//                    messageHistory.add(ChatMessage("model", fullAiResponse))
                    // for no thinking in history
                    val finalAnswerOnly = fullAiResponse.split("<channel|>").last()
                    messageHistory.add(ChatMessage("model", finalAnswerOnly))

                    withContext(Dispatchers.Main) {
                        isModelLoading = false
                    }

                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        messages = messages.map {
                            if (it.id == aiMsg.id) it.copy(answer = it.answer + "\n[Error: ${e.localizedMessage}]") else it
                        }
                        isModelLoading = false
                    }
                }
            }
        }
    }

    fun initializeModelIfNeeded(context: Context, modelPath: String) {
        if (!isReady()) {
            initializeModel(context, modelPath)
        }
    }

    fun sendMessageForWeb(
        userContent: String,
        onToken: (String) -> Unit,
        onComplete: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val trimmed = userContent.trim()
        if (trimmed.isEmpty()) {
            onError("Message cannot be empty")
            return
        }
        if (!isReady()) {
            onError("Local model is not ready")
            return
        }
        if (!isWebGenerating.compareAndSet(false, true)) {
            onError("Model is busy. Please wait for current response to finish.")
            return
        }

        val formattedPrompt = PromptMapper.mapToGemma4Prompt(messageHistory, trimmed)
        messageHistory.add(ChatMessage("user", trimmed))

        viewModelScope.launch(Dispatchers.IO) {
            var isInsideThinking = false
            val answerBuilder = StringBuilder()
            val pendingAnswerUi = StringBuilder()
            var lastUiFlushAt = 0L

            // --- check performance ---
            var tokenCount = 0
            var startTime = 0L
            // -----------------------

            suspend fun flushWebUi(force: Boolean = false) {
                if (pendingAnswerUi.isEmpty()) return
                val now = System.currentTimeMillis()
                if (!force && now - lastUiFlushAt < tokenUiThrottleMs) return

                val chunk = pendingAnswerUi.toString()
                pendingAnswerUi.clear()
                lastUiFlushAt = now

                withContext(Dispatchers.Main) {
                    onToken(chunk)
                }
            }

            try {
                engine?.sendUserPrompt(formattedPrompt, 1024)?.collect { token ->
                    // --- check performance ---
                    if (tokenCount == 0) startTime = System.currentTimeMillis()
                    tokenCount++

                    val currentTime = System.currentTimeMillis()
                    val durationSeconds = (currentTime - startTime) / 1000.0

                    if (durationSeconds > 0 && tokenCount % 10 == 0) {
                        val tps = tokenCount / durationSeconds
                        Log.d("Performance", "Web Mode -> Tokens: $tokenCount | Speed: ${String.format("%.2f", tps)} t/s")
                    }
                    // -----------------------
                    val answerToken = when {
                        token.contains("<|channel>thought") || token.contains("<|channel>") -> {
                            isInsideThinking = true
                            ""
                        }
                        token.contains("<channel|>") -> {
                            isInsideThinking = false
                            token.replace("<channel|>", "")
                        }
                        isInsideThinking -> ""
                        else -> token
                    }

                    if (answerToken.isNotEmpty()) {
                        answerBuilder.append(answerToken)
                        pendingAnswerUi.append(answerToken)
                        flushWebUi()
                    }
                }

                flushWebUi(force = true)

                val finalAnswer = answerBuilder.toString().trim()
                // --- check performance ---
                val totalTime = (System.currentTimeMillis() - startTime) / 1000.0
                Log.i("Performance", "=== Web generation end ===")
                Log.i("Performance", "total Token: $tokenCount | average speed: ${String.format("%.2f", tokenCount / totalTime)} t/s")
                // -----------------------

                messageHistory.add(ChatMessage("model", finalAnswer))
                withContext(Dispatchers.Main) {
                    onComplete(finalAnswer)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onError(e.localizedMessage ?: "Unknown local model error")
                }
            } finally {
                isWebGenerating.set(false)
            }
        }
    }
}