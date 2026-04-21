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
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

class ChatViewModel : ViewModel() {
    private var isInitialized = false
    private val isWebGenerating = AtomicBoolean(false)

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

                inferenceEngine.setSystemPrompt("You are a helpful ai assistant.")

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

                    engine?.sendUserPrompt(formattedPrompt, 1024)?.collect { token ->
                        fullAiResponse += token

                        withContext(Dispatchers.Main) {
                            messages = messages.map { msg ->
                                if (msg.id == aiMsg.id) {
                                    // check if model start thinking
                                    if (token.contains("<|channel>")) {
                                        isInsideThinking = true
                                        // clean the extra string
                                        val cleanedToken = token.replace("<|channel>thought", "").replace("<|channel>", "")
                                        msg.copy(thinking = (msg.thinking ?: "") + cleanedToken) // possible add nothing
                                    }
                                    // check if model thinking end
                                    else if (token.contains("<channel|>")) {
                                        isInsideThinking = false
                                        val cleanedToken = token.replace("<channel|>", "")
                                        // add to answer
                                        msg.copy(answer = msg.answer + cleanedToken) // possible add nothing
                                    }
                                    // other non "channel" tokens
                                    else if (isInsideThinking) {
                                        msg.copy(thinking = (msg.thinking ?: "") + token)
                                    } else {
                                        msg.copy(answer = msg.answer + token)
                                    }
                                } else {
                                    msg
                                }
                            }
                        }
                    }
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

            try {
                engine?.sendUserPrompt(formattedPrompt, 1024)?.collect { token ->
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
                        withContext(Dispatchers.Main) {
                            onToken(answerToken)
                        }
                    }
                }

                val finalAnswer = answerBuilder.toString().trim()
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