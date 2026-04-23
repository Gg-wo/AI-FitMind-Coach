// local-llm-chat.js
(function () {
    const pendingResponses = {};
    let modelFileNotFound = false;
    let statusInterval = null;
    let thinkingEnabled = true;
    let chatHistoryLoaded = false; // load once per tab activation lifecycle

    function getEl(id) {
        return document.getElementById(id);
    }

    function ensureBridge() {
        return typeof window.AndroidLocalLLM !== 'undefined';
    }

    function setStatus(text, ok) {
        const status = getEl('localLlmStatus');
        if (!status) return;
        status.textContent = text;
        status.style.color = ok ? '#4ade80' : 'var(--text-muted)';
    }

    // ── Message Rendering ──────────────────────────────────────────────────

    function appendUserMessage(content) {
        const root = getEl('localLlmMessages');
        if (!root) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'user-message';

        const bubble = document.createElement('div');
        bubble.className = 'user-message-bubble';
        bubble.textContent = content;

        wrapper.appendChild(bubble);
        root.appendChild(wrapper);
        root.scrollTop = root.scrollHeight;
    }

    /**
     * Creates an assistant message bubble.
     * Returns { thinkingSection, thinkingContentEl, contentEl }
     */
    function appendAssistantMessage() {
        const root = getEl('localLlmMessages');
        if (!root) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'coach-message';

        const bubble = document.createElement('div');
        bubble.className = 'coach-message-bubble';

        const header = document.createElement('div');
        header.className = 'coach-header';
        header.innerHTML = '<div class="coach-avatar">🧠</div><span>Local Model</span>';

        // ── Thinking section (hidden until first thinking token) ────────
        const thinkingSection = document.createElement('div');
        thinkingSection.style.cssText =
            'display:none; margin: 8px 0; padding: 10px 12px; background: rgba(255,255,255,0.04);' +
            'border-left: 3px solid #666; border-radius: 6px;';

        const thinkingLabel = document.createElement('div');
        thinkingLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px; font-weight: 600;';
        thinkingLabel.textContent = '💭 Thinking…';

        const thinkingContentEl = document.createElement('div');
        thinkingContentEl.style.cssText =
            'font-size: 12px; color: var(--text-muted); white-space: pre-wrap; line-height: 1.5;';

        thinkingSection.appendChild(thinkingLabel);
        thinkingSection.appendChild(thinkingContentEl);

        // ── Final answer area ───────────────────────────────────────────
        const contentEl = document.createElement('div');
        contentEl.className = 'coach-content';
        contentEl.textContent = '';

        bubble.appendChild(header);
        bubble.appendChild(thinkingSection);
        bubble.appendChild(contentEl);
        wrapper.appendChild(bubble);
        root.appendChild(wrapper);
        root.scrollTop = root.scrollHeight;

        return { thinkingSection, thinkingContentEl, contentEl };
    }

    function setInputEnabled(enabled) {
        const input = getEl('localLlmQuestion');
        if (input) input.disabled = !enabled;
    }

    function toRequestId() {
        return 'llm_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    // ── Model Status ───────────────────────────────────────────────────────

    function refreshModelStatus() {
        if (modelFileNotFound) {
            setStatus('Model file not found. Place the model file on device and restart.', false);
            setInputEnabled(false);
            return false;
        }
        if (!ensureBridge()) {
            setStatus('Android local model bridge not available', false);
            setInputEnabled(false);
            return false;
        }
        try {
            const ready = !!window.AndroidLocalLLM.isModelReady();
            setStatus(ready ? 'Local model ready' : 'Loading local model...', ready);
            setInputEnabled(ready);
            return ready;
        } catch (err) {
            setStatus('Local model unavailable', false);
            setInputEnabled(false);
            return false;
        }
    }

    function tryInitializeModel() {
        if (modelFileNotFound || !ensureBridge()) return;
        try { window.AndroidLocalLLM.initializeModelIfNeeded(); } catch (err) { /* ignore */ }
    }

    function syncThinkingToBridge() {
        if (!ensureBridge()) return;
        try { window.AndroidLocalLLM.setThinkingEnabled(thinkingEnabled); } catch (err) { /* ignore */ }
    }

    // ── Thinking Toggle ────────────────────────────────────────────────────

    function updateThinkingButton() {
        const btn = getEl('thinkingToggleBtn');
        if (!btn) return;
        if (thinkingEnabled) {
            btn.textContent = '💭 Thinking: ON';
            btn.style.background = 'rgba(0,212,255,0.15)';
            btn.style.borderColor = 'var(--accent-primary)';
            btn.style.color = 'var(--accent-primary)';
        } else {
            btn.textContent = '💭 Thinking: OFF';
            btn.style.background = 'var(--bg-tertiary)';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-secondary)';
        }
    }

    // ── Chat History ───────────────────────────────────────────────────────

    function clearAndRenderHistory(messages) {
        const root = getEl('localLlmMessages');
        if (!root) return;

        // Clear everything (including the static welcome message in HTML)
        root.innerHTML = '';

        if (!messages || messages.length === 0) {
            // Re-insert default welcome
            root.innerHTML =
                '<div class="coach-message">' +
                  '<div class="coach-message-bubble">' +
                    '<div class="coach-header"><div class="coach-avatar">🧠</div><span>Local Model</span></div>' +
                    '<div class="coach-content">Ask me anything. I run directly on your device using your local model.</div>' +
                  '</div>' +
                '</div>';
            return;
        }

        messages.forEach(function (msg) {
            if (msg.role === 'user') {
                appendUserMessage(msg.content);
            } else {
                const els = appendAssistantMessage();
                if (!els) return;
                if (msg.thinking) {
                    els.thinkingSection.style.display = '';
                    // Mark thinking as complete (label change)
                    const lbl = els.thinkingSection.querySelector('div');
                    if (lbl) lbl.textContent = '💭 Thought process';
                    els.thinkingContentEl.textContent = msg.thinking;
                }
                if (typeof marked !== 'undefined') {
                    els.contentEl.innerHTML = marked.parse(msg.content || '');
                } else {
                    els.contentEl.textContent = msg.content || '';
                }
            }
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────

    window.localLlmChat = {

        toggleThinking: function () {
            thinkingEnabled = !thinkingEnabled;
            updateThinkingButton();
            if (ensureBridge()) {
                try { window.AndroidLocalLLM.setThinkingEnabled(thinkingEnabled); } catch (e) { /* ignore */ }
            }
        },

        send: function () {
            const input = getEl('localLlmQuestion');
            if (!input) return;

            const question = input.value.trim();
            if (!question) return;

            appendUserMessage(question);
            input.value = '';

            const els = appendAssistantMessage();
            const requestId = toRequestId();
            pendingResponses[requestId] = {
                els: els,
                text: '',
                thinkingText: ''
            };

            try {
                window.AndroidLocalLLM.sendMessage(question, requestId);
            } catch (err) {
                delete pendingResponses[requestId];
                if (els) els.contentEl.textContent = 'Error: Failed to call Android local model bridge.';
            }
        },

        // ── Streaming callbacks ──────────────────────────────────────────

        onThinkingToken: function (requestId, token) {
            const pending = pendingResponses[requestId];
            if (!pending || !pending.els) return;
            pending.thinkingText += token;
            const { thinkingSection, thinkingContentEl } = pending.els;
            if (thinkingSection) thinkingSection.style.display = '';
            if (thinkingContentEl) thinkingContentEl.textContent = pending.thinkingText;
            const root = getEl('localLlmMessages');
            if (root) root.scrollTop = root.scrollHeight;
        },

        onThinkingDone: function (requestId) {
            const pending = pendingResponses[requestId];
            if (!pending || !pending.els) return;
            // Change label from "Thinking…" to "Thought process"
            const { thinkingSection } = pending.els;
            if (thinkingSection) {
                const lbl = thinkingSection.querySelector('div');
                if (lbl) lbl.textContent = 'Thought process';
            }
        },

        // Called when the model unexpectedly output thinking content while in ANSWER phase.
        // Kotlin has already discarded the thinking text from its builders; we clear whatever
        // token chunks may have already been dispatched to the DOM before the reset arrived.
        onAnswerReset: function (requestId) {
            const pending = pendingResponses[requestId];
            if (!pending) return;
            pending.text = '';
            if (pending.els && pending.els.contentEl) {
                pending.els.contentEl.textContent = '';
            }
        },

        onToken: function (requestId, token) {
            const pending = pendingResponses[requestId];
            if (!pending || !pending.els) return;
            pending.text += token;
            if (pending.els.contentEl) {
                pending.els.contentEl.textContent = pending.text;
                const root = getEl('localLlmMessages');
                if (root) root.scrollTop = root.scrollHeight;
            }
        },

        onComplete: function (requestId, fullText) {
            const pending = pendingResponses[requestId];
            if (!pending) return;
            const finalText = fullText || pending.text || '';
            if (pending.els && pending.els.contentEl) {
                // Render markdown if available
                if (typeof marked !== 'undefined') {
                    pending.els.contentEl.innerHTML = marked.parse(finalText);
                } else {
                    pending.els.contentEl.textContent = finalText;
                }
            }
            delete pendingResponses[requestId];
            refreshModelStatus();
        },

        onError: function (requestId, errorMessage) {
            if (!requestId) {
                modelFileNotFound = true;
                if (statusInterval !== null) { clearInterval(statusInterval); statusInterval = null; }
                setStatus('Model file not found. Place the model file on device and restart.', false);
                setInputEnabled(false);
                return;
            }
            const pending = pendingResponses[requestId];
            if (pending && pending.els && pending.els.contentEl) {
                pending.els.contentEl.textContent = 'Error: ' + (errorMessage || 'Unknown local model error');
            } else if (typeof window.showAlert === 'function') {
                window.showAlert('Local model error: ' + (errorMessage || 'Unknown error'));
            }
            delete pendingResponses[requestId];
            refreshModelStatus();
        },

        // ── Chat history load callback ───────────────────────────────────

        onChatLoaded: function (callbackId, jsonStr) {
            try {
                const messages = JSON.parse(jsonStr);
                clearAndRenderHistory(messages);
            } catch (e) {
                console.warn('localLlmChat.onChatLoaded parse error:', e);
            }
        },

        // ── Tab lifecycle ────────────────────────────────────────────────

        onTabActivated: function () {
            refreshModelStatus();
            tryInitializeModel();
            syncThinkingToBridge();

            // Load chat history from DB (once per session startup)
            if (!chatHistoryLoaded && ensureBridge()) {
                chatHistoryLoaded = true;
                try {
                    window.AndroidLocalLLM.loadLatestChat('loadChat_' + Date.now());
                } catch (e) {
                    console.warn('loadLatestChat bridge call failed:', e);
                }
            }

            const input = getEl('localLlmQuestion');
            if (input && !input.disabled) input.focus();

            updateThinkingButton();
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        refreshModelStatus();
        tryInitializeModel();
        syncThinkingToBridge();
        updateThinkingButton();
    });
})();
