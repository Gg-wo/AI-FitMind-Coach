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
let currentWorkout = null;
let researchDataset = null;  // Real research data from WESAD
let currentDataIndex = 0;    // Current position in playback

// Constants
const MAX_HR = 190; // Example max heart rate
const REST_HR = 65;

// OpenRouter API Configuration
const OPENROUTER_API_KEY = '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';  // Replace with your actual API key
const OPENROUTER_MODEL = 'meta-llama/llama-3.1-70b-instruct';  // Fast & free tier friendly

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

    // Note: The click event might come from the window object in some contexts, 
    // but here we assume it's triggered by the onclick attribute
    const activeTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent.toLowerCase().includes(tabName));
    if(activeTab) activeTab.classList.add('active');
    else if(event) event.target.classList.add('active');

    document.getElementById(tabName + '-tab').classList.add('active');

    if (tabName === 'history') {
        renderHistory();
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
    document.getElementById('workoutType').disabled = true;

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

        // Reset UI
        document.getElementById('startBtn').style.display = 'inline-block';
        document.getElementById('stopBtn').style.display = 'none';
        document.getElementById('workoutType').disabled = false;

        // Update stats
        updateHeaderStats();

        // Show completion message with data source info
        showAlert(`Workout complete! Duration: ${formatDuration(currentWorkout.duration)}, Avg HR: ${currentWorkout.avgHR} bpm (Real data from ${currentWorkout.researchSubject})`);

        currentWorkout = null;
    });
}

// Get real-time coaching
async function getRealtimeCoaching() {
    if (!currentWorkout) return;

    const coachDiv = document.getElementById('coachResponses');
    const loadingMsg = createCoachMessage('Analyzing your workout data...', true);
    coachDiv.innerHTML = '';
    coachDiv.appendChild(loadingMsg);

    switchTab('coach');
    
    // Ensure the tab visual state is updated if switchTab doesn't catch it
    const coachTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent.includes('AI Coach'));
    if(coachTab) {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        coachTab.classList.add('active');
    }

    const prompt = `As an AI fitness coach, analyze this real-time workout data and provide immediate feedback:

Workout Type: ${currentWorkout.type}
Duration: ${formatDuration(currentWorkout.duration)}
Current Heart Rate: ${hrData[hrData.length - 1]} bpm
Average Heart Rate: ${currentWorkout.avgHR} bpm
Max Heart Rate: ${currentWorkout.maxHR} bpm
Current Zone: Zone ${getHRZone(hrData[hrData.length - 1])}

Provide:
1. Immediate feedback on current intensity
2. Should they increase, decrease, or maintain current effort?
3. Any concerns about overtraining or safety
4. Encouragement and motivation

Keep it concise and actionable.`;

    try {
        const response = await callOpenRouterAPI(prompt);
        coachDiv.innerHTML = '';
        coachDiv.appendChild(createCoachMessage(response, false));
    } catch (err) {
        coachDiv.innerHTML = '';
        coachDiv.appendChild(createCoachMessage('Error: ' + err.message, false));
    }
}

// Ask AI coach
async function askCoach() {
    const question = document.getElementById('coachQuestion').value.trim();
    if (!question) {
        showAlert('Please enter a question for the AI coach.');
        return;
    }

    const coachDiv = document.getElementById('coachResponses');
    const loadingMsg = createCoachMessage('Thinking...', true);
    coachDiv.innerHTML = '';
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
        const response = await callOpenRouterAPI(prompt);
        coachDiv.innerHTML = '';
        coachDiv.appendChild(createCoachMessage(response, false));
        
        // Clear the input field after successful response
        document.getElementById('coachQuestion').value = '';
    } catch (err) {
        coachDiv.innerHTML = '';
        coachDiv.appendChild(createCoachMessage('Error: ' + err.message, false));
    }
}

// Call OpenRouter API
async function callOpenRouterAPI(prompt) {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'YOUR_API_KEY_HERE') {
        throw new Error('Please set your OpenRouter API key in the app.js file');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/Gg-wo/MyApplication',  // Your GitHub repo
            'X-Title': 'FitMind AI Coach'  // Your app name
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert AI fitness coach specializing in personalized training advice, heart rate zone analysis, and workout optimization. Provide clear, actionable, and encouraging guidance.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to get AI response');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Create coach message element
function createCoachMessage(content, isLoading) {
    const div = document.createElement('div');
    div.className = 'coach-message' + (isLoading ? ' loading' : '');

    const header = document.createElement('div');
    header.className = 'coach-header';
    header.innerHTML = `
        <div class="coach-avatar">🤖</div>
        <div>
            <strong>AI Coach</strong>
            <div style="font-size: 12px; color: var(--text-muted);">Powered by Llama 3.1 70B</div>
        </div>
    `;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'coach-content';

    if (isLoading) {
        contentDiv.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
    } else {
        contentDiv.innerHTML = marked.parse(content);
    }

    div.appendChild(header);
    div.appendChild(contentDiv);

    return div;
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

    const historyHTML = workoutHistory.map(workout => {
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
            </div>
        `;
    }).join('');

    historyList.innerHTML = `<div class="history-grid">${historyHTML}</div>`;
}

// Update header stats
function updateHeaderStats() {
    document.getElementById('totalWorkouts').textContent = workoutHistory.length;

    // Calculate this week's minutes
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weeklyMinutes = workoutHistory
        .filter(w => new Date(w.startTime).getTime() > oneWeekAgo)
        .reduce((sum, w) => sum + Math.floor(w.duration / 60), 0);

    document.getElementById('weeklyMinutes').textContent = weeklyMinutes;
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
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">Confirm</div>
            <div class="modal-body">${message}</div>
            <div class="modal-actions">
                <button class="secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button onclick="this.closest('.modal-overlay').remove(); (${onConfirm.toString()})()">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Initialize on load
// Ensure DOM is ready before updating stats
document.addEventListener('DOMContentLoaded', () => {
    // Load real research data
    loadResearchData().then(() => {
        console.log('✓ Research data loaded successfully');
    }).catch(err => {
        console.warn('Note: Research data not available, app will use simulation', err);
    });
    
    updateHeaderStats();
    renderHistory();
});