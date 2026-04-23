// ============================================================
// Calendar & Training Plan Module (Fully Fixed)
// ============================================================

let currentSelectedDate = new Date();
let currentEditingDateKey = null;
window.trainingPlanData = window.trainingPlanData || {};

// ---------- Helper functions ----------
function formatDateKey(date) {
    return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
}
function saveTrainingPlanData() {
    localStorage.setItem('fitmind_training_plan_data', JSON.stringify(window.trainingPlanData));
}
function loadTrainingPlanData() {
    const saved = localStorage.getItem('fitmind_training_plan_data');
    if (saved) {
        try { window.trainingPlanData = JSON.parse(saved); } catch(e) { window.trainingPlanData = {}; }
    } else { window.trainingPlanData = {}; saveTrainingPlanData(); }
}
function getDayName(dateKey) {
    const date = new Date(dateKey);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();       // 0 = Sunday, 1 = Monday, ...
    const diff = (day === 0 ? -6 : 1) - day; // adjust to this week Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ---------- Custom prompt & modal ----------
function showPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px;">
                <div class="modal-header">Input</div>
                <div class="modal-body">${message}</div>
                <input type="text" id="promptInput" value="${defaultValue.replace(/"/g, '&quot;')}" style="width:100%; padding:8px; margin-bottom:16px;">
                <div class="modal-actions">
                    <button id="promptCancelBtn" class="secondary">Cancel</button>
                    <button id="promptOkBtn">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#promptInput');
        const okBtn = modal.querySelector('#promptOkBtn');
        const cancelBtn = modal.querySelector('#promptCancelBtn');
        const cleanup = () => modal.remove();
        okBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
        input.focus();
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') okBtn.click(); });
    });
}

// ---------- User profile management (with GUI modal) ----------
async function getUserProfile() {
    let profile = localStorage.getItem('fitmind_user_profile');
    if (profile) {
        try {
            profile = JSON.parse(profile);
            if (profile.weight && profile.height && profile.gender && profile.level) return profile;
        } catch(e) {}
    }
    return await showEditProfileModal(true);
}

async function showEditProfileModal(isFirstTime = false) {
    const current = (() => {
        const raw = localStorage.getItem('fitmind_user_profile');
        if (raw) try { return JSON.parse(raw); } catch(e) {}
        return { weight: 70, height: 175, gender: 'male', level: 'intermediate' };
    })();

    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 420px;">
                <div class="modal-header">${isFirstTime ? 'Set Your Body Data' : 'Edit Body Data'}</div>
                <div style="padding: 16px;">
                    <div style="margin-bottom: 16px;">
                        <label>Weight (kg)</label>
                        <input type="number" id="editWeight" value="${current.weight}" step="1" style="width:100%; margin-top:4px;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label>Height (cm)</label>
                        <input type="number" id="editHeight" value="${current.height}" step="1" style="width:100%; margin-top:4px;">
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label>Gender</label>
                        <div style="display:flex; gap:12px; margin-top:6px;">
                            <button type="button" id="genderMaleBtn" class="gender-btn ${current.gender === 'male' ? 'active' : ''}">♂ Male</button>
                            <button type="button" id="genderFemaleBtn" class="gender-btn ${current.gender === 'female' ? 'active' : ''}">♀ Female</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label>Training Level</label>
                        <select id="editLevel" style="width:100%; margin-top:4px;">
                            <option value="beginner" ${current.level === 'beginner' ? 'selected' : ''}>Beginner</option>
                            <option value="intermediate" ${current.level === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                            <option value="advanced" ${current.level === 'advanced' ? 'selected' : ''}>Advanced</option>
                        </select>
                    </div>
                </div>
                <div class="modal-actions">
                    <button id="profileCancelBtn" class="secondary">Cancel</button>
                    <button id="profileSaveBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const weightInput = modal.querySelector('#editWeight');
        const heightInput = modal.querySelector('#editHeight');
        const genderMale = modal.querySelector('#genderMaleBtn');
        const genderFemale = modal.querySelector('#genderFemaleBtn');
        const levelSelect = modal.querySelector('#editLevel');
        let selectedGender = current.gender;

        const updateGenderUI = () => {
            genderMale.classList.toggle('active', selectedGender === 'male');
            genderFemale.classList.toggle('active', selectedGender === 'female');
        };
        genderMale.onclick = () => { selectedGender = 'male'; updateGenderUI(); };
        genderFemale.onclick = () => { selectedGender = 'female'; updateGenderUI(); };
        updateGenderUI();

        const save = () => {
            const weight = parseFloat(weightInput.value);
            const height = parseFloat(heightInput.value);
            if (isNaN(weight) || isNaN(height)) {
                showAlert('Please enter valid numbers.');
                return;
            }
            const profile = {
                weight, height,
                gender: selectedGender,
                level: levelSelect.value,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('fitmind_user_profile', JSON.stringify(profile));
            modal.remove();
            resolve(profile);
        };
        modal.querySelector('#profileSaveBtn').onclick = save;
        modal.querySelector('#profileCancelBtn').onclick = () => { modal.remove(); resolve(null); };
    });
}

async function updateUserProfile() {
    const newProfile = await showEditProfileModal(false);
    if (newProfile) {
        showAlert('Profile updated.');
        renderCalendar();
    }
}

// ---------- JSON extraction ----------
function extractAndFixJSON(str) {
    try {
        let cleaned = str.replace(/```json/gi, '').replace(/```/g, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
            return JSON.parse(cleaned);
        }
        return null;
    } catch(e) {
        console.error("JSON Parsing failed:", e);
        return null;
    }
}

// ---------- Calendar rendering ----------
function renderCalendar() {
    const year = currentSelectedDate.getFullYear();
    const month = currentSelectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    let calendarHtml = `<div class="calendar-header">
        <button onclick="prevMonth()">◀</button>
        <span>${year} - ${month+1}</span>
        <button onclick="nextMonth()">▶</button>
    </div>
    <div class="calendar-weekdays"><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
    <div class="calendar-days">`;
    let dayCount = 1;
    let startIdx = startWeekday === 0 ? 6 : startWeekday - 1;
    for (let i = 0; i < 42; i++) {
        if (i < startIdx || dayCount > daysInMonth) {
            calendarHtml += `<div class="calendar-day empty"></div>`;
        } else {
            const date = new Date(year, month, dayCount);
            const dateKey = formatDateKey(date);
            const plan = window.trainingPlanData[dateKey];
            const hasPlan = plan && plan.exercises && plan.exercises.length > 0;
            calendarHtml += `<div class="calendar-day ${hasPlan ? 'has-plan' : ''}" onclick="showDayDetail('${dateKey}')">
                <div class="day-number">${dayCount}</div>
                ${hasPlan ? `<div class="day-badge">📋</div>` : ''}
            </div>`;
            dayCount++;
        }
    }
    calendarHtml += `</div>`;
    document.getElementById('calendarContainer').innerHTML = calendarHtml;
}

// ---------- Day detail view ----------
async function showDayDetail(dateKey) {
    currentEditingDateKey = dateKey;
    let dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) {
        showConfirmDialog('No plan for this day. Create an empty plan?', () => {
            dayPlan = { name: getDayName(dateKey), exercises: [] };
            window.trainingPlanData[dateKey] = dayPlan;
            saveTrainingPlanData();
            renderDayDetail(dayPlan);
        });
        return;
    }
    const aiGenBtn = document.getElementById('aiGenerateWeekPlanBtn');
    const copyBtn = document.getElementById('copyToNextWeekBtn');
    const profileBtn = document.getElementById('editProfileBtn');
    if (aiGenBtn) aiGenBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    renderDayDetail(dayPlan);
}

function renderDayDetail(dayPlan) {
    let exercisesHtml = '';
    for (let i = 0; i < dayPlan.exercises.length; i++) {
        const ex = dayPlan.exercises[i];
        if (ex.type === 'strength') {
            let setsHtml = `<table class="sets-table"><thead><tr><th>Set</th><th>Weight (kg)</th><th>Reps</th><th>Complete</th><th></th></tr></thead><tbody>`;
            for (let sIdx = 0; sIdx < ex.sets.length; sIdx++) {
                const set = ex.sets[sIdx];
                setsHtml += `
                    <tr data-set-index="${sIdx}">
                        <td>${sIdx+1}</td>
                        <td><input type="number" class="set-weight" value="${set.weight}" step="2.5" onchange="updateSetWeight('${currentEditingDateKey}', ${i}, ${sIdx}, this.value)"></td>
                        <td><input type="number" class="set-reps" value="${set.reps}" step="1" onchange="updateSetReps('${currentEditingDateKey}', ${i}, ${sIdx}, this.value)"></td>
                        <td><button class="set-complete-btn" onclick="toggleSetComplete('${currentEditingDateKey}', ${i}, ${sIdx})" style="${set.completed ? 'background:#4ade80;' : 'background:var(--accent-primary);'}">${set.completed ? '✓' : '○'}</button></td>
                        <td><button class="delete-set-btn" onclick="deleteSet('${currentEditingDateKey}', ${i}, ${sIdx})">Delete</button></td>
                    </tr>
                `;
            }
            setsHtml += `</tbody></table>`;
            exercisesHtml += `
                <div class="exercise-card" data-exercise-index="${i}">
                    <div class="exercise-header">
                        <div class="exercise-name">🏋️ ${ex.name}</div>
                        <button class="delete-exercise-btn" onclick="deleteExercise('${currentEditingDateKey}', ${i})">Delete Exercise</button>
                    </div>
                    ${setsHtml}
                    <div class="exercise-actions">
                        <button onclick="addSetToExercise('${currentEditingDateKey}', ${i})">+ Add Set</button>
                    </div>
                </div>
            `;
        } else {
            exercisesHtml += `
                <div class="exercise-card">
                    <div class="exercise-header">
                        <div class="exercise-name">🏃 ${ex.name}</div>
                        <button class="delete-exercise-btn" onclick="deleteExercise('${currentEditingDateKey}', ${i})">Delete Exercise</button>
                    </div>
                    <div class="cardio-info">
                        <label>Duration: <input type="number" value="${ex.duration}" step="5" onchange="updateCardioDuration('${currentEditingDateKey}', ${i}, this.value)"> min</label>
                        <label>Distance: <input type="number" value="${ex.distance}" step="0.5" onchange="updateCardioDistance('${currentEditingDateKey}', ${i}, this.value)"> km</label>
                    </div>
                    <div class="exercise-actions">
                        <button onclick="toggleCardioComplete('${currentEditingDateKey}', ${i})">${ex.completed ? '✅ Completed' : 'Mark Complete'}</button>
                    </div>
                </div>
            `;
        }
    }
    const detailHtml = `
        <div class="day-detail">
            <h3>${dayPlan.name || getDayName(currentEditingDateKey)} (${currentEditingDateKey})</h3>
            ${exercisesHtml || '<p>No exercises yet. Add some below.</p>'}
            <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
                <button id="addExerciseBtn">+ Add Exercise</button>
                <button id="aiAdjustDayBtn">🤖 AI Adjust This Day</button>
                <button id="clearAllExercisesBtn" class="danger" style="background: #dc2626; border-color: #dc2626;">🗑️ Delete All Exercises</button>
                <button onclick="closeDayDetail()">Back to Calendar</button>
            </div>
        </div>
    `;
    document.getElementById('planDetailContainer').innerHTML = detailHtml;
    document.getElementById('calendarContainer').style.display = 'none';
    document.getElementById('planDetailContainer').style.display = 'block';
    document.getElementById('addExerciseBtn').onclick = () => showAddExerciseModal();
    document.getElementById('aiAdjustDayBtn').onclick = () => aiAdjustThisDay(currentEditingDateKey);
    document.getElementById('clearAllExercisesBtn').onclick = () => clearAllExercises(currentEditingDateKey);
}

function closeDayDetail() {
    document.getElementById('calendarContainer').style.display = 'block';
    document.getElementById('planDetailContainer').style.display = 'none';
    renderCalendar();
    const aiGenBtn = document.getElementById('aiGenerateWeekPlanBtn');
    const copyBtn = document.getElementById('copyToNextWeekBtn');
    const profileBtn = document.getElementById('editProfileBtn');
    if (aiGenBtn) aiGenBtn.style.display = 'inline-block';
    if (copyBtn) copyBtn.style.display = 'inline-block';
    if (profileBtn) profileBtn.style.display = 'inline-block';
}

// ---------- Strength operations ----------
function updateSetWeight(dateKey, exerciseIdx, setIdx, value) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].sets[setIdx].weight = parseFloat(value);
    saveTrainingPlanData();
}
function updateSetReps(dateKey, exerciseIdx, setIdx, value) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].sets[setIdx].reps = parseInt(value);
    saveTrainingPlanData();
}
function toggleSetComplete(dateKey, exerciseIdx, setIdx) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    const set = dayPlan.exercises[exerciseIdx].sets[setIdx];
    set.completed = !set.completed;
    saveTrainingPlanData();
    renderDayDetail(dayPlan);
}
function addSetToExercise(dateKey, exerciseIdx) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].sets.push({ weight: 0, reps: 0, completed: false });
    saveTrainingPlanData();
    renderDayDetail(dayPlan);
}
window.deleteSet = function(dateKey, exerciseIdx, setIdx) {
    const doDelete = () => {
        const dayPlan = window.trainingPlanData[dateKey];
        if (!dayPlan || !dayPlan.exercises[exerciseIdx]) return;
        dayPlan.exercises[exerciseIdx].sets.splice(setIdx, 1);
        saveTrainingPlanData();
        const updated = window.trainingPlanData[dateKey];
        if (updated) renderDayDetail(updated);
    };
    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('Delete this set?', doDelete);
    } else {
        if (confirm('Delete this set?')) doDelete();
    }
};
window.deleteExercise = function(dateKey, exerciseIdx) {
    const doDelete = () => {
        const dayPlan = window.trainingPlanData[dateKey];
        if (!dayPlan) return;
        dayPlan.exercises.splice(exerciseIdx, 1);
        saveTrainingPlanData();
        const updated = window.trainingPlanData[dateKey];
        if (updated) renderDayDetail(updated);
        else closeDayDetail();
    };
    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog('Delete this exercise?', doDelete);
    } else {
        if (confirm('Delete this exercise?')) doDelete();
    }
};
function updateCardioDuration(dateKey, exerciseIdx, value) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].duration = parseInt(value);
    saveTrainingPlanData();
}
function updateCardioDistance(dateKey, exerciseIdx, value) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].distance = parseFloat(value);
    saveTrainingPlanData();
}
function toggleCardioComplete(dateKey, exerciseIdx) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan) return;
    dayPlan.exercises[exerciseIdx].completed = !dayPlan.exercises[exerciseIdx].completed;
    saveTrainingPlanData();
    renderDayDetail(dayPlan);
}

// ---------- Add exercise ----------
function showAddExerciseModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:300px;">
            <h3>Select Exercise Type</h3>
            <button id="addStrengthBtn" style="width:100%; margin-bottom:10px;">💪 Strength</button>
            <button id="addCardioBtn" style="width:100%;">🏃 Cardio</button>
            <button class="secondary" style="margin-top:10px;" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#addStrengthBtn').onclick = () => { modal.remove(); addStrengthExercise(); };
    modal.querySelector('#addCardioBtn').onclick = () => { modal.remove(); addCardioExercise(); };
}
async function addStrengthExercise() {
    const name = await showPrompt('Exercise name (e.g., Bench Press):', '');
    if (!name) return;
    const dayPlan = window.trainingPlanData[currentEditingDateKey];
    if (!dayPlan) return;
    dayPlan.exercises.push({ name, type: 'strength', sets: [{ weight: 0, reps: 0, completed: false }] });
    saveTrainingPlanData();
    renderDayDetail(dayPlan);
}
async function addCardioExercise() {
    const name = await showPrompt('Exercise name (e.g., Running):', '');
    if (!name) return;
    const durationStr = await showPrompt('Duration (minutes):', '30');
    const duration = parseInt(durationStr) || 30;
    const distanceStr = await showPrompt('Distance (km):', '5');
    const distance = parseFloat(distanceStr) || 5;
    const dayPlan = window.trainingPlanData[currentEditingDateKey];
    if (!dayPlan) return;
    dayPlan.exercises.push({ name, type: 'cardio', duration, distance, completed: false });
    saveTrainingPlanData();
    renderDayDetail(dayPlan);
}

// ---------- AI adjust this day (with user input) ----------
async function aiAdjustThisDay(dateKey) {
    const dayPlan = window.trainingPlanData[dateKey];
    if (!dayPlan || dayPlan.exercises.length === 0) {
        showAlert('Add some exercises first.');
        return;
    }
    const userRequest = await showPrompt('Describe how you want to adjust today’s plan (e.g., "full leg day", "increase bench press by 5kg"):', '');
    if (!userRequest) return;


    const currentData = dayPlan.exercises.map(ex => {
        if (ex.type === 'strength') {
            return { name: ex.name, type: 'strength', sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) };
        } else {
            return { name: ex.name, type: 'cardio', duration: ex.duration, distance: ex.distance };
        }
    });

    // only output JSON format
    const promptText = `You are a fitness plan adjuster.
User request: "${userRequest}"
Current plan (JSON array): ${JSON.stringify(currentData, null, 2)}

Generate a NEW plan array that satisfies the user request.
Each element must follow this EXACT structure:
- For strength: {"name": "Exercise name", "type": "strength", "sets": [{"weight": number, "reps": number, "completed": false}]}
- For cardio: {"name": "Exercise name", "type": "cardio", "duration": number (minutes), "distance": number (km), "completed": false}

Return ONLY the JSON array. Do NOT include any other text, explanations, or markdown.`;

    try {
        const response = await callOpenRouterAPI(promptText);
        let parsed = extractAndFixJSON(response.content);

        // If the parsing fails, try to directly use eval or perform another cleanup.
        if (!parsed) {
            // Try to remove all non-JSON characters and then reparse
            const maybeJSON = response.content.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (maybeJSON) {
                parsed = JSON.parse(maybeJSON[0]);
            }
        }

        if (parsed && Array.isArray(parsed)) {
            // Make sure that each exercise has necessary fields
            const newExercises = parsed.map(ex => {
                if (ex.type === 'strength') {
                    if (!ex.sets) ex.sets = [];
                    ex.sets.forEach(s => { if (s.completed === undefined) s.completed = false; });
                } else if (ex.type === 'cardio') {
                    if (ex.completed === undefined) ex.completed = false;
                }
                return ex;
            });
            dayPlan.exercises = newExercises;
            saveTrainingPlanData();
            renderDayDetail(dayPlan);
            showAlert('✅ Plan adjusted by AI!');
        } else {
            throw new Error('AI response was not a valid JSON array');
        }
    } catch(e) {
        console.error('AI adjustment error:', e);
        showAlert('❌ AI adjustment failed. Please try a simpler request or edit manually.');
    }
}

// ---------- AI generate weekly plan ----------
async function aiGenerateFullWeek() {
    const profile = await getUserProfile();
    if (!profile) return;
    const goal = await showPrompt('Describe your fitness goal for the week:', '');
    if (!goal) return;

    const startMonday = getStartOfWeek(currentSelectedDate);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startMonday);
        d.setDate(startMonday.getDate() + i);
        weekDates.push(formatDateKey(d));
    }

    function localPlan() {
        const multiplier = profile.level === 'beginner' ? 0.4 : (profile.level === 'intermediate' ? 0.6 : 0.8);
        const base = Math.round(profile.weight * multiplier);
        const exercises = [
            { name: 'Bench Press', type: 'strength', sets: [{ weight: base, reps: 10, completed: false }, { weight: base+10, reps: 8, completed: false }] },
            { name: 'Squat', type: 'strength', sets: [{ weight: base+20, reps: 10, completed: false }, { weight: base+30, reps: 8, completed: false }] },
            { name: 'Running', type: 'cardio', duration: 20, distance: 3, completed: false }
        ];
        const plan = {};
        for (let dk of weekDates) plan[dk] = { name: getDayName(dk), exercises: JSON.parse(JSON.stringify(exercises)) };
        return plan;
    }

    const promptText = `Generate a 7-day workout plan.
User: weight ${profile.weight}kg, level ${profile.level}, goal "${goal}".
Dates as JSON keys: ${weekDates.join(', ')}.
Output ONLY JSON: {"days":{"${weekDates[0]}":{"exercises":[{"name":"...","type":"strength","sets":[{"weight":60,"reps":10,"completed":false}]}]}}}. For rest days use "exercises":[]`;

    try {
        document.getElementById('aiGenerateWeekPlanBtn').textContent = '🤖 Generating...';
        document.getElementById('aiGenerateWeekPlanBtn').disabled = true;
        const response = await callOpenRouterAPI(promptText);
        const parsed = extractAndFixJSON(response.content);
        if (parsed && parsed.days) {
            for (let dk of weekDates) {
                const dayData = parsed.days[dk];
                if (dayData && dayData.exercises) {
                    window.trainingPlanData[dk] = { name: getDayName(dk), exercises: dayData.exercises };
                } else {
                    window.trainingPlanData[dk] = { name: getDayName(dk), exercises: [] };
                }
            }
            saveTrainingPlanData();
            renderCalendar();
            showAlert('Weekly plan generated by AI!');
        } else {
            throw new Error('Invalid AI response');
        }
    } catch(e) {
        console.warn('AI failed, using local plan:', e);
        const fallback = localPlan();
        for (let dk of weekDates) window.trainingPlanData[dk] = fallback[dk];
        saveTrainingPlanData();
        renderCalendar();
        showAlert('AI response invalid. Used a default plan.');
    } finally {
        document.getElementById('aiGenerateWeekPlanBtn').textContent = '🤖 AI Generate Week Plan';
        document.getElementById('aiGenerateWeekPlanBtn').disabled = false;
    }
}

// ---------- Copy to next week with three options & reset completed ----------
function deepCopyAndResetCompleted(plan) {
    const copy = JSON.parse(JSON.stringify(plan));
    if (copy.exercises) {
        for (let ex of copy.exercises) {
            if (ex.type === 'strength' && ex.sets) {
                for (let set of ex.sets) set.completed = false;
            } else if (ex.type === 'cardio') {
                ex.completed = false;
            }
        }
    }
    return copy;
}

function copyToNextWeek() {
    const thisMonday = getStartOfWeek(currentSelectedDate);
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const thisWeek = [], nextWeek = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(thisMonday); d.setDate(thisMonday.getDate()+i); thisWeek.push(formatDateKey(d));
        d = new Date(nextMonday); d.setDate(nextMonday.getDate()+i); nextWeek.push(formatDateKey(d));
    }
    let hasData = false;
    for (let dk of thisWeek) if (window.trainingPlanData[dk]?.exercises?.length) { hasData = true; break; }
    if (!hasData) { showAlert('No plan for this week.'); return; }

    // 三选项自定义模态框
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 380px;">
            <div class="modal-header">Copy to Next Week</div>
            <div class="modal-body" style="text-align:center; margin-bottom: 20px;">
                How would you like to copy the plan?
            </div>
            <div class="modal-actions" style="flex-direction: column; gap: 10px;">
                <button id="copyDirectBtn" style="width:100%;">📋 Direct Copy (reset completed)</button>
                <button id="copyAiBtn" style="width:100%;">🤖 AI Adjust & Copy</button>
                <button id="copyCancelBtn" class="secondary" style="width:100%;">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();

    modal.querySelector('#copyDirectBtn').onclick = () => {
        cleanup();
        for (let i = 0; i < 7; i++) {
            const srcPlan = window.trainingPlanData[thisWeek[i]];
            if (srcPlan) {
                const newPlan = deepCopyAndResetCompleted(srcPlan);
                newPlan.name = getDayName(nextWeek[i]);
                window.trainingPlanData[nextWeek[i]] = newPlan;
            } else {
                window.trainingPlanData[nextWeek[i]] = { name: getDayName(nextWeek[i]), exercises: [] };
            }
        }
        saveTrainingPlanData();
        renderCalendar();
        showAlert('Copied to next week (completed flags reset).');
    };
    modal.querySelector('#copyAiBtn').onclick = async () => {
        cleanup();
        await aiAdjustNextWeek(thisWeek, nextWeek);
    };
    modal.querySelector('#copyCancelBtn').onclick = cleanup;
}

async function aiAdjustNextWeek(thisWeek, nextWeek) {
    const weekData = {};
    for (let dk of thisWeek) weekData[dk] = window.trainingPlanData[dk]?.exercises || [];
    const promptText = `Generate next week's plan (${nextWeek.join(',')}) with progressive overload based on: ${JSON.stringify(weekData)}. Return JSON {"days":{"${nextWeek[0]}":{"exercises":[...]}}}. Only JSON.`;
    try {
        const response = await callOpenRouterAPI(promptText);
        const parsed = extractAndFixJSON(response.content);
        if (parsed && parsed.days) {
            for (let i=0;i<7;i++) {
                const dk = nextWeek[i];
                const dayData = parsed.days[dk];
                if (dayData && dayData.exercises) {
                    window.trainingPlanData[dk] = { name: getDayName(dk), exercises: dayData.exercises };
                } else {
                    window.trainingPlanData[dk] = { name: getDayName(dk), exercises: [] };
                }
                // 确保所有completed为false
                if (window.trainingPlanData[dk].exercises) {
                    for (let ex of window.trainingPlanData[dk].exercises) {
                        if (ex.type === 'strength' && ex.sets) for (let s of ex.sets) s.completed = false;
                        if (ex.type === 'cardio') ex.completed = false;
                    }
                }
            }
            saveTrainingPlanData();
            renderCalendar();
            showAlert('AI generated next week plan (completed reset).');
        } else throw new Error();
    } catch(e) {
        showAlert('AI failed, using direct copy with reset.');
        for (let i=0;i<7;i++) {
            const src = thisWeek[i], dst = nextWeek[i];
            if (window.trainingPlanData[src]) {
                const newPlan = deepCopyAndResetCompleted(window.trainingPlanData[src]);
                newPlan.name = getDayName(dst);
                window.trainingPlanData[dst] = newPlan;
            } else {
                window.trainingPlanData[dst] = { name: getDayName(dst), exercises: [] };
            }
        }
        saveTrainingPlanData();
        renderCalendar();
    }
}

// ---------- Month navigation ----------
function prevMonth() { currentSelectedDate.setMonth(currentSelectedDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { currentSelectedDate.setMonth(currentSelectedDate.getMonth() + 1); renderCalendar(); }

// ---------- Initialize ----------
function initTrainingPlanModule() {
    loadTrainingPlanData();
    renderCalendar();
    const aiGenBtn = document.getElementById('aiGenerateWeekPlanBtn');
    if (aiGenBtn) aiGenBtn.onclick = aiGenerateFullWeek;
    const container = document.querySelector('#plan-tab .card');
    if (container && !document.getElementById('copyToNextWeekBtn')) {
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copyToNextWeekBtn';
        copyBtn.textContent = '📅 Copy this week to next week';
        copyBtn.style.marginTop = '10px';
        copyBtn.style.marginRight = '10px';
        copyBtn.onclick = copyToNextWeek;
        container.insertBefore(copyBtn, container.querySelector('#calendarContainer'));
    }
    if (container && !document.getElementById('editProfileBtn')) {
        const profileBtn = document.createElement('button');
        profileBtn.id = 'editProfileBtn';
        profileBtn.textContent = '✏️ Update Body Data';
        profileBtn.style.marginTop = '10px';
        profileBtn.onclick = updateUserProfile;
        container.insertBefore(profileBtn, container.querySelector('#calendarContainer'));
    }
}

function clearAllExercises(dateKey) {
    showConfirmDialog('⚠️ Delete ALL exercises for this day? This cannot be undone.', () => {
        const dayPlan = window.trainingPlanData[dateKey];
        if (!dayPlan) return;
        dayPlan.exercises = [];
        saveTrainingPlanData();
        renderDayDetail(dayPlan);
        showAlert('All exercises deleted for this day.');
    });
}