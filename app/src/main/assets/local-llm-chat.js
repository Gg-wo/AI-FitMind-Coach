// local-llm-chat.js
(function () {
    const pendingResponses = {};
    let modelFileNotFound = false;
    let statusInterval = null;
    let currentLoadingState = null;

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

    function setLoadingPanel(visible, title, subtitle) {
        const panel = getEl('localLlmLoadingPanel');
        const titleEl = getEl('localLlmLoadingTitle');
        const subtitleEl = getEl('localLlmLoadingSubtitle');

        if (!panel) return;

        panel.style.display = visible ? 'flex' : 'none';
        if (titleEl && title) titleEl.textContent = title;
        if (subtitleEl && subtitle) subtitleEl.textContent = subtitle;
        currentLoadingState = visible;
    }

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

        const content = document.createElement('div');
        content.className = 'coach-content';
        content.textContent = '';

        bubble.appendChild(header);
        bubble.appendChild(content);
        wrapper.appendChild(bubble);
        root.appendChild(wrapper);
        root.scrollTop = root.scrollHeight;

        return content;
    }

    function renderWelcomeMessage() {
        const root = getEl('localLlmMessages');
        if (!root) return;

        root.innerHTML = `
            <div class="coach-message">
                <div class="coach-message-bubble">
                    <div class="coach-header">
                        <div class="coach-avatar">🧠</div>
                        <span>Local Model</span>
                    </div>
                    <div class="coach-content">Ask me anything. I run directly on your device using your local model.</div>
                </div>
            </div>
        `;
    }

    function clearPendingResponses() {
        Object.keys(pendingResponses).forEach(requestId => {
            delete pendingResponses[requestId];
        });
    }

    function setInputEnabled(enabled) {
        const input = getEl('localLlmQuestion');
        if (input) input.disabled = !enabled;
    }

    function toRequestId() {
        return 'llm_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    function refreshModelStatus() {
        if (modelFileNotFound) {
            setStatus('Model file not found. Place the model file on device and restart.', false);
            setLoadingPanel(false);
            setInputEnabled(false);
            return false;
        }

        if (!ensureBridge()) {
            setStatus('Android local model bridge not available', false);
            setLoadingPanel(false);
            setInputEnabled(false);
            return false;
        }

        try {
            const ready = !!window.AndroidLocalLLM.isModelReady();
            if (ready) {
                setStatus('Local model ready', true);
                setLoadingPanel(false);
            } else {
                setStatus('Loading local model...', false);
                setLoadingPanel(
                    true,
                    'Loading local model...',
                    'This can take a few minutes on an emulator. Please wait until the status changes to ready.'
                );
            }
            setInputEnabled(ready);

            if (!ready && statusInterval === null) {
                statusInterval = setInterval(function () {
                    const stillReady = refreshModelStatus();
                    if (stillReady && statusInterval !== null) {
                        clearInterval(statusInterval);
                        statusInterval = null;
                    }
                }, 1500);
            }

            if (ready && statusInterval !== null) {
                clearInterval(statusInterval);
                statusInterval = null;
            }

            return ready;
        } catch (err) {
            setStatus('Local model unavailable', false);
            setLoadingPanel(false);
            setInputEnabled(false);
            return false;
        }
    }

    function tryInitializeModel() {
        if (modelFileNotFound || !ensureBridge()) return;
        try {
            window.AndroidLocalLLM.initializeModelIfNeeded();
            refreshModelStatus();
        } catch (err) {
            // ignore
        }
    }

    window.localLlmChat = {
        send: function () {
            const input = getEl('localLlmQuestion');
            if (!input) return;

            const question = input.value.trim();
            if (!question) return;

            if (!refreshModelStatus()) {
                if (typeof window.showAlert === 'function') {
                    window.showAlert('Local model is still loading. Please wait until it becomes ready.');
                }
                return;
            }

/*
cannot trigger because i blocked the input if loading and not found
*/
//            if (modelFileNotFound) {
//                if (typeof window.showAlert === 'function') {
//                    window.showAlert('Model file not found on device. Please install the model file and restart the app.');
//                }
//                return;
//            }
//
//            // Try to init on each send in case it wasn't ready yet
//            tryInitializeModel();
//
//            if (!refreshModelStatus()) {
//                if (typeof window.showAlert === 'function') {
//                    window.showAlert('Local model is still loading. Please wait a moment.');
//                }
//                return;
//            }

            appendUserMessage(question);
            input.value = '';

            const contentEl = appendAssistantMessage();
            const requestId = toRequestId();
            pendingResponses[requestId] = {
                contentEl: contentEl,
                text: ''
            };

            try {
                window.AndroidLocalLLM.sendMessage(question, requestId);
            } catch (err) {
                delete pendingResponses[requestId];
                if (contentEl) {
                    contentEl.textContent = 'Error: Failed to call Android local model bridge.';
                }
            }
        },

        onToken: function (requestId, token) {
            const pending = pendingResponses[requestId];
            if (!pending) return;
            pending.text += token;
            if (pending.contentEl) {
                pending.contentEl.textContent = pending.text;
                const root = getEl('localLlmMessages');
                if (root) root.scrollTop = root.scrollHeight;
            }
        },

        onComplete: function (requestId, fullText) {
            const pending = pendingResponses[requestId];
            if (!pending) return;
            if (pending.contentEl) {
                pending.contentEl.textContent = fullText || pending.text || '';
            }
            delete pendingResponses[requestId];
            refreshModelStatus();
        },

        onError: function (requestId, errorMessage) {
            // Empty requestId means an init-time error (e.g. model file not found)
            if (!requestId) {
                modelFileNotFound = true;
                // Stop the polling interval — no point checking anymore
                if (statusInterval !== null) {
                    clearInterval(statusInterval);
                    statusInterval = null;
                }
                setStatus('Model file not found. Place the model file on device and restart.', false);
                setLoadingPanel(false);
                setInputEnabled(false);
                return;
            }

            const pending = pendingResponses[requestId];
            if (pending && pending.contentEl) {
                pending.contentEl.textContent = 'Error: ' + (errorMessage || 'Unknown local model error');
            } else if (typeof window.showAlert === 'function') {
                window.showAlert('Local model error: ' + (errorMessage || 'Unknown error'));
            }
            delete pendingResponses[requestId];
            refreshModelStatus();
        },

        onTabActivated: function () {
            refreshModelStatus();
            const input = getEl('localLlmQuestion');
            if (input && !input.disabled) input.focus();
        },

        clearHistory: function () {
            clearPendingResponses();
            renderWelcomeMessage();

            const input = getEl('localLlmQuestion');
            if (input) {
                input.value = '';
            }

            refreshModelStatus();
            tryInitializeModel();
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        refreshModelStatus();
        tryInitializeModel();
    });
})();

