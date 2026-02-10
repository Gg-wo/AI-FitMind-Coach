// Detect color scheme
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (event.matches) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
});

// Global state
let workoutActive = false;
let workoutStartTime = null;
let workoutInterval = null;
let hrChart = null;
let hrData = [];
let workoutHistory = [];
let chatSessions = [];  // Array of chat session objects
let currentChatId = null;  // ID of currently active chat session
let currentWorkout = null;
let researchDataset = null;  // Real research data from WESAD
let currentDataIndex = 0;    // Current position in playback
let dashboardYogaSession = null;
let dashboardYogaIndex = 0;
let dashboardLiveInterval = null;

// LocalStorage Keys
const STORAGE_KEYS = {
    WORKOUT_HISTORY: 'fitmind_workout_history',
    CHAT_SESSIONS: 'fitmind_chat_sessions',
    CURRENT_CHAT_ID: 'fitmind_current_chat_id',
    USER_PROFILE: 'fitmind_user_profile'
};

let pendingAvatar = null;

function getProfileStorageKey() {
    if (window.auth && window.auth.currentUser && window.auth.currentUser.uid) {
        return `${STORAGE_KEYS.USER_PROFILE}_${window.auth.currentUser.uid}`;
    }
    return STORAGE_KEYS.USER_PROFILE;
}

function getWorkoutHistoryStorageKey() {
    if (window.auth && window.auth.currentUser && window.auth.currentUser.uid) {
        return `${STORAGE_KEYS.WORKOUT_HISTORY}_${window.auth.currentUser.uid}`;
    }
    return STORAGE_KEYS.WORKOUT_HISTORY;
}

function getChatSessionsStorageKey() {
    if (window.auth && window.auth.currentUser && window.auth.currentUser.uid) {
        return `${STORAGE_KEYS.CHAT_SESSIONS}_${window.auth.currentUser.uid}`;
    }
    return STORAGE_KEYS.CHAT_SESSIONS;
}

function getCurrentChatIdStorageKey() {
    if (window.auth && window.auth.currentUser && window.auth.currentUser.uid) {
        return `${STORAGE_KEYS.CURRENT_CHAT_ID}_${window.auth.currentUser.uid}`;
    }
    return STORAGE_KEYS.CURRENT_CHAT_ID;
}

function getLocalProfile() {
    const key = getProfileStorageKey();
    const profileData = localStorage.getItem(key);
    return profileData ? JSON.parse(profileData) : null;
}

function setLocalProfile(profile) {
    const key = getProfileStorageKey();
    localStorage.setItem(key, JSON.stringify(profile));
}

async function refreshProfileFromCloud() {
    if (!window.firebaseSync || typeof window.firebaseSync.loadUserProfile !== 'function') {
        return;
    }

    if (!(window.auth && window.auth.currentUser)) {
        return;
    }

    try {
        const cloudProfile = await window.firebaseSync.loadUserProfile();
        if (cloudProfile) {
            setLocalProfile(cloudProfile);
            updateProfileAvatarUI();
            renderDashboardGreeting();
            renderDashboardStats();
        }
    } catch (error) {
        console.warn('⚠️ Failed to refresh profile from cloud:', error);
    }
}

// Constants
const MAX_HR = 190; // Example max heart rate
const REST_HR = 65;

// OpenRouter API Configuration
// API key is now stored in config.js (gitignored for security)
// If config.js doesn't exist, copy config.example.js and add your key
const OPENROUTER_API_KEY = typeof CONFIG !== 'undefined' ? CONFIG.OPENROUTER_API_KEY : 'YOUR_API_KEY_HERE';
const OPENROUTER_MODEL = typeof CONFIG !== 'undefined' && CONFIG.MODEL ? CONFIG.MODEL : 'meta-llama/llama-3.1-70b-instruct';

// ============================================================
// PROMPT ENGINEERING - EXPERT FITNESS COACH SYSTEM
// ============================================================

// Heart Rate Zones (based on % of max HR)
function getHeartRateZone(avgHR, maxHR = MAX_HR) {
    const percentage = (avgHR / maxHR) * 100;
    
    if (percentage < 60) return { zone: 1, name: 'Recovery', benefit: 'active recovery, warm-up', intensity: 'Very Light' };
    if (percentage < 70) return { zone: 2, name: 'Fat Burn', benefit: 'fat burning, aerobic base building', intensity: 'Light' };
    if (percentage < 80) return { zone: 3, name: 'Aerobic', benefit: 'cardiovascular fitness, endurance', intensity: 'Moderate' };
    if (percentage < 90) return { zone: 4, name: 'Anaerobic', benefit: 'performance improvement, lactate threshold', intensity: 'Hard' };
    return { zone: 5, name: 'Max Effort', benefit: 'peak performance, VO2 max', intensity: 'Maximum' };
}

// Generate heart rate context for AI
function getHeartRateContext(workout) {
    if (!workout || !workout.avgHR) return '';
    
    const zone = getHeartRateZone(workout.avgHR, workout.maxHR || MAX_HR);
    const percentage = Math.round((workout.avgHR / (workout.maxHR || MAX_HR)) * 100);
    
    return `\n📊 HR DATA: ${workout.avgHR} bpm (${percentage}% max) - Zone ${zone.zone} (${zone.name})${workout.maxHR ? ` | Peak: ${workout.maxHR} bpm` : ''}`;
}

// Generate workout-specific context
function getWorkoutTypeContext(workoutType) {
    const contexts = {
        'RUNNING': '🏃 Focus: Pace control, cadence, prevent overuse injuries. Watch for sustained Zone 4+ (reduce if >20 min).',
        'CYCLING': '🚴 Focus: Cadence 80-100 RPM, power output, endurance building. Zone 3 ideal for long rides.',
        'STRENGTH': '💪 Focus: Form over speed, recovery 48-72hrs between muscle groups. HR often Zone 2-3.',
        'YOGA': '🧘 Focus: Breath work, flexibility, active recovery. Expect Zone 1-2 (recovery pace).',
        'SWIMMING': '🏊 Focus: Stroke efficiency, breathing rhythm. Low-impact cardio, can sustain Zone 3.',
        'HIIT': '⚡ Focus: Work-rest ratios, HR recovery between intervals. Expect Zone 4-5 spikes, limit frequency.',
        'WALKING': '🚶 Focus: Consistency, gradual progression. Zone 1-2, safe for daily training.'
    };
    
    return contexts[workoutType] || '🏋️ General fitness: Balance intensity with recovery, monitor HR zones.';
}

// Master system prompt with fitness expertise
function getFitnessCoachSystemPrompt() {
    return `You are FitMind AI - a real-time fitness coach that analyzes smartwatch data to optimize workouts and prevent overtraining.

🎯 TWO COACHING MODES:

🔴 REAL-TIME MODE (during workout):
- Focus on IMMEDIATE adjustments (NOW actions)
- Example: "Slow down NOW - your HR is too high" or "Maintain this pace for 5 more minutes"
- Prioritize SAFETY - stop if dangerous
- Be urgent and directive

📋 REVIEW MODE (post-workout):
- Focus on OVERALL assessment
- What went well, what didn't, patterns noticed
- Recommendations for NEXT time
- Recovery and training plan suggestions

📊 RESPONSE FORMAT (Keep it SHORT - 2-4 sentences max):
1. Quick analysis of their HR zone/intensity
2. ONE specific action (real-time: adjust NOW | review: do NEXT time)
3. Brief reason WHY based on their data

❤️ HEART RATE ZONE GUIDANCE:
- Zone 1-2 (Recovery/Fat Burn): Safe for daily training, build aerobic base
- Zone 3 (Aerobic): Optimal for endurance, can sustain 45-60 min
- Zone 4 (Anaerobic): High intensity, limit to 20-30 min, requires recovery
- Zone 5 (Max): Peak effort, only short intervals, high injury/overtraining risk

⚠️ OVERTRAINING SIGNS TO WATCH:
- Avg HR >85% max for >30 min → Recommend reduction or rest day
- Multiple Zone 4-5 workouts without rest → Warn about overtraining
- High calories + long duration → Emphasize recovery and nutrition

✅ ALWAYS use their ACTUAL numbers (HR, duration, zone) in your response.
❌ NEVER give medical advice, diagnose injuries, or ignore their data.

Be concise, data-driven, and motivating.`;
}

// ============================================================
// LOCAL STORAGE MANAGEMENT
// ============================================================

/**
 * Save workout history to localStorage and sync to cloud
 */
function saveWorkoutHistory(options = {}) {
    const { suppressSync = false } = options;
    try {
        const key = getWorkoutHistoryStorageKey();
        localStorage.setItem(key, JSON.stringify(workoutHistory));
        console.log('✓ Saved workout history:', workoutHistory.length, 'workouts');
        
        // Sync to Firebase if available
        if (!suppressSync && window.firebaseSync && typeof window.firebaseSync.debouncedSyncToCloud === 'function') {
            window.firebaseSync.debouncedSyncToCloud();
        }
    } catch (error) {
        console.error('Failed to save workout history:', error);
        showAlert('Warning: Failed to save workout data');
    }
}

/**
 * Load workout history from localStorage
 */
function loadWorkoutHistory() {
    try {
        const key = getWorkoutHistoryStorageKey();
        const saved = localStorage.getItem(key);
        if (saved) {
            workoutHistory = JSON.parse(saved);
            console.log('✓ Loaded workout history:', workoutHistory.length, 'workouts');
            return true;
        }
    } catch (error) {
        console.error('Failed to load workout history:', error);
    }
    return false;
}

function reloadWorkoutHistoryForCurrentUser() {
    workoutHistory = [];
    loadWorkoutHistory();
    updateHeaderStats();
    renderHistory();
    renderDashboardStats();
}

function reloadChatSessionsForCurrentUser() {
    chatSessions = [];
    currentChatId = null;
    loadChatSessions();

    if (chatSessions.length === 0) {
        createNewChatSession();
    } else if (!currentChatId) {
        currentChatId = chatSessions[0].id;
    }

    renderChatHistory();
    renderChatSidebar();
}

/**
 * Save all chat sessions to localStorage and sync to cloud
 */
function saveChatSessions(options = {}) {
    const { suppressSync = false } = options;
    try {
        const sessionsKey = getChatSessionsStorageKey();
        const chatIdKey = getCurrentChatIdStorageKey();
        localStorage.setItem(sessionsKey, JSON.stringify(chatSessions));
        localStorage.setItem(chatIdKey, currentChatId || '');
        console.log('✓ Saved chat sessions:', chatSessions.length, 'sessions');
        
        // Sync to Firebase if available
        if (!suppressSync && window.firebaseSync && typeof window.firebaseSync.debouncedSyncToCloud === 'function') {
            window.firebaseSync.debouncedSyncToCloud();
        }
    } catch (error) {
        console.error('Failed to save chat sessions:', error);
    }
}

/**
 * Load all chat sessions from localStorage
 */
function loadChatSessions() {
    try {
        const sessionsKey = getChatSessionsStorageKey();
        const chatIdKey = getCurrentChatIdStorageKey();
        const saved = localStorage.getItem(sessionsKey);
        const savedChatId = localStorage.getItem(chatIdKey);
        if (saved) {
            chatSessions = JSON.parse(saved);
            currentChatId = savedChatId || null;
            console.log('✓ Loaded chat sessions:', chatSessions.length, 'sessions');
            return true;
        }
    } catch (error) {
        console.error('Failed to load chat sessions:', error);
    }
    return false;
}

/**
 * Create a new chat session
 */
function createNewChatSession() {
    const newSession = {
        id: 'chat_' + Date.now(),
        title: 'New Chat',
        messages: [
            {
                role: 'assistant',
                content: "Hey! I'm your Fitmind AI fitness coach. I have access to your workout data, heart rate patterns, and recovery status. Ask me anything about your training, or let me analyze your performance!",
                timestamp: new Date().toISOString()
            }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    chatSessions.unshift(newSession);
    currentChatId = newSession.id;
    saveChatSessions();
    renderChatSidebar();
    renderChatHistory();
    setChatRenderLock(3000);
    return newSession;
}

/**
 * Switch to a different chat session
 */
function switchChatSession(chatId) {
    currentChatId = chatId;
    localStorage.setItem(STORAGE_KEYS.CURRENT_CHAT_ID, chatId);
    renderChatHistory();
    renderChatSidebar();
    setChatRenderLock();
}

/**
 * Delete a chat session
 */
/**
 * Delete a chat session
 */
function deleteChatSession(chatId) {
    console.log('🗑️ DELETE CALLED with chatId:', chatId);
    console.log('📋 Current chatSessions BEFORE delete:', chatSessions.length, chatSessions.map(s => s.id));
    console.log('🎯 Current active chat:', currentChatId);
    
    const index = chatSessions.findIndex(s => s.id === chatId);
    console.log('🔍 Found at index:', index);
    
    if (index === -1) {
        console.error('❌ Chat not found:', chatId);
        return;
    }
    
    // Remove from array
    chatSessions.splice(index, 1);
    console.log('✂️ Removed from array. Remaining:', chatSessions.length);
    
    // If deleting current chat, create a completely new one
    if (currentChatId === chatId) {
        console.log('⚠️ Deleting CURRENT chat!');
        if (chatSessions.length > 0) {
            // Switch to first available chat
            currentChatId = chatSessions[0].id;
            console.log('🔄 Switched to chat:', currentChatId);
        } else {
            // No chats left, create new one
            console.log('➕ Creating new chat (no chats left)');
            currentChatId = null;
            createNewChatSession();
        }
    }
    
    // Save to localStorage
    console.log('💾 Saving to localStorage...');
    saveChatSessions();
    
    // Force re-render everything
    console.log('🎨 Re-rendering sidebar and history...');
    renderChatSidebar();
    renderChatHistory();
    
    console.log('✅ Delete complete! Final chat count:', chatSessions.length);
    console.log('📋 Final chatSessions:', chatSessions.map(s => s.id));
    
    // Close sidebar after deletion
    console.log('🚪 Closing sidebar...');
    toggleChatSidebar();
}

/**
 * Get current chat session
 */
function getCurrentChatSession() {
    return chatSessions.find(s => s.id === currentChatId);
}

/**
 * Update chat session title based on first message
 */
function updateChatTitle(chatId) {
    const session = chatSessions.find(s => s.id === chatId);
    if (!session || session.messages.length === 0) return;
    
    // Use first user message as title (truncated)
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg && session.title === 'New Chat') {
        session.title = firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
        saveChatSessions();
        renderChatSidebar();
        setChatRenderLock();
    }
}

function setChatRenderLock(durationMs = 800) {
    window.chatRenderLockUntil = Date.now() + durationMs;
}

/**
 * Clear all stored data (for testing or user request)
 */
function clearAllStoredData() {
    localStorage.removeItem(STORAGE_KEYS.WORKOUT_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.CHAT_SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_CHAT_ID);
    workoutHistory = [];
    chatSessions = [];
    currentChatId = null;
    console.log('✓ Cleared Cache');
    updateHeaderStats();
    renderHistory();
    createNewChatSession();
}

/**
 * Start a new chat session
 */
function startNewChat() {
    // Check if current chat is empty
    const currentSession = getCurrentChatSession();
    if (currentSession && currentSession.messages.length === 0) {
        console.log('⚠️ Cannot create new chat - current chat is empty. Please send at least one message first.');
        showAlert('Please send at least one message in the current chat before starting a new one.');
        document.getElementById('coachQuestion').focus();
        return;
    }
    
    console.log('✨ Creating new chat (current chat has', currentSession?.messages.length || 0, 'messages)');
    createNewChatSession();
    document.getElementById('coachQuestion').focus();
}

/**
 * Toggle chat history modal visibility
 */
function toggleChatSidebar() {
    const modal = document.getElementById('chatSidebar');
    const backdrop = document.getElementById('chatSidebarBackdrop');
    
    if (!modal || !backdrop) {
        console.error('Modal or backdrop element not found');
        return;
    }
    
    const isOpen = modal.classList.contains('open');
    
    if (isOpen) {
        // Close modal
        modal.classList.remove('open');
        backdrop.classList.remove('open');
    } else {
        // Open modal
        modal.classList.add('open');
        backdrop.classList.add('open');
        renderChatSidebar();
    }
}

// ============================================================
// DATA LOADING & MANAGEMENT - Real Research Data
// ============================================================

/**
 * Load real research data from WESAD dataset
 * This data comes from wearable devices worn by research volunteers
 * Citation: Schmidt et al., 2018 - http://archive.ics.uci.edu/ml/datasets/WESAD
 */
async function loadResearchData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Failed to load research data');
        researchDataset = await response.json();
        console.log(`✓ Loaded ${researchDataset.totalSessions} real research sessions`);
        console.log(`  Data source: ${researchDataset.dataSource}`);
        console.log(`  Citation: ${researchDataset.citation || researchDataset.citations?.[0] || 'N/A'}`);
        return researchDataset;
    } catch (error) {
        console.warn('Could not load research data:', error);
        return null;
    }
}

/**
 * Get a random workout session from the research dataset
 * Filtered by activity type
 */
function getResearchSession(activityType = null) {
    if (!researchDataset || !researchDataset.sessions || researchDataset.sessions.length === 0) {
        return null;
    }

    let availableSessions = researchDataset.sessions;
    
    if (activityType) {
        availableSessions = availableSessions.filter(s => s.activity === activityType);
    }

    if (availableSessions.length === 0) {
        return availableSessions = researchDataset.sessions.slice(0, 3);
    }

    // Return random session
    return availableSessions[Math.floor(Math.random() * availableSessions.length)];
}

/**
 * Get the next heart rate value from a real research session
 * Simulates playback of actual collected data
 */
function getNextRealHeartRate(researchSession, playbackSpeed = 1) {
    if (!researchSession || !researchSession.heartRateData) {
        return null;
    }

    const hrData = researchSession.heartRateData;
    let index = currentDataIndex;

    // Wrap around if we reach the end
    if (index >= hrData.length) {
        currentDataIndex = 0;
        index = 0;
    }

    const currentHR = hrData[index];
    currentDataIndex++;

    // Add slight variation to simulate real-time sensor noise
    const noise = (Math.random() - 0.5) * 2;
    return Math.max(40, Math.round(currentHR + noise));
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    } else if (event && event.target) {
        event.target.classList.add('active');
    }

    document.getElementById(tabName + '-tab').classList.add('active');

    if (tabName === 'history') {
        renderHistory();
    } else if (tabName === 'progress') {
        renderProgressDashboard();
    }
}

// Initialize chart
function initChart() {
    const ctx = document.getElementById('hrChart').getContext('2d');
    hrChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Heart Rate (bpm)',
                data: [],
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary'),
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 0,  // No dots by default
                pointHoverRadius: 8,  // Show big dot on hover
                pointBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary'),
                pointBorderColor: '#fff',
                pointBorderWidth: 3,
                pointHoverBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary'),
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false  // Show tooltip when hovering anywhere on chart
            },
            plugins: {
                legend: {
                    display: true,
                    onClick: null,  // Disable clicking to hide/show dataset
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary'),
                    borderWidth: 2,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            return '🕐 Time: ' + context[0].label;
                        },
                        label: function(context) {
                            return '❤️ Heart Rate: ' + context.parsed.y + ' bpm';
                        },
                        afterLabel: function(context) {
                            const hr = context.parsed.y;
                            const zone = getHRZone(hr);
                            const zoneNames = {
                                1: 'Zone 1: Recovery',
                                2: 'Zone 2: Endurance',
                                3: 'Zone 3: Tempo',
                                4: 'Zone 4: Threshold',
                                5: 'Zone 5: Maximum'
                            };
                            return '📊 ' + zoneNames[zone];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 50,
                    max: 200,
                    title: {
                        display: true,
                        text: '❤️ Heart Rate (bpm)',
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                        font: {
                            size: 12
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '🕐 Time',
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                        font: {
                            size: 12
                        },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

// Get heart rate zone
function getHRZone(hr) {
    const percent = (hr / MAX_HR) * 100;
    if (percent < 60) return 1;
    if (percent < 70) return 2;
    if (percent < 80) return 3;
    if (percent < 90) return 4;
    return 5;
}

// Update zone indicators
function updateZones(currentHR) {
    const zone = getHRZone(currentHR);
    
    // Zone descriptions and colors
    const zoneInfo = {
        1: { name: 'Zone 1: Recovery', color: 'var(--zone1)', bg: 'rgba(74, 222, 128, 0.2)' },
        2: { name: 'Zone 2: Endurance', color: 'var(--zone2)', bg: 'rgba(251, 191, 36, 0.2)' },
        3: { name: 'Zone 3: Tempo', color: 'var(--zone3)', bg: 'rgba(251, 146, 60, 0.2)' },
        4: { name: 'Zone 4: Threshold', color: 'var(--zone4)', bg: 'rgba(248, 113, 113, 0.2)' },
        5: { name: 'Zone 5: Maximum', color: 'var(--zone5)', bg: 'rgba(220, 38, 38, 0.2)' }
    };
    
    // Update zone bar
    for (let i = 1; i <= 5; i++) {
        const zoneEl = document.getElementById(`zone${i}`);
        if (i === zone) {
            zoneEl.classList.add('active');
        } else {
            zoneEl.classList.remove('active');
        }
    }
    
    // Update current zone text
    const zoneText = document.getElementById('currentZoneText');
    if (zoneText) {
        const info = zoneInfo[zone];
        zoneText.textContent = `📍 Currently in ${info.name}`;
        zoneText.style.display = 'block';
        zoneText.style.color = info.color;
        zoneText.style.backgroundColor = info.bg;
        zoneText.style.border = `2px solid ${info.color}`;
    }
}

// Start workout
async function startWorkout() {
    const workoutType = document.getElementById('workoutType').value;

    // Ensure research data is loaded before starting
    if (!researchDataset) {
        await loadResearchData();
    }

    workoutActive = true;
    workoutStartTime = Date.now();
    hrData = [];
    currentDataIndex = 0;

    // Get a real research session for this activity type
    const researchSession = getResearchSession(workoutType);
    
    if (!researchSession) {
        showAlert('Error: Research data is not loaded yet. Please wait a moment and try again.');
        return;
    }
    
    currentWorkout = {
        type: workoutType,
        startTime: new Date().toISOString(),
        hrData: [],
        avgHR: 0,
        maxHR: 0,
        duration: 0,
        calories: 0,
        researchSession: researchSession,
        // Store reference data for accountability
        dataSource: researchSession.dataSource || 'Research Dataset',
        researchSubject: researchSession.subject
    };

    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('liveMetrics').style.display = 'block';
    setWorkoutTypeDisabled(true);

    if (!hrChart) {
        initChart();
    }

    // Start updating metrics
    workoutInterval = setInterval(updateWorkoutMetrics, 1000);
}

// Update workout metrics
function updateWorkoutMetrics() {
    if (!workoutActive) return;

    const elapsed = Math.floor((Date.now() - workoutStartTime) / 1000);
    
    // Use ONLY real research data (no simulation fallback)
    const currentHR = getNextRealHeartRate(currentWorkout.researchSession);

    // Update display
    document.getElementById('currentHR').textContent = currentHR;
    document.getElementById('duration').textContent = formatDuration(elapsed);

    // Calculate average HR
    hrData.push(currentHR);
    const avgHR = Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
    document.getElementById('avgHR').textContent = avgHR;

    // Calculate calories using research-based formula (Karvonen formula)
    const calories = calculateCaloriesFromHeartRate(avgHR, elapsed);
    document.getElementById('calories').textContent = calories;

    // Update zones
    updateZones(currentHR);

    // Keep dashboard live card in sync when workout is active
    renderDashboardLive();

    // Update chart
    if (hrChart) {
        const timeLabel = formatDuration(elapsed);
        hrChart.data.labels.push(timeLabel);
        hrChart.data.datasets[0].data.push(currentHR);

        // Keep all data points from start to finish - no limit
        // Smart time label intervals based on workout duration
        const totalPoints = hrChart.data.labels.length;
        const totalMinutes = elapsed / 60;
        
        let intervalMinutes;
        if (totalMinutes < 10) {
            intervalMinutes = 1; // Show every minute for short workouts
        } else if (totalMinutes < 30) {
            intervalMinutes = 3; // Every 3 minutes for 10-30 min workouts
        } else if (totalMinutes < 60) {
            intervalMinutes = 5; // Every 5 minutes for 30-60 min workouts
        } else {
            intervalMinutes = 10; // Every 10 minutes for 1+ hour workouts
        }
        
        const intervalSeconds = intervalMinutes * 60;
        const maxTicksLimit = Math.ceil(totalMinutes / intervalMinutes) + 1;
        
        // Update x-axis tick settings dynamically
        if (hrChart.options.scales.x.ticks) {
            hrChart.options.scales.x.ticks.maxTicksLimit = Math.max(5, Math.min(maxTicksLimit, 15));
        }

        hrChart.update('none');
    }

    // Update current workout data
    currentWorkout.hrData = [...hrData];
    currentWorkout.avgHR = avgHR;
    currentWorkout.maxHR = Math.max(...hrData);
    currentWorkout.duration = elapsed;
    currentWorkout.calories = calories;
}

/**
 * Calculate calories using Karvonen formula (used in exercise physiology research)
 * This is more accurate than the basic HR * 0.6 formula
 */
function calculateCaloriesFromHeartRate(avgHR, durationSeconds, age = 28, weightKg = 72, isMale = true) {
    if (durationSeconds === 0) return 0;

    const maxHR = 220 - age;
    const restingHR = 60;
    const hrrSize = maxHR - restingHR;
    const hrIntensity = (avgHR - restingHR) / hrrSize;

    // Basal Metabolic Rate (BMR) using Mifflin-St Jeor equation
    let bmr;
    if (isMale) {
        bmr = 10 * weightKg + 6.25 * 175 - 5 * age + 5;
    } else {
        bmr = 10 * weightKg + 6.25 * 165 - 5 * age - 161;
    }

    // MET value (metabolic equivalent) based on intensity
    const met = Math.max(1, 1 + (hrIntensity * 14));
    
    // Calories per minute
    const caloriesPerMinute = (bmr / 1440) * met;
    
    // Total calories
    const totalCalories = caloriesPerMinute * (durationSeconds / 60);
    
    return Math.round(totalCalories * 10) / 10; // Round to 1 decimal
}

// Format duration
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Stop workout
function stopWorkout() {
    if (!workoutActive) return;

    showConfirmDialog('End this workout session?', () => {
        workoutActive = false;
        clearInterval(workoutInterval);

        // Save to history
        currentWorkout.endTime = new Date().toISOString();
        workoutHistory.unshift(currentWorkout);
        
        // Save to localStorage
        saveWorkoutHistory();

        // Reset UI
        document.getElementById('startBtn').style.display = 'inline-block';
        document.getElementById('stopBtn').style.display = 'none';
        setWorkoutTypeDisabled(false);

        // Update stats
        updateHeaderStats();

        // Show completion message with data source info
        showAlert(`Workout complete! Duration: ${formatDuration(currentWorkout.duration)}, Avg HR: ${currentWorkout.avgHR} bpm (Real data from ${currentWorkout.researchSubject})`);

        currentWorkout = null;
    });
}

// Workout type cards
function selectWorkoutType(type) {
    const input = document.getElementById('workoutType');
    const cards = document.querySelectorAll('.workout-type-card');
    if (!input || cards.length === 0) return;

    if (cards[0].disabled) return;

    input.value = type;
    cards.forEach(card => {
        card.classList.toggle('active', card.dataset.type === type);
    });
}

function setWorkoutTypeDisabled(disabled) {
    const cards = document.querySelectorAll('.workout-type-card');
    if (cards.length === 0) return;

    cards.forEach(card => {
        card.disabled = disabled;
        if (disabled) {
            card.classList.add('is-disabled');
        } else {
            card.classList.remove('is-disabled');
        }
    });
}

// Get real-time coaching
async function getRealtimeCoaching(workout = null) {
    // Use provided workout or current workout
    const targetWorkout = workout || currentWorkout;
    if (!targetWorkout) {
        showAlert('No workout data available for feedback.');
        return;
    }

    // Determine if this is real-time or historical
    const isRealtime = targetWorkout === currentWorkout && workoutActive;
    const feedbackType = isRealtime ? 'real-time' : 'post-workout';

    // Ensure we have a chat session
    if (isRealtime) {
        if (!currentChatId || chatSessions.length === 0) {
            createNewChatSession();
        }
    } else {
        createNewChatSession();
        const analysisDate = new Date(targetWorkout.startTime).toLocaleString();
        const currentSession = getCurrentChatSession();
        if (currentSession) {
            currentSession.title = `Analysis - ${analysisDate}`;
            currentSession.updatedAt = new Date().toISOString();
            saveChatSessions();
        }
    }

    const currentSession = getCurrentChatSession();
    if (!currentSession) return;

    const coachDiv = document.getElementById('coachResponses');

    // Switch to coach tab
    switchTab('coach');
    const coachTab = document.querySelector('.tab[data-tab="coach"]');
    if (coachTab) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        coachTab.classList.add('active');
    }
    
    // Build detailed workout data message with all metrics and heart rate zone analysis
    const hrZone = getHeartRateZone(targetWorkout.avgHR, targetWorkout.maxHR);
    const hrPercentage = Math.round((targetWorkout.avgHR / targetWorkout.maxHR) * 100);
    
    // Different prompts for real-time vs historical analysis
    let workoutDataDetails;
    if (isRealtime) {
        // REAL-TIME: Focus on immediate adjustments
        const currentHR = hrData[hrData.length - 1];
        const currentZone = getHRZone(currentHR);
        workoutDataDetails = `🔴 REAL-TIME WORKOUT IN PROGRESS:
${targetWorkout.type.toUpperCase()} | ${formatDuration(targetWorkout.duration)} elapsed
⏰ Current HR: ${currentHR} bpm (Zone ${currentZone})
📊 Average so far: ${targetWorkout.avgHR} bpm (${hrPercentage}%)

⚠️ RIGHT NOW: Should I slow down, maintain pace, or push harder?`;
    } else {
        // HISTORICAL: Focus on review and future recommendations
        workoutDataDetails = `📋 COMPLETED WORKOUT REVIEW:
${targetWorkout.type.toUpperCase()} | ${formatDuration(targetWorkout.duration)}
❤️ HR: ${targetWorkout.avgHR} bpm avg (${hrPercentage}%) | ${targetWorkout.maxHR} bpm peak
📈 Zone ${hrZone.zone} - ${hrZone.name} | ${targetWorkout.calories} kcal

💡 How did I do? What should I focus on NEXT time?`;
    }
    
    // Create workout context for AI system prompt
    const workoutContext = {
        type: targetWorkout.type.toUpperCase(),
        avgHR: targetWorkout.avgHR,
        maxHR: targetWorkout.maxHR,
        duration: targetWorkout.duration,
        calories: targetWorkout.calories,
        isRealtime: isRealtime  // Pass this to system prompt
    };
    
    // Create user message with full workout data
    const userMessage = {
        role: 'user',
        content: workoutDataDetails,
        timestamp: new Date().toISOString()
    };
    currentSession.messages.push(userMessage);
    currentSession.updatedAt = new Date().toISOString();

    if (!coachDiv || coachDiv.dataset.chatId !== currentChatId) {
        renderChatHistory();
    } else {
        coachDiv.appendChild(createUserMessage(userMessage.content));
        coachDiv.scrollTop = coachDiv.scrollHeight;
        setChatRenderLock();
    }

    const loadingMsg = createCoachMessage('Analyzing...', true);
    loadingMsg.dataset.loading = 'true';
    coachDiv.appendChild(loadingMsg);

    try {
        // Call API with conversation history AND workout context for enhanced prompts
        const response = await callOpenRouterAPI('', currentSession.messages, workoutContext);
        
        // Save AI response to chat
        const aiMessage = {
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        };
        currentSession.messages.push(aiMessage);
        currentSession.updatedAt = new Date().toISOString();
        
        // Update chat title if first message
        updateChatTitle(currentChatId);
        
        // Save to localStorage
        saveChatSessions();
        
        const loadingEl = coachDiv.querySelector('[data-loading="true"]');
        if (loadingEl) loadingEl.remove();
        coachDiv.appendChild(createCoachMessage(aiMessage.content, false));
        coachDiv.scrollTop = coachDiv.scrollHeight;
        setChatRenderLock();

        renderChatSidebar();
    } catch (err) {
        const loadingEl = coachDiv.querySelector('[data-loading="true"]');
        if (loadingEl) loadingEl.remove();
        coachDiv.appendChild(createCoachMessage('Error: ' + err.message, false));
        setChatRenderLock();
    }
}

// Ask AI coach
async function askCoach() {
    const question = document.getElementById('coachQuestion').value.trim();
    if (!question) {
        showAlert('Please enter a question for the AI coach.');
        return;
    }

    // Ensure we have a chat session
    if (!currentChatId || chatSessions.length === 0) {
        createNewChatSession();
    }

    const currentSession = getCurrentChatSession();
    if (!currentSession) return;

    // Save user message to current chat session
    const userMessage = {
        role: 'user',
        content: question,
        timestamp: new Date().toISOString()
    };
    currentSession.messages.push(userMessage);
    currentSession.updatedAt = new Date().toISOString();

    const coachDiv = document.getElementById('coachResponses');

    if (!coachDiv || coachDiv.dataset.chatId !== currentChatId) {
        renderChatHistory();
    } else {
        coachDiv.appendChild(createUserMessage(userMessage.content));
        coachDiv.scrollTop = coachDiv.scrollHeight;
        setChatRenderLock();
    }

    const loadingMsg = createCoachMessage('Thinking...', true);
    loadingMsg.dataset.loading = 'true';
    coachDiv.appendChild(loadingMsg);

    // Build context from workout history
    const recentWorkouts = workoutHistory.slice(0, 5);
    const historyContext = recentWorkouts.length > 0
        ? `Recent workout history:\n${recentWorkouts.map(w =>
            `- ${w.type}: ${formatDuration(w.duration)}, Avg HR: ${w.avgHR} bpm, ${w.calories} kcal`
          ).join('\n')}`
        : 'No workout history available.';

    const prompt = `You are an expert AI fitness coach. Answer this question based on the user's workout data:

${historyContext}

User's Question: ${question}

Provide a detailed, personalized response with actionable advice.`;

    try {
        const response = await callOpenRouterAPI(prompt, currentSession.messages);
        
        // Save AI response to current chat session
        const aiMessage = {
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        };
        currentSession.messages.push(aiMessage);
        currentSession.updatedAt = new Date().toISOString();
        
        // Update chat title if first message
        updateChatTitle(currentChatId);
        
        // Save to localStorage
        saveChatSessions();
        
        const loadingEl = coachDiv.querySelector('[data-loading="true"]');
        if (loadingEl) loadingEl.remove();
        coachDiv.appendChild(createCoachMessage(aiMessage.content, false));
        coachDiv.scrollTop = coachDiv.scrollHeight;
        setChatRenderLock();

        renderChatSidebar();
        
        // Clear input
        document.getElementById('coachQuestion').value = '';
    } catch (err) {
        const loadingEl = coachDiv.querySelector('[data-loading="true"]');
        if (loadingEl) loadingEl.remove();
        coachDiv.appendChild(createCoachMessage('Error: ' + err.message, false));
        setChatRenderLock();
    }
}

// Call OpenRouter API with conversation history support
async function callOpenRouterAPI(prompt, conversationHistory = null, workoutContext = null) {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'YOUR_API_KEY_HERE') {
        throw new Error('Please set your OpenRouter API key in the config.js file');
    }

    // Build messages array with enhanced system prompt
    const messages = [
        {
            role: 'system',
            content: getFitnessCoachSystemPrompt()
        }
    ];
    
    // Add workout-specific context if provided
    if (workoutContext) {
        const contextType = workoutContext.isRealtime ? 'real-time' : 'historical';
        messages.push({
            role: 'system',
            content: `${getWorkoutTypeContext(workoutContext.type)}${getHeartRateContext(workoutContext)}

${workoutContext.isRealtime 
    ? '🔴 REAL-TIME MODE: User is CURRENTLY working out. Focus on IMMEDIATE actions (slow down NOW, maintain for 5 min, etc). Prioritize SAFETY - warn if HR too high for duration.' 
    : '📋 REVIEW MODE: Workout is COMPLETED. Focus on overall assessment, what went well/wrong, and recommendations for NEXT time. No immediate actions needed.'}`
        });
    }

    // Add conversation history if provided (last 10 messages to keep context manageable)
    if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-10);
        messages.push(...recentHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        })));
    }

    // Add current prompt if not already in history
    if (!conversationHistory) {
        messages.push({
            role: 'user',
            content: prompt
        });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/Gg-wo/MyApplication',
            'X-Title': 'FitMind AI Coach'
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: messages,
            temperature: 0.7,  // Balanced creativity and consistency
            max_tokens: 250,   // Limit for concise responses (2-4 sentences)
            top_p: 0.9         // Slight randomness for natural responses
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to get AI response');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Render chat history for current session
function renderChatHistory() {
    const coachDiv = document.getElementById('coachResponses');
    coachDiv.innerHTML = '';
    
    const currentSession = getCurrentChatSession();
    
    coachDiv.dataset.chatId = currentChatId || '';

    if (!currentSession || currentSession.messages.length === 0) {
        coachDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 14px; text-align: center; padding: 40px 20px;">💬 Start a conversation with your AI coach</div>';
        return;
    }
    
    // Show/hide suggestion buttons based on message count
    const suggestionButtons = document.getElementById('suggestionButtons');
    if (suggestionButtons) {
        // Show suggestions only if there's just the welcome message (1 message)
        if (currentSession.messages.length === 1 && currentSession.messages[0].role === 'assistant') {
            suggestionButtons.style.display = 'flex';
        } else {
            suggestionButtons.style.display = 'none';
        }
    }
    
    // Render each message in the current session
    currentSession.messages.forEach(msg => {
        if (msg.role === 'user') {
            const userMsg = createUserMessage(msg.content);
            coachDiv.appendChild(userMsg);
        } else if (msg.role === 'assistant') {
            const aiMsg = createCoachMessage(msg.content, false);
            coachDiv.appendChild(aiMsg);
        }
    });
    
    // Scroll to bottom
    coachDiv.scrollTop = coachDiv.scrollHeight;
}

// Render chat sidebar with list of sessions
function renderChatSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    const chatList = document.getElementById('chatList');
    if (!sidebar || !chatList) {
        console.error('❌ chatSidebar or chatList element not found');
        return;
    }
    
    console.log('📝 Rendering sidebar, chatSessions:', chatSessions.length);
    
    // Add header with close button if not present
    if (!sidebar.querySelector('.chat-sidebar-header')) {
        const header = document.createElement('div');
        header.className = 'chat-sidebar-header';
        header.innerHTML = `
            <h3>💬 Chat History</h3>
            <button class="chat-sidebar-close" onclick="toggleChatSidebar()" title="Close">✕</button>
        `;
        sidebar.insertBefore(header, chatList);
    }
    
    chatList.innerHTML = '';
    
    if (chatSessions.length === 0) {
        chatList.innerHTML = '<p style="color: var(--text-secondary); padding: 12px; text-align: center; font-size: 14px;">No chats yet</p>';
        console.log('✅ Showing "No chats yet" message');
        return;
    }
    
    console.log('✅ Rendering', chatSessions.length, 'chat sessions');
    
    chatSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'chat-item' + (session.id === currentChatId ? ' active' : '');
        
        const content = document.createElement('div');
        content.className = 'chat-item-content';
        content.onclick = () => {
            switchChatSession(session.id);
            toggleChatSidebar();
        };
        
        const title = document.createElement('div');
        title.className = 'chat-item-title';
        title.textContent = session.title;
        
        const meta = document.createElement('div');
        meta.className = 'chat-item-meta';
        meta.textContent = `${session.messages.length} messages`;
        
        content.appendChild(title);
        content.appendChild(meta);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-delete-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete chat';
        deleteBtn.onclick = (e) => {
            console.log('🖱️ Delete button CLICKED for session:', session.id);
            e.stopPropagation();
            e.preventDefault();
            console.log('📢 Showing confirm dialog...');
            showConfirmDialog('Confirm to delete this chat?', () => {
                console.log('✔️ User CONFIRMED deletion!');
                deleteChatSession(session.id);
            });
            return false;
        };
        
        item.appendChild(content);
        item.appendChild(deleteBtn);
        chatList.appendChild(item);
    });
}

// Create user message element
function createUserMessage(content) {
    const wrapper = document.createElement('div');
    wrapper.className = 'user-message';
    
    const bubble = document.createElement('div');
    bubble.className = 'user-message-bubble';
    bubble.textContent = content;
    
    wrapper.appendChild(bubble);
    return wrapper;
}

// Create coach message element
function createCoachMessage(content, isLoading) {
    const wrapper = document.createElement('div');
    wrapper.className = 'coach-message' + (isLoading ? ' loading' : '');
    
    const bubble = document.createElement('div');
    bubble.className = 'coach-message-bubble';

    const header = document.createElement('div');
    header.className = 'coach-header';
    header.innerHTML = `
        <div class="coach-avatar">🤖</div>
        <span>AI Coach</span>
    `;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'coach-content';

    if (isLoading) {
        contentDiv.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
    } else {
        contentDiv.innerHTML = marked.parse(content);
    }

    bubble.appendChild(header);
    bubble.appendChild(contentDiv);
    wrapper.appendChild(bubble);

    return wrapper;
}

// Render workout history
function renderHistory() {
    const historyList = document.getElementById('historyList');

    if (workoutHistory.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <svg fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"></path>
                </svg>
                <h3>No workouts yet</h3>
                <p>Start your first workout to see your history here!</p>
            </div>
        `;
        return;
    }

    const historyHTML = workoutHistory.map((workout, index) => {
        const date = new Date(workout.startTime);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const workoutIcons = {
            'running': '🏃',
            'cycling': '🚴',
            'swimming': '🏊',
            'strength': '💪',
            'yoga': '🧘',
            'hiit': '⚡'
        };

        // Show real research data source
        const dataSourceBadge = `<div style="font-size: 11px; color: #4ade80; margin-top: 4px;">📊 Real research data (${workout.researchSubject})</div>`;

        return `
            <div class="history-item">
                <div class="history-header">
                    <div>
                        <div class="history-type">${workoutIcons[workout.type] || '🏃'} ${workout.type.charAt(0).toUpperCase() + workout.type.slice(1)}</div>
                        <div class="history-date">${dateStr} at ${timeStr}</div>
                        ${dataSourceBadge}
                    </div>
                </div>
                <div class="history-stats">
                    <div class="history-stat">
                        <span class="history-stat-label">Duration</span>
                        <span class="history-stat-value">${formatDuration(workout.duration)}</span>
                    </div>
                    <div class="history-stat">
                        <span class="history-stat-label">Avg HR</span>
                        <span class="history-stat-value">${workout.avgHR} bpm</span>
                    </div>
                    <div class="history-stat">
                        <span class="history-stat-label">Max HR</span>
                        <span class="history-stat-value">${workout.maxHR} bpm</span>
                    </div>
                    <div class="history-stat">
                        <span class="history-stat-label">Calories</span>
                        <span class="history-stat-value">${workout.calories} kcal</span>
                    </div>
                </div>
                <button onclick="getRealtimeCoaching(workoutHistory[${index}])" style="width: 100%; margin-top: 12px; padding: 8px; background: var(--accent-primary); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">🤖 Get AI Feedback</button>
            </div>
        `;
    }).join('');

    historyList.innerHTML = `<div class="history-grid">${historyHTML}</div>`;
}

// Update header stats (deprecated - stats now in Progress tab)
function updateHeaderStats() {
    // No longer needed - header stats removed
    // Stats are now displayed in the Progress tab
}

// ============================================================
// PROGRESS TRACKING SYSTEM
// ============================================================

/**
 * Calculate current workout streak (consecutive days with workouts)
 */
function calculateWorkoutStreak() {
    if (workoutHistory.length === 0) return 0;
    
    const sortedWorkouts = [...workoutHistory].sort((a, b) => 
        new Date(b.startTime) - new Date(a.startTime)
    );
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < sortedWorkouts.length; i++) {
        const workoutDate = new Date(sortedWorkouts[i].startTime);
        workoutDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((currentDate - workoutDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === streak) {
            streak++;
            currentDate = new Date(workoutDate);
        } else if (daysDiff > streak) {
            break;
        }
    }
    
    return streak;
}

/**
 * Calculate personal records from workout history
 */
function calculatePersonalRecords() {
    if (workoutHistory.length === 0) {
        return {
            longestDuration: null,
            highestAvgHR: null,
            mostCalories: null,
            mostFrequentType: null
        };
    }
    
    // Longest workout
    const longestWorkout = workoutHistory.reduce((max, w) => w.duration > max.duration ? w : max);
    
    // Highest average HR
    const highestHRWorkout = workoutHistory.reduce((max, w) => w.avgHR > max.avgHR ? w : max);
    
    // Most calories burned
    const mostCaloriesWorkout = workoutHistory.reduce((max, w) => w.calories > max.calories ? w : max);
    
    // Most frequent workout type
    const typeCounts = {};
    workoutHistory.forEach(w => {
        typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
    });
    const mostFrequent = Object.entries(typeCounts).reduce((max, [type, count]) => 
        count > max.count ? { type, count } : max, { type: null, count: 0 }
    );
    
    return {
        longestDuration: longestWorkout,
        highestAvgHR: highestHRWorkout,
        mostCalories: mostCaloriesWorkout,
        mostFrequentType: mostFrequent
    };
}

/**
 * Calculate heart rate zone distribution across all workouts
 */
function calculateZoneDistribution() {
    if (workoutHistory.length === 0) {
        return [0, 0, 0, 0, 0];
    }
    
    const zoneMinutes = [0, 0, 0, 0, 0]; // Minutes in each zone
    
    workoutHistory.forEach(workout => {
        if (!workout.hrData || workout.hrData.length === 0) {
            // Fallback: estimate zone based on avgHR
            const zone = getHRZone(workout.avgHR) - 1;
            const minutes = Math.floor(workout.duration / 60);
            zoneMinutes[zone] += minutes;
        } else {
            // Precise calculation from HR data
            workout.hrData.forEach(hr => {
                const zone = getHRZone(hr) - 1;
                zoneMinutes[zone] += (1 / 60); // Each data point is 1 second
            });
        }
    });
    
    return zoneMinutes.map(m => Math.round(m));
}

/**
 * Get workouts grouped by day for the current week
 */
function getWeeklyActivity() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weekWorkouts = workoutHistory.filter(w => 
        new Date(w.startTime).getTime() > oneWeekAgo
    );
    
    // Group by day
    const dayMap = {};
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    weekWorkouts.forEach(w => {
        const date = new Date(w.startTime);
        const dayKey = date.toLocaleDateString();
        if (!dayMap[dayKey]) {
            dayMap[dayKey] = {
                dayName: days[date.getDay()],
                date: dayKey,
                workouts: [],
                totalMinutes: 0,
                totalCalories: 0
            };
        }
        dayMap[dayKey].workouts.push(w);
        dayMap[dayKey].totalMinutes += Math.floor(w.duration / 60);
        dayMap[dayKey].totalCalories += w.calories;
    });
    
    return Object.values(dayMap).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Render complete progress dashboard
 */
function renderProgressDashboard() {
    renderDashboardGreeting();
    renderDashboardLive();
    renderDashboardStats();
    renderDashboardRecovery();
    renderRecentWorkouts();

    if (!dashboardLiveInterval) {
        dashboardLiveInterval = setInterval(renderDashboardLive, 1000);
    }
}

function renderDashboardGreeting() {
    const greetingEl = document.getElementById('dashboardGreeting');
    const subtextEl = document.getElementById('dashboardSubtext');
    if (!greetingEl || !subtextEl) return;

    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 18) greeting = 'Good afternoon';
    if (hour >= 18) greeting = 'Good evening';

    const profile = getLocalProfile();
    const name = profile?.name ? profile.name.trim() : '';
    const greetingName = name ? `${greeting}, ${name}` : greeting;

    greetingEl.textContent = greetingName;
    subtextEl.textContent = "Let's crush your goals today";
}

function renderDashboardLive() {
    const hrEl = document.getElementById('liveHeartRate');
    const zoneNameEl = document.getElementById('liveZoneName');
    const zonePercentEl = document.getElementById('liveZonePercent');
    const zoneProgressEl = document.getElementById('liveZoneProgress');
    const zoneMarkerEl = document.getElementById('liveZoneMarker');
    if (!hrEl || !zoneNameEl || !zonePercentEl || !zoneProgressEl || !zoneMarkerEl) return;

    let currentHR = 70;
    if (workoutActive && hrData.length > 0) {
        currentHR = hrData[hrData.length - 1];
    } else {
        if (!dashboardYogaSession && researchDataset) {
            dashboardYogaSession = getResearchSession('yoga');
            dashboardYogaIndex = 0;
        }

        if (dashboardYogaSession && dashboardYogaSession.heartRateData?.length) {
            currentHR = dashboardYogaSession.heartRateData[dashboardYogaIndex] || currentHR;
            const noiseRoll = Math.random();
            const noise = noiseRoll < 0.15 ? -1 : noiseRoll > 0.85 ? 1 : 0;
            currentHR = Math.max(0, Math.min(200, currentHR + noise));
            dashboardYogaIndex = (dashboardYogaIndex + 1) % dashboardYogaSession.heartRateData.length;
        } else if (workoutHistory.length > 0) {
            currentHR = workoutHistory[0].avgHR || currentHR;
        }
    }

    const minHr = 0;
    const maxHr = 200;
    const percent = Math.max(0, Math.min(100, Math.round((currentHR / maxHr) * 100)));
    const zone = getHRZone(currentHR);
    const zoneNames = {
        1: 'Rest',
        2: 'Fat Burn',
        3: 'Cardio',
        4: 'Threshold',
        5: 'Peak'
    };

    hrEl.textContent = currentHR;
    zoneNameEl.textContent = `Zone: ${zoneNames[zone]}`;
    zonePercentEl.textContent = percent;
    zoneProgressEl.style.width = `${percent}%`;
    zoneMarkerEl.style.left = `${percent}%`;
}

function renderDashboardStats() {
    const workoutsEl = document.getElementById('weeklyWorkouts');
    const caloriesEl = document.getElementById('weeklyCalories');
    const minutesEl = document.getElementById('weeklyMinutes');
    const goalEl = document.getElementById('weeklyGoal');
    if (!workoutsEl || !caloriesEl || !minutesEl || !goalEl) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const weekWorkouts = workoutHistory.filter(w => {
        const date = new Date(w.startTime || w.timestamp || w.date || w.endTime || Date.now());
        return date >= weekAgo;
    });

    const weeklyWorkouts = weekWorkouts.length;
    const weeklyCalories = Math.round(weekWorkouts.reduce((sum, w) => sum + (w.calories || 0), 0));
    const weeklyMinutes = weekWorkouts.reduce((sum, w) => sum + Math.floor((w.duration || 0) / 60), 0);

    const profile = getLocalProfile() || getDefaultProfile();
    const target = profile.workoutFrequency || 3;
    const goalPercent = target > 0 ? Math.min(100, Math.round((weeklyWorkouts / target) * 100)) : 0;

    workoutsEl.textContent = weeklyWorkouts;
    caloriesEl.textContent = weeklyCalories;
    minutesEl.textContent = weeklyMinutes;
    goalEl.textContent = `${goalPercent}%`;
}

function renderDashboardRecovery() {
    const scoreEl = document.getElementById('recoveryScore');
    const labelEl = document.getElementById('recoveryLabel');
    const messageEl = document.getElementById('recoveryMessage');
    const coachMessageEl = document.getElementById('coachMessage');
    const coachTimeEl = document.getElementById('coachTime');
    if (!scoreEl || !labelEl || !messageEl || !coachMessageEl || !coachTimeEl) return;

    const weeklyMinutes = workoutHistory
        .filter(w => new Date(w.startTime || w.timestamp || w.date || w.endTime || Date.now()) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((sum, w) => sum + Math.floor((w.duration || 0) / 60), 0);

    const loadScore = Math.min(100, weeklyMinutes * 2);
    const recoveryScore = Math.max(45, 100 - Math.round(loadScore * 0.6));

    let label = 'Good';
    let message = 'Moderate intensity recommended';
    let coachMessage = "Great job on your recovery score! Keep a balanced mix of training and rest days to stay consistent and energized.";

    if (recoveryScore < 60) {
        label = 'Needs Rest';
        message = 'Prioritize recovery and light movement';
        coachMessage = "Your body could use extra recovery. Consider a lighter session today or focus on mobility work to recharge.";
    } else if (recoveryScore < 80) {
        label = 'Moderate';
        message = 'Steady effort is a smart move';
        coachMessage = "Nice work staying active. Aim for steady sessions and listen to your body to keep improving safely.";
    }

    scoreEl.textContent = recoveryScore;
    labelEl.textContent = label;
    messageEl.textContent = message;
    coachMessageEl.textContent = coachMessage;
    coachTimeEl.textContent = 'just now';
}

function renderRecentWorkouts() {
    const listEl = document.getElementById('recentWorkoutsList');
    if (!listEl) return;

    if (!workoutHistory.length) {
        listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 12px;">No workouts yet. Start one to see it here.</p>';
        return;
    }

    const workoutIcons = {
        running: '🏃',
        cycling: '🚴',
        swimming: '🏊',
        strength: '💪',
        yoga: '🧘',
        hiit: '⚡'
    };

    const sorted = [...workoutHistory].sort((a, b) => {
        const da = new Date(a.startTime || a.timestamp || a.date || a.endTime || Date.now());
        const db = new Date(b.startTime || b.timestamp || b.date || b.endTime || Date.now());
        return db - da;
    });

    const recent = sorted.slice(0, 3);
    listEl.innerHTML = recent.map(w => {
        const date = new Date(w.startTime || w.timestamp || w.date || w.endTime || Date.now());
        const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const minutes = Math.max(1, Math.floor((w.duration || 0) / 60));
        const icon = workoutIcons[w.type] || '🏃';
        const title = w.type ? w.type.charAt(0).toUpperCase() + w.type.slice(1) : 'Workout';
        const avgHr = w.avgHR || '--';
        const calories = Math.round(w.calories || 0);

        return `
            <div class="recent-item">
                <div class="recent-left">
                    <div class="recent-icon">${icon}</div>
                    <div>
                        <div class="recent-title">${title}</div>
                        <div class="recent-meta">
                            <span>${minutes} min</span>
                            <span>❤ ${avgHr} bpm</span>
                            <span>${calories} kcal</span>
                        </div>
                    </div>
                </div>
                <div class="recent-date">${dateLabel}</div>
            </div>
        `;
    }).join('');
}

/**
 * Render personal records section
 */
function renderPersonalRecords() {
    const records = calculatePersonalRecords();
    const recordsDiv = document.getElementById('personalRecords');
    
    if (!records.longestDuration) {
        recordsDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No workouts yet. Complete your first workout to see records!</p>';
        return;
    }
    
    const workoutIcons = {
        'running': '🏃',
        'cycling': '🚴',
        'swimming': '🏊',
        'strength': '💪',
        'yoga': '🧘',
        'hiit': '⚡'
    };
    
    recordsDiv.innerHTML = `
        <div style="display: grid; gap: 12px;">
            <div class="record-item">
                <span class="record-label">⏱️ Longest Workout</span>
                <span class="record-value">${formatDuration(records.longestDuration.duration)} (${workoutIcons[records.longestDuration.type] || '🏃'} ${records.longestDuration.type})</span>
            </div>
            <div class="record-item">
                <span class="record-label">❤️ Highest Avg HR</span>
                <span class="record-value">${records.highestAvgHR.avgHR} bpm (${workoutIcons[records.highestAvgHR.type] || '🏃'} ${records.highestAvgHR.type})</span>
            </div>
            <div class="record-item">
                <span class="record-label">🔥 Most Calories</span>
                <span class="record-value">${Math.round(records.mostCalories.calories)} kcal (${workoutIcons[records.mostCalories.type] || '🏃'} ${records.mostCalories.type})</span>
            </div>
            <div class="record-item">
                <span class="record-label">⭐ Favorite Activity</span>
                <span class="record-value">${workoutIcons[records.mostFrequentType.type] || '🏃'} ${records.mostFrequentType.type.charAt(0).toUpperCase() + records.mostFrequentType.type.slice(1)} (${records.mostFrequentType.count}x)</span>
            </div>
        </div>
    `;
}

/**
 * Render heart rate zone distribution pie chart
 */
let zoneChart = null;
function renderZoneChart() {
    const zoneMinutes = calculateZoneDistribution();
    const canvas = document.getElementById('zoneChart');
    
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (zoneChart) {
        zoneChart.destroy();
    }
    
    // Check if there's any data
    const hasData = zoneMinutes.some(m => m > 0);
    
    if (!hasData) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('No workout data yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    zoneChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Zone 1: Recovery', 'Zone 2: Fat Burn', 'Zone 3: Aerobic', 'Zone 4: Anaerobic', 'Zone 5: Max Effort'],
            datasets: [{
                data: zoneMinutes,
                backgroundColor: [
                    'rgba(74, 222, 128, 0.8)',   // Zone 1 - Green
                    'rgba(251, 191, 36, 0.8)',   // Zone 2 - Yellow
                    'rgba(251, 146, 60, 0.8)',   // Zone 3 - Orange
                    'rgba(248, 113, 113, 0.8)',  // Zone 4 - Red
                    'rgba(220, 38, 38, 0.8)'     // Zone 5 - Dark Red
                ],
                borderColor: 'rgba(30, 30, 46, 0.8)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
                        padding: 12,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const minutes = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percent = total > 0 ? ((minutes / total) * 100).toFixed(1) : 0;
                            return ` ${minutes} min (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Get activity data for a specific time period
 */
function getActivityDataForPeriod(days) {
    const now = Date.now();
    const periodStart = now - (days * 24 * 60 * 60 * 1000);
    
    const periodWorkouts = workoutHistory.filter(w => 
        new Date(w.startTime).getTime() >= periodStart
    );
    
    // Determine aggregation level based on period length
    let aggregation = 'daily';
    if (days > 90) {
        aggregation = 'monthly';
    } else if (days > 30) {
        aggregation = 'weekly';
    }
    
    // Create date buckets
    const buckets = new Map();
    
    periodWorkouts.forEach(workout => {
        const date = new Date(workout.startTime);
        let key;
        
        if (aggregation === 'daily') {
            key = date.toLocaleDateString();
        } else if (aggregation === 'weekly') {
            // Get Monday of the week
            const monday = new Date(date);
            const day = monday.getDay();
            const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
            monday.setDate(diff);
            monday.setHours(0, 0, 0, 0);
            key = monday.toLocaleDateString();
        } else { // monthly
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        
        if (!buckets.has(key)) {
            buckets.set(key, {
                date: key,
                workouts: [],
                count: 0,
                totalDuration: 0,
                totalCalories: 0
            });
        }
        
        const bucket = buckets.get(key);
        bucket.workouts.push(workout);
        bucket.count++;
        bucket.totalDuration += Math.floor(workout.duration / 60);
        bucket.totalCalories += workout.calories;
    });
    
    // Fill in missing dates with zero values
    const sortedData = [];
    let currentDate = new Date(periodStart);
    const endDate = new Date(now);
    
    while (currentDate <= endDate) {
        let key;
        
        if (aggregation === 'daily') {
            key = currentDate.toLocaleDateString();
        } else if (aggregation === 'weekly') {
            const monday = new Date(currentDate);
            const day = monday.getDay();
            const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
            monday.setDate(diff);
            monday.setHours(0, 0, 0, 0);
            key = monday.toLocaleDateString();
        } else { // monthly
            key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        }
        
        const existing = buckets.get(key);
        if (existing && !sortedData.find(d => d.date === key)) {
            sortedData.push(existing);
        } else if (!sortedData.find(d => d.date === key)) {
            sortedData.push({
                date: key,
                workouts: [],
                count: 0,
                totalDuration: 0,
                totalCalories: 0
            });
        }
        
        // Increment date based on aggregation
        if (aggregation === 'daily') {
            currentDate.setDate(currentDate.getDate() + 1);
        } else if (aggregation === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7);
        } else { // monthly
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }
    
    // Calculate average heart rate for the period
    const totalHeartRateSum = periodWorkouts.reduce((sum, w) => sum + (w.avgHeartRate || 0), 0);
    const avgHeartRate = periodWorkouts.length > 0 ? Math.round(totalHeartRateSum / periodWorkouts.length) : 0;
    
    return {
        data: sortedData,
        aggregation: aggregation,
        totalWorkouts: periodWorkouts.length,
        avgPerWeek: periodWorkouts.length / (days / 7),
        totalCalories: periodWorkouts.reduce((sum, w) => sum + w.calories, 0),
        avgHeartRate: avgHeartRate
    };
}

/**
 * Format date label based on aggregation level
 */
function formatDateLabel(dateStr, aggregation) {
    const date = new Date(dateStr);
    
    if (aggregation === 'daily') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (aggregation === 'weekly') {
        const weekNum = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
        return `Week ${weekNum}`;
    } else { // monthly
        const [year, month] = dateStr.split('-');
        return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
}

/**
 * Render activity overview chart with selected time period
 */
let activityChart = null;
function renderActivityOverview() {
    const periodSelector = document.getElementById('periodSelector');
    const days = parseInt(periodSelector.value);
    
    const activityData = getActivityDataForPeriod(days);
    
    // Update summary stats
    document.getElementById('periodTotalWorkouts').textContent = activityData.totalWorkouts;
    document.getElementById('periodAvgPerWeek').textContent = activityData.avgPerWeek.toFixed(1);
    document.getElementById('periodAvgHeartRate').textContent = activityData.avgHeartRate > 0 ? activityData.avgHeartRate : '--';
    document.getElementById('periodTotalCalories').textContent = Math.round(activityData.totalCalories);
    
    // Render chart
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (activityChart) {
        activityChart.destroy();
    }
    
    // Prepare chart data
    const labels = activityData.data.map(d => formatDateLabel(d.date, activityData.aggregation));
    const counts = activityData.data.map(d => d.count);
    const durations = activityData.data.map(d => d.totalDuration);
    const calories = activityData.data.map(d => Math.round(d.totalCalories));
    
    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Workouts',
                data: counts,
                borderColor: 'rgba(0, 212, 255, 1)',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgba(0, 212, 255, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 46, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(0, 212, 255, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const index = context.dataIndex;
                            return [
                                `Workouts: ${counts[index]}`,
                                `Duration: ${durations[index]} min`,
                                `Calories: ${calories[index]} kcal`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: activityData.aggregation === 'daily' ? 10 : 15
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        stepSize: 1,
                        precision: 0
                    },
                    title: {
                        display: true,
                        text: 'Number of Workouts',
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// Handle suggestion button clicks
function useSuggestion(fullQuestion) {
    const input = document.getElementById('coachQuestion');
    if (input) {
        input.value = fullQuestion;
        input.focus();
        // Optionally auto-submit
        // askCoach();
    }
}

// Handle suggestion button clicks
function useSuggestion(fullQuestion) {
    const input = document.getElementById('coachQuestion');
    if (input) {
        input.value = fullQuestion;
        input.focus();
        // Optionally auto-submit
        // askCoach();
    }
}

// Custom modal functions
function showAlert(message) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">Notice</div>
            <div class="modal-body">${message}</div>
            <div class="modal-actions">
                <button onclick="this.closest('.modal-overlay').remove()">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function showConfirmDialog(message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.textContent = 'Confirm';
    
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.textContent = message;
    
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => modal.remove();
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm';
    confirmBtn.onclick = () => {
        modal.remove();
        onConfirm(); // Call the function directly with proper closure
    };
    
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(actions);
    modal.appendChild(content);
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// SETTINGS MENU & USER PREFERENCES
// ============================================================

/**
 * Toggle settings menu visibility
 */
function toggleSettingsMenu() {
    const menu = document.getElementById('settingsMenu');
    const backdrop = document.getElementById('settingsMenuBackdrop');
    
    if (!menu || !backdrop) return;
    
    const isVisible = menu.style.display === 'block';
    
    if (isVisible) {
        menu.style.display = 'none';
        backdrop.style.display = 'none';
    } else {
        menu.style.display = 'block';
        backdrop.style.display = 'block';
        
        // Update user email display
        updateSettingsUI();
    }
}

/**
 * Update settings UI with current state
 */
function updateSettingsUI() {
    const userEmailEl = document.getElementById('userEmail');
    const authButton = document.getElementById('authButton');
    
    // Check if guest mode
    const isGuest = localStorage.getItem('fitmind_guest_mode') === 'true';
    
    if (window.auth && window.auth.currentUser) {
        const user = window.auth.currentUser;
        userEmailEl.textContent = user.email;
        userEmailEl.style.color = 'var(--text-secondary)';
        authButton.textContent = 'Sign Out';
        authButton.onclick = () => {
            if (window.firebaseSync) {
                window.firebaseSync.signOut();
            }
        };
    } else if (isGuest) {
        userEmailEl.textContent = '👤 Guest Mode';
        userEmailEl.style.color = 'var(--accent-primary)';
        authButton.textContent = 'Sign In';
        authButton.onclick = () => {
            localStorage.removeItem('fitmind_guest_mode');
            window.location.href = 'auth.html';
        };
    } else {
        userEmailEl.textContent = 'Not signed in';
        userEmailEl.style.color = 'var(--text-muted)';
        authButton.textContent = 'Sign In';
        authButton.onclick = () => {
            window.location.href = 'auth.html';
        };
    }
    
    // Load preference toggles from localStorage (works for everyone)
    const theme = localStorage.getItem('fitmind_theme') || 'dark';
    const notifications = localStorage.getItem('fitmind_notifications') !== 'false';
    
    document.getElementById('darkModeToggle').checked = theme === 'dark';
    document.getElementById('notificationsToggle').checked = notifications;
}

/**
 * Handle auth action (sign in or sign out)
 */
function handleAuthAction() {
    if (window.auth && window.auth.currentUser) {
        if (window.firebaseSync) {
            window.firebaseSync.signOut();
        }
    } else {
        // Clear guest mode when navigating to auth
        localStorage.removeItem('fitmind_guest_mode');
        window.location.href = 'auth.html';
    }
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
    const enabled = document.getElementById('darkModeToggle').checked;
    
    if (enabled) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
    
    // Save locally (works for both guest and logged-in users)
    localStorage.setItem('fitmind_theme', enabled ? 'dark' : 'light');
    
    // Also save to Firebase if logged in
    if (window.firebaseSync && window.firebaseSync.userPreferences) {
        window.firebaseSync.userPreferences.darkMode = enabled;
        if (window.firebaseSync.saveUserPreferences) {
            window.firebaseSync.saveUserPreferences();
        }
    }
    
    console.log(`✅ Theme switched to ${enabled ? 'dark' : 'light'} mode`);
}

/**
 * Toggle notifications
 */
function toggleNotifications() {
    const enabled = document.getElementById('notificationsToggle').checked;
    
    // Save locally (works for both guest and logged-in users)
    localStorage.setItem('fitmind_notifications', enabled ? 'true' : 'false');
    
    // Also save to Firebase if logged in
    if (window.firebaseSync && window.firebaseSync.userPreferences) {
        window.firebaseSync.userPreferences.notifications = enabled;
        if (window.firebaseSync.saveUserPreferences) {
            window.firebaseSync.saveUserPreferences();
        }
    }
    
    showAlert(enabled ? '🔔 Notifications enabled' : '🔕 Notifications disabled');
}

/**
 * Export all data as JSON
 */
function exportData() {
    const data = {
        workouts: workoutHistory,
        chats: chatSessions,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitmind-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showAlert('Data exported successfully!');
}

/**
 * Delete all local data
 */
function deleteAllData() {
    showConfirmDialog('⚠️ This will delete ALL your local workout and chat data. This action cannot be undone. Are you sure?', () => {
        const keysToClear = [
            getWorkoutHistoryStorageKey(),
            getChatSessionsStorageKey(),
            getCurrentChatIdStorageKey(),
            getProfileStorageKey()
        ];
        keysToClear.forEach(key => localStorage.removeItem(key));
        workoutHistory = [];
        chatSessions = [];
        currentChatId = null;
        
        // Reload page to reset state
        showAlert('All local data deleted. Page will reload...');
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    });
}

/**
 * Delete user account and cloud data
 */
function deleteAccount() {
    const user = window.auth && window.auth.currentUser;
    if (!user) {
        showAlert('Please sign in to delete your account.');
        return;
    }

    showConfirmDialog('⚠️ This will permanently delete your account and all cloud data. This action cannot be undone. Are you sure?', async () => {
        try {
            if (!window.firebaseSync || !window.firebaseSync.deleteAccount) {
                throw new Error('Cloud delete is unavailable.');
            }

            await window.firebaseSync.deleteAccount();

            localStorage.clear();
            workoutHistory = [];
            chatSessions = [];
            currentChatId = null;

            showAlert('Account deleted. Redirecting...');
            setTimeout(() => {
                window.location.href = 'auth.html';
            }, 1500);
        } catch (error) {
            console.error('❌ Delete account error:', error);
            if (error && error.code === 'auth/requires-recent-login') {
                showAlert('Please sign in again to delete your account.');
            } else {
                showAlert('Failed to delete account: ' + (error.message || 'Unknown error'));
            }
        }
    });
}

// ============================================================
// USER PROFILE MENU
// ============================================================

/**
 * Toggle user dropdown menu
 */
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    const isVisible = dropdown.style.display === 'block';
    
    if (isVisible) {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = 'block';
    }
}

/**
 * Update user email display in dropdown
 */
function updateUserEmailDisplay() {
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const settingsBtn = document.getElementById('settingsBtn');
    const isGuest = localStorage.getItem('fitmind_guest_mode') === 'true';
    
    if (window.auth && window.auth.currentUser) {
        const user = window.auth.currentUser;
        userEmailDisplay.innerHTML = `📧 ${user.email}`;
        // Show Settings button for authenticated users
        if (settingsBtn) {
            settingsBtn.style.display = 'flex';
        }
    } else if (isGuest) {
        userEmailDisplay.innerHTML = '👤 Guest Mode';
        // Hide Settings button for guest users
        if (settingsBtn) {
            settingsBtn.style.display = 'none';
        }
    } else {
        userEmailDisplay.innerHTML = '👤 Not signed in';
        // Hide Settings button if not signed in
        if (settingsBtn) {
            settingsBtn.style.display = 'none';
        }
    }

    updateProfileAvatarUI();
}

function updateProfileAvatarUI() {
    const profile = getLocalProfile() || getDefaultProfile();
    const avatar = profile.photoEmoji || '👤';

    const photoElement = document.getElementById('profilePhoto');
    if (photoElement) {
        photoElement.textContent = avatar;
    }

    const userBtn = document.getElementById('userProfileBtn');
    if (userBtn) {
        userBtn.textContent = avatar;
    }
}

function setGoalChipsFromProfile(goals) {
    const selected = Array.isArray(goals) ? goals : goals ? [goals] : [];
    document.querySelectorAll('.goal-chip').forEach(btn => {
        const goal = btn.getAttribute('data-goal');
        btn.classList.toggle('active', selected.includes(goal));
    });
}

function getSelectedGoals() {
    return Array.from(document.querySelectorAll('.goal-chip.active'))
        .map(btn => btn.getAttribute('data-goal'))
        .filter(Boolean);
}

function toggleGoalChip(goal) {
    const chip = document.querySelector(`.goal-chip[data-goal="${goal}"]`);
    if (!chip) return;
    chip.classList.toggle('active');
}

function updateWorkoutFrequencyValue(value) {
    const label = document.getElementById('profileWorkoutFrequencyValue');
    const slider = document.getElementById('profileWorkoutFrequency');
    if (slider && value !== undefined) {
        slider.value = value;
    }
    if (label) {
        const days = parseInt(value, 10) || 1;
        label.textContent = `${days} day${days === 1 ? '' : 's'}`;
    }
}

/**
 * Handle sign out
 */
function handleSignOut() {
    // Close dropdown
    document.getElementById('userDropdown').style.display = 'none';
    
    // Check if Firebase is available
    if (window.firebaseSync && typeof window.firebaseSync.signOut === 'function') {
        // Use Firebase sign out
        window.firebaseSync.signOut();
    } else {
        // Manual sign out for guest mode
        localStorage.removeItem('fitmind_guest_mode');
        console.log('✅ Guest mode cleared');
        
        // Redirect to auth page
        window.location.href = 'auth.html';
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('userDropdown');
    const userBtn = document.getElementById('userProfileBtn');
    
    if (dropdown && userBtn && 
        !dropdown.contains(event.target) && 
        !userBtn.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

/**
 * Load user preferences from localStorage
 */
function loadUserPreferences() {
    const theme = localStorage.getItem('fitmind_theme') || 'dark';
    const notifications = localStorage.getItem('fitmind_notifications') !== 'false';
    
    // Apply theme immediately
    if (theme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    
    console.log(`✅ Loaded preferences: theme=${theme}, notifications=${notifications}`);
}

// ============================================================
// USER PROFILE MANAGEMENT
// ============================================================

/**
 * Default profile structure
 */
function getDefaultProfile() {
    return {
        name: '',
        email: '',
        age: null,
        sex: '',
        height: null,
        weight: null,
        fitnessLevel: '',
        goal: [],
        targetWeight: null,
        workoutFrequency: 3,
        units: 'metric', // metric or imperial
        notifications: 'all',
        diet: '',
        photoEmoji: '👤',
        createdAt: new Date().toISOString()
    };
}

/**
 * Open settings/profile modal
 */
function openSettings() {
    console.log('🔧 Opening settings...');
    
    // Close dropdown menu
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    // Open profile modal
    const modal = document.getElementById('profileModal');
    console.log('📦 Modal element:', modal);
    
    if (modal) {
        console.log('✅ Setting modal display to flex');
        modal.style.display = 'flex';
        
        // Force visibility for debugging
        const profileModalContent = modal.querySelector('.profile-modal');
        if (profileModalContent) {
            console.log('📋 Profile modal content found:', profileModalContent);
            
            // Log dimensions
            setTimeout(() => {
                const rect = profileModalContent.getBoundingClientRect();
                console.log('📐 Modal dimensions:', {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                });
            }, 100);
            
        } else {
            console.error('❌ .profile-modal content not found!');
        }
        
        try {
            loadProfile();
            updateProgressStats();
            console.log('✅ Profile loaded successfully');
        } catch (error) {
            console.error('❌ Error loading profile:', error);
        }
    } else {
        console.error('❌ Profile modal not found in DOM!');
    }
}

/**
 * Close profile modal
 */
function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Load profile data from localStorage
 */
async function loadProfile() {
    console.log('📝 Loading profile...');
    
    try {
        let profile = getLocalProfile();

        if (window.auth && window.auth.currentUser && window.firebaseSync && typeof window.firebaseSync.loadUserProfile === 'function') {
            const cloudProfile = await window.firebaseSync.loadUserProfile();
            if (cloudProfile) {
                profile = cloudProfile;
                setLocalProfile(cloudProfile);
            }
        }

        if (!profile) {
            profile = getDefaultProfile();
        }
        
        // Get current user email from Firebase or use profile email
        const authEmail = window.auth && window.auth.currentUser ? window.auth.currentUser.email : '';
        const userEmail = authEmail || window.currentUserEmail || profile.email || 'guest@fitmind.app';
        
        // Populate form fields (with null checks)
        const setValueSafe = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value || '';
            } else {
                console.warn(`⚠️ Element not found: ${id}`);
            }
        };
        
        setValueSafe('profileName', profile.name);
        setValueSafe('profileAge', profile.age);
        setValueSafe('profileSex', profile.sex);
        setValueSafe('profileHeight', profile.height);
        setValueSafe('profileWeight', profile.weight);
        setValueSafe('profileFitnessLevel', profile.fitnessLevel);
        setValueSafe('profileTargetWeight', profile.targetWeight);
        setValueSafe('profileWorkoutFrequency', profile.workoutFrequency || 3);
        setValueSafe('profileEmail', userEmail);
        
        const emailDisplay = document.getElementById('profileEmailDisplay');
        if (emailDisplay) {
            emailDisplay.textContent = userEmail;
        }
        
        // Update photo
        const photoElement = document.getElementById('profilePhoto');
        if (photoElement) {
            photoElement.textContent = profile.photoEmoji || '👤';
        }
        
        updateWorkoutFrequencyValue(profile.workoutFrequency || 3);

        // Update goal chips
        if (document.querySelector('.goal-chip')) {
            setGoalChipsFromProfile(profile.goal || []);
        }
        
        console.log('✅ Profile loaded successfully');
    } catch (error) {
        console.error('❌ Error in loadProfile:', error);
        throw error;
    }
}

/**
 * Save profile data to localStorage
 */
async function saveProfile() {
    const profile = {
        name: document.getElementById('profileName').value.trim(),
        email: document.getElementById('profileEmail').value.trim(),
        age: parseInt(document.getElementById('profileAge').value) || null,
        sex: document.getElementById('profileSex').value,
        height: parseFloat(document.getElementById('profileHeight').value) || null,
        weight: parseFloat(document.getElementById('profileWeight').value) || null,
        fitnessLevel: document.getElementById('profileFitnessLevel').value,
        goal: getSelectedGoals(),
        targetWeight: parseFloat(document.getElementById('profileTargetWeight').value) || null,
        workoutFrequency: parseInt(document.getElementById('profileWorkoutFrequency').value) || 3,
        photoEmoji: document.getElementById('profilePhoto').textContent,
        updatedAt: new Date().toISOString()
    };
    
    // Preserve createdAt if exists
    const existingProfile = getLocalProfile();
    if (existingProfile) {
        profile.createdAt = existingProfile.createdAt;
    } else {
        profile.createdAt = new Date().toISOString();
    }

    setLocalProfile(profile);

    if (window.auth && window.auth.currentUser && window.firebaseSync && typeof window.firebaseSync.saveUserProfile === 'function') {
        try {
            await window.firebaseSync.saveUserProfile(profile);
        } catch (error) {
            console.warn('⚠️ Failed to save profile to cloud:', error);
        }
    }

    updateProfileAvatarUI();
    renderDashboardGreeting();
    renderDashboardStats();
    
    // Show success message
    showNotification('✅ Profile saved successfully!', 'success');
    
    // Close modal after short delay
    setTimeout(() => {
        closeProfile();
    }, 800);
    
    console.log('✅ Profile saved:', profile);
}

/**
 * Update unit labels based on selected system
 */

/**
 * Change profile photo (emoji picker)
 */
function changeProfilePhoto() {
    const picker = document.getElementById('avatarPicker');
    if (!picker) return;

    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    if (picker.style.display === 'block') {
        pendingAvatar = null;
        document.querySelectorAll('.avatar-option').forEach(btn => btn.classList.remove('selected'));
        const confirmBtn = document.getElementById('confirmAvatarBtn');
        if (confirmBtn) confirmBtn.disabled = true;
    }
}

function selectAvatar(emoji) {
    pendingAvatar = emoji;
    document.querySelectorAll('.avatar-option').forEach(btn => {
        btn.classList.toggle('selected', btn.textContent === emoji);
    });
    const confirmBtn = document.getElementById('confirmAvatarBtn');
    if (confirmBtn) confirmBtn.disabled = false;
}

function confirmAvatarSelection() {
    if (!pendingAvatar) return;
    const photoElement = document.getElementById('profilePhoto');
    if (photoElement) {
        photoElement.textContent = pendingAvatar;
    }
    closeAvatarPicker();
    showNotification('Photo updated! Don\'t forget to save.', 'info');
}

function closeAvatarPicker() {
    const picker = document.getElementById('avatarPicker');
    if (picker) picker.style.display = 'none';
    pendingAvatar = null;
    document.querySelectorAll('.avatar-option').forEach(btn => btn.classList.remove('selected'));
    const confirmBtn = document.getElementById('confirmAvatarBtn');
    if (confirmBtn) confirmBtn.disabled = true;
}

/**
 * Change password (placeholder - will integrate with Firebase)
 */
function changePassword() {
    // Check if Firebase is available
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        // Firebase password reset
        const email = firebase.auth().currentUser.email;
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => {
                showNotification('📧 Password reset email sent! Check your inbox.', 'success');
            })
            .catch((error) => {
                showNotification('❌ Error: ' + error.message, 'error');
            });
    } else {
        // Fallback for local storage mode
        const newPassword = prompt('Enter new password (min 6 characters):');
        if (newPassword && newPassword.length >= 6) {
            showNotification('✅ Password updated successfully!', 'success');
        } else if (newPassword !== null) {
            showNotification('❌ Password must be at least 6 characters', 'error');
        }
    }
}

/**
 * Update progress statistics in profile
 */
function updateProgressStats() {
    // Get profile data
    const profileData = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    const profile = profileData ? JSON.parse(profileData) : getDefaultProfile();
    
    // Calculate goal progress
    let goalProgress = 0;
    if (profile.weight && profile.targetWeight && profile.weight !== profile.targetWeight) {
        const totalChange = Math.abs(profile.targetWeight - profile.weight);
        // This is simplified - in real app, track weight over time
        goalProgress = 0; // Would calculate based on initial weight vs current
    }
    
    // Calculate workout streak (simplified)
    const streak = calculateWorkoutStreak();
    
    // Get total workouts
    const totalWorkouts = workoutHistory.length;
    
    // Calculate total calories
    const totalCalories = workoutHistory.reduce((sum, w) => sum + (w.calories || 0), 0);
    
    // Update UI
    const goalProgressEl = document.getElementById('goalProgress');
    const streakEl = document.getElementById('workoutStreak');
    const totalWorkoutsEl = document.getElementById('totalWorkouts');
    const totalCaloriesEl = document.getElementById('profileTotalCalories');
    
    if (goalProgressEl) goalProgressEl.textContent = goalProgress + '%';
    if (streakEl) streakEl.textContent = streak;
    if (totalWorkoutsEl) totalWorkoutsEl.textContent = totalWorkouts;
    if (totalCaloriesEl) totalCaloriesEl.textContent = Math.round(totalCalories);
}

/**
 * Calculate workout streak (consecutive days)
 */
function calculateWorkoutStreak() {
    if (workoutHistory.length === 0) return 0;
    
    // Sort workouts by date (newest first)
    const sorted = [...workoutHistory].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (const workout of sorted) {
        const workoutDate = new Date(workout.timestamp);
        workoutDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((currentDate - workoutDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === streak) {
            streak++;
            currentDate = new Date(workoutDate);
        } else if (diffDays > streak + 1) {
            break;
        }
    }
    
    return streak;
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 
                      type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'};
        color: white;
        border-radius: 12px;
        font-weight: 600;
        font-size: 15px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 10001;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Close modal when clicking outside
document.addEventListener('click', (event) => {
    const modal = document.getElementById('profileModal');
    if (modal && event.target === modal) {
        closeProfile();
    }
});

// ============================================================
// INITIALIZATION
// ============================================================

// Initialize on load
// Ensure DOM is ready before updating stats
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 FitMind AI Coach - Initializing...');
    
    try {
        // Load and apply user preferences FIRST
        loadUserPreferences();
        
        // Load stored data from localStorage
        loadWorkoutHistory();
        loadChatSessions();
        
        // Create default chat session if none exist
        if (chatSessions.length === 0) {
            createNewChatSession();
        } else if (!currentChatId) {
            currentChatId = chatSessions[0].id;
        }
        
        // Load real research data
        loadResearchData().then(() => {
            console.log('✓ Research data loaded successfully');
            renderDashboardLive();
        }).catch(err => {
            console.warn('Note: Research data not available, app will use simulation', err);
        });
        
        // Update UI with loaded data
        updateHeaderStats();
        renderProgressDashboard();
        renderHistory();
        renderChatHistory();
        renderChatSidebar();
        
        // Update user email display in dropdown
        updateUserEmailDisplay();
        updateProfileAvatarUI();
        refreshProfileFromCloud();
        
        console.log('✅ App initialized - Data persistence active');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        // Show error to user
        document.body.innerHTML = `
            <div style="padding: 20px; color: white; background: #dc2626; text-align: center;">
                <h2>⚠️ Initialization Error</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">Reload App</button>
            </div>
        `;
    }
});