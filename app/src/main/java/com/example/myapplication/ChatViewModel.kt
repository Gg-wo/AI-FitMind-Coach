/*
This is a modified version of the original native compose code of the testing project;
So both logic for native and webview code exists
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
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class ChatViewModel : ViewModel() {

    companion object {
        private const val PREF_NAME = "app_prefs"
        private const val KEY_CURRENT_USER_ID = "current_user_id"
        private const val SYSTEM_PROMPT = "You are a helpful ai fitness coach."
        private const val TAG = "ChatViewModel"
    }

    private var isInitialized = false
    private val isWebGenerating = AtomicBoolean(false)
    private val tokenUiThrottleMs = 100L

    // thinking toggle — set from JS via AndroidLocalLLM.setThinkingEnabled()
    @Volatile
    var isThinkingEnabled: Boolean = false
        private set

    fun setThinkingEnabled(enabled: Boolean) {
        isThinkingEnabled = enabled
        Log.d(TAG, "Thinking mode: $enabled")
    }

    // current active chat DB id (null until first message is sent)
    private var currentChatId: Int? = null

    private val messageHistory = mutableListOf<ChatMessage>(
        ChatMessage("system", SYSTEM_PROMPT)
    )

    var isModelLoading by mutableStateOf(false)
        private set

    var messages by mutableStateOf(listOf<UiChatMessage>())
        private set

    private var engine: InferenceEngine? = null

    fun isReady(): Boolean = isInitialized && engine != null && !isModelLoading

    // ─── Model Initialization ──────────────────────────────────────────────

    fun initializeModel(context: Context, modelPath: String) {
        if (isInitialized) return
        viewModelScope.launch(Dispatchers.IO) {
            try {
                isModelLoading = true
                val inferenceEngine = AiChat.getInferenceEngine(context)
                engine = inferenceEngine
                inferenceEngine.loadModel(modelPath)

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

    fun initializeModelIfNeeded(context: Context, modelPath: String) {
        if (!isReady()) initializeModel(context, modelPath)
    }

    private fun addMessage(msg: UiChatMessage) {
        messages = messages + msg
    }

    private fun sanitizeAssistantContent(content: String): String {
        return LocalModelOutputRawContentHandler.sanitizeAssistantHistoryContent(content)
    }

    private fun sanitizeThinkingContent(content: String?): String? {
        return LocalModelOutputRawContentHandler.sanitizeThinkingContent(content)
    }

    // ─── DB Helpers ────────────────────────────────────────────────────────

    private fun getCurrentUserId(context: Context): UUID {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val id = prefs.getString(KEY_CURRENT_USER_ID, null)
            ?: error("No user initialised – call TestUserInitializer.initialize() first")
        return UUID.fromString(id)
    }

    /**
     * Returns the current chat ID, creating a new Chat row on first call.
     * Must be called from a coroutine on Dispatchers.IO.
     */
    private suspend fun ensureChatExists(context: Context): Int {
        currentChatId?.let { return it }

        val userId = getCurrentUserId(context)
        val db = DatabaseProvider.get(context)
        val now = System.currentTimeMillis()
        val chat = Chat(
            userId = userId,
            systemPrompt = SYSTEM_PROMPT,
            isUserMessage = false,
            chatCreatedAtTimeStamp = now,
            chatUpdatedAtTimeStamp = now
        )
        val chatId = db.chatDao().insertChat(chat).toInt()
        currentChatId = chatId
        Log.d(TAG, "Created new chat: $chatId")
        return chatId
    }

    private suspend fun saveUserMessage(
        context: Context,
        chatId: Int,
        rawPromptContent: String,
        cleanUserContent: String
    ) {
        val userId = getCurrentUserId(context)
        val db = DatabaseProvider.get(context)
        val now = System.currentTimeMillis()
        val msg = Message(
            messageId = UUID.randomUUID(),
            chatId = chatId,
            userId = userId,
            // For user messages, keep the exact input prompt sent to the model for debugging/audit.
            rawContent = rawPromptContent,
            cleanContent = cleanUserContent,
            thinkingContent = null,
            isUserMessage = true,
            messageCreatedAtTimeStamp = now
        )
        db.messageDao().insertMessage(msg)
        // update chat timestamp
        db.chatDao().updateSystemPrompt(chatId, SYSTEM_PROMPT, now)
    }

    private suspend fun saveAiMessage(
        context: Context,
        chatId: Int,
        rawOutput: String,
        cleanAnswer: String,
        thinkingContent: String?
    ) {
        val userId = getCurrentUserId(context)
        val db = DatabaseProvider.get(context)
        val now = System.currentTimeMillis()
        val msg = Message(
            messageId = UUID.randomUUID(),
            chatId = chatId,
            userId = userId,
            rawContent = rawOutput,
            cleanContent = cleanAnswer,
            thinkingContent = thinkingContent?.takeIf { it.isNotBlank() },
            isUserMessage = false,
            messageCreatedAtTimeStamp = now
        )
        db.messageDao().insertMessage(msg)
        db.chatDao().updateSystemPrompt(chatId, SYSTEM_PROMPT, now)
    }

    // ─── Load Latest Chat ──────────────────────────────────────────────────

    /**
     * Loads the most recent chat for the current user from Room DB.
     * Populates [messageHistory] for in-context generation.
     * Calls [onLoaded] with a JSON string to render in the WebView.
     *
     * JSON format:
     * [{"role":"user","content":"..."},{"role":"assistant","content":"...","thinking":"..."}]
     */
    fun loadLatestChat(context: Context, onLoaded: (String) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val userId = getCurrentUserId(context)
                val db = DatabaseProvider.get(context)
                val latestChat = db.chatDao().getLatestChatByUserId(userId)

                if (latestChat == null) {
                    Log.d(TAG, "No existing chat found")
                    withContext(Dispatchers.Main) { onLoaded("[]") }
                    return@launch
                }

                currentChatId = latestChat.chatId
                val dbMessages = db.messageDao().getMessagesByChatId(latestChat.chatId)
                val repairedMessages = mutableListOf<Message>()

                // Rebuild in-memory history (keep system message at head)
                messageHistory.clear()
                messageHistory.add(ChatMessage("system", SYSTEM_PROMPT))
                dbMessages.forEach { m ->
                    if (m.isUserMessage) {
                        val cleanUserContent = m.cleanContent.trim()
                        messageHistory.add(ChatMessage("user", cleanUserContent))
                    } else {
                        val sanitizedCleanContent = sanitizeAssistantContent(m.cleanContent)
                        val sanitizedThinkingContent = sanitizeThinkingContent(
                            m.thinkingContent ?: LocalModelOutputRawContentHandler.extractOutputThinkingContent(m.rawContent)
                        )

                        if (sanitizedCleanContent != m.cleanContent || sanitizedThinkingContent != m.thinkingContent) {
                            Log.w(TAG, "Sanitized contaminated assistant history for message ${m.messageId}")
                            repairedMessages.add(
                                m.copy(
                                    cleanContent = sanitizedCleanContent,
                                    thinkingContent = sanitizedThinkingContent
                                )
                            )
                        }

                        messageHistory.add(ChatMessage("model", sanitizedCleanContent))
                    }
                }

                repairedMessages.forEach { db.messageDao().updateMessage(it) }

                // Serialise for WebView
                val arr = JSONArray()
                dbMessages.forEach { m ->
                    val obj = JSONObject()
                    obj.put("role", if (m.isUserMessage) "user" else "assistant")
                    if (m.isUserMessage) {
                        obj.put("content", m.cleanContent.trim())
                    } else {
                        val sanitizedCleanContent = sanitizeAssistantContent(m.cleanContent)
                        val sanitizedThinkingContent = sanitizeThinkingContent(
                            m.thinkingContent ?: LocalModelOutputRawContentHandler.extractOutputThinkingContent(m.rawContent)
                        )
                        obj.put("content", sanitizedCleanContent)
                        if (!sanitizedThinkingContent.isNullOrBlank()) {
                            obj.put("thinking", sanitizedThinkingContent)
                        }
                    }
                    arr.put(obj)
                }

                Log.d(TAG, "Loaded chat ${latestChat.chatId} with ${dbMessages.size} messages")
                withContext(Dispatchers.Main) { onLoaded(arr.toString()) }

            } catch (e: Exception) {
                Log.e(TAG, "loadLatestChat failed", e)
                withContext(Dispatchers.Main) { onLoaded("[]") }
            }
        }
    }

    // ─── Send Message (Web path) ───────────────────────────────────────────

    /**
     * Called from the WebView JS bridge to run inference.
     *
     * Thinking is controlled by [isThinkingEnabled] (toggled via [setThinkingEnabled]).
     * When thinking is ON:
     *   - [onThinkingToken] streams thinking chunks in real time
     *   - [onThinkingDone] fires once when the model exits the thinking channel (<channel|>)
     * When thinking is OFF the model is seeded into ANSWER phase and thinking callbacks
     * are never invoked.
     *
     * On first message a Chat row is created and both messages are persisted to Room DB.
     */
    fun sendMessageForWeb(
        context: Context,
        userContent: String,
        onToken: (String) -> Unit,
        onThinkingToken: (String) -> Unit,
        onThinkingDone: () -> Unit,
        onAnswerReset: () -> Unit,       // called when model unexpectedly outputs thinking while in ANSWER phase
        onComplete: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val trimmed = userContent.trim()
        if (trimmed.isEmpty()) { onError("Message cannot be empty"); return }
        if (!isReady()) { onError("Local model is not ready"); return }
        if (!isWebGenerating.compareAndSet(false, true)) {
            onError("Model is busy. Please wait for current response to finish.")
            return
        }

        val enableThinking = isThinkingEnabled
        val formattedPrompt = PromptMapper.mapToGemma4Prompt(messageHistory, trimmed, enableThinking)
        messageHistory.add(ChatMessage("user", trimmed))

        Log.d(TAG, "============================================")
        Log.d(TAG, ">>> INPUT PROMPT (thinking=$enableThinking) >>>\n$formattedPrompt")
        Log.d(TAG, "============================================")

        viewModelScope.launch(Dispatchers.IO) {
            // ── DB: ensure chat + save user message ───────────────────────
            val chatId = try {
                val id = ensureChatExists(context)
                saveUserMessage(
                    context = context,
                    chatId = id,
                    rawPromptContent = formattedPrompt,
                    cleanUserContent = trimmed
                )
                id
            } catch (e: Exception) {
                Log.e(TAG, "DB pre-save failed", e)
                null
            }

            // ── Streaming state ───────────────────────────────────────────
            // Phase starts in THINKING when thinking is seeded in the prompt,
            // otherwise starts in ANSWER.
            var phase = if (enableThinking) OutputPhase.THINKING else OutputPhase.ANSWER
            var thinkingDoneDispatched = false
            val rawOutputBuilder = StringBuilder()

            // the inference engine echoes the seeded "<|channel>thought" text
            // back as its very first streamed token. Strip it on the first THINKING token
            // so it never appears in the thinking display.
            // (Set to true already when thinking is OFF — nothing to strip in that case.)
            var thinkingSeedStripped = !enableThinking

            val answerBuilder = StringBuilder()
            val thinkingBuilder = StringBuilder()
            val pendingAnswerUi = StringBuilder()
            val pendingThinkingUi = StringBuilder()
            var lastUiFlushAt = 0L

            // Token-count perf tracking
            var tokenCount = 0
            var startTime = 0L

            suspend fun flushAnswer(force: Boolean = false) {
                if (pendingAnswerUi.isEmpty()) return
                val now = System.currentTimeMillis()
                if (!force && now - lastUiFlushAt < tokenUiThrottleMs) return
                val chunk = pendingAnswerUi.toString()
                pendingAnswerUi.clear()
                lastUiFlushAt = now
                withContext(Dispatchers.Main) { onToken(chunk) }
            }

            suspend fun flushThinking(force: Boolean = false) {
                if (pendingThinkingUi.isEmpty()) return
                val now = System.currentTimeMillis()
                if (!force && now - lastUiFlushAt < tokenUiThrottleMs) return
                val chunk = pendingThinkingUi.toString()
                pendingThinkingUi.clear()
                lastUiFlushAt = now
                withContext(Dispatchers.Main) { onThinkingToken(chunk) }
            }

            try {
                engine?.sendUserPrompt(formattedPrompt, 1024)?.collect { token ->
                    rawOutputBuilder.append(token)
                    if (tokenCount == 0) startTime = System.currentTimeMillis()
                    tokenCount++
                    if (tokenCount % 10 == 0 && startTime > 0) {
                        val tps = tokenCount / ((System.currentTimeMillis() - startTime) / 1000.0)
                        Log.d("Performance", "Web -> $tokenCount tokens | ${String.format("%.2f", tps)} t/s")
                    }

                    when (phase) {
                        OutputPhase.THINKING -> {
                            val idx = token.indexOf(LocalModelTokens.CHANNEL_END)
                            if (idx >= 0) {
                                // Transition: everything before <channel|> is thinking,
                                // everything after is the start of the answer.
                                val thinkPart = token.substring(0, idx)
                                val answerPart = token.substring(idx + LocalModelTokens.CHANNEL_END.length)
                                if (thinkPart.isNotEmpty()) {
                                    thinkingBuilder.append(thinkPart)
                                    pendingThinkingUi.append(thinkPart)
                                }
                                phase = OutputPhase.ANSWER
                                if (!thinkingDoneDispatched) {
                                    thinkingDoneDispatched = true
                                    flushThinking(force = true)
                                    withContext(Dispatchers.Main) { onThinkingDone() }
                                }
                                if (answerPart.isNotEmpty()) {
                                    answerBuilder.append(answerPart)
                                    pendingAnswerUi.append(answerPart)
                                    flushAnswer()
                                }
                            } else {
                                // Bug 1 fix: strip the echoed seed prefix on the very first token.
                                val processedToken = if (!thinkingSeedStripped) {
                                    thinkingSeedStripped = true
                                    token
                                        .removePrefix(LocalModelTokens.THINK_CHANNEL) // "<|channel>thought"
                                        .removePrefix(LocalModelTokens.CHANNEL_START) // "<|channel>" (fallback)
                                } else {
                                    token
                                }
                                if (processedToken.isNotEmpty()) {
                                    thinkingBuilder.append(processedToken)
                                    pendingThinkingUi.append(processedToken)
                                    flushThinking()
                                }
                            }
                        }

                        OutputPhase.ANSWER -> {
                            // Bug 2 fix: when thinking is OFF the model may still produce thinking
                            // content because of prior context. Detect <channel|> in ANSWER phase.
                            // When found: display the hidden thinking content, transition to clean ANSWER.
                            val channelEndIdx = token.indexOf(LocalModelTokens.CHANNEL_END)
                            if (channelEndIdx >= 0) {
                                Log.w(TAG, "Unexpected <channel|> in ANSWER phase — capturing hidden thinking and displaying it.")
                                // Everything before <channel|> is thinking content.
                                val hiddenThinking = answerBuilder.toString() + token.substring(0, channelEndIdx)
                                if (hiddenThinking.isNotEmpty()) {
                                    thinkingBuilder.append(hiddenThinking)
                                    // Display the captured thinking
                                    withContext(Dispatchers.Main) { onThinkingToken(hiddenThinking) }
                                    if (!thinkingDoneDispatched) {
                                        thinkingDoneDispatched = true
                                        withContext(Dispatchers.Main) { onThinkingDone() }
                                    }
                                }
                                // Reset the answer buffer and clear any UI that was already rendered
                                pendingAnswerUi.clear()
                                answerBuilder.clear()
                                withContext(Dispatchers.Main) { onAnswerReset() }
                                // Continue with the answer part after <channel|>
                                val after = token.substring(channelEndIdx + LocalModelTokens.CHANNEL_END.length)
                                if (after.isNotEmpty()) {
                                    answerBuilder.append(after)
                                    pendingAnswerUi.append(after)
                                    flushAnswer()
                                }
                            } else {
                                answerBuilder.append(token)
                                pendingAnswerUi.append(token)
                                flushAnswer()
                            }
                        }
                    }
                }

                // Flush remaining buffers
                if (phase == OutputPhase.THINKING && !thinkingDoneDispatched) {
                    flushThinking(force = true)
                    withContext(Dispatchers.Main) { onThinkingDone() }
                } else {
                    flushAnswer(force = true)
                }

                val rawOutput = rawOutputBuilder.toString()
                Log.d(TAG, "============================================")
                Log.d(TAG, ">>> OUTPUT PROMPT (thinking=$enableThinking) >>>\n$rawOutput")
                Log.d(TAG, "============================================")

                if (!LocalModelOutputRawContentHandler.validateRawOutput(rawOutput)) {
                    Log.w(TAG, "Raw output contains unexpected turn headers; sanitizing persisted content.")
                }

                val finalAnswer = sanitizeAssistantContent(
                    LocalModelOutputRawContentHandler.extractOutputCleanContent(rawOutput)
                )
                val thinkingText = sanitizeThinkingContent(
                    LocalModelOutputRawContentHandler.extractOutputThinkingContent(rawOutput)
                        ?: thinkingBuilder.toString()
                )

                if (startTime > 0) {
                    val total = (System.currentTimeMillis() - startTime) / 1000.0
                    Log.i("Performance", "=== Web end === $tokenCount tokens | ${String.format("%.2f", tokenCount / total)} t/s")
                }

                messageHistory.add(ChatMessage("model", finalAnswer))

                if (chatId != null) {
                    try {
                        saveAiMessage(context, chatId, rawOutput, finalAnswer, thinkingText)
                    } catch (e: Exception) {
                        Log.e(TAG, "DB post-save failed", e)
                    }
                }

                withContext(Dispatchers.Main) { onComplete(finalAnswer) }

            } catch (e: Exception) {
                Log.e(TAG, "Inference error", e)
                withContext(Dispatchers.Main) {
                    onError(e.localizedMessage ?: "Unknown local model error")
                }
            } finally {
                isWebGenerating.set(false)
            }
        }
    }
}