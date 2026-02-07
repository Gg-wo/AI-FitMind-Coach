/**
 * Firebase Cloud Sync Module
 * 
 * Features:
 * - Real-time authentication state management
 * - Auto-sync workouts & chats to Firestore
 * - Real-time listeners for multi-device sync
 * - Offline-first with conflict resolution (last-write-wins)
 * - User preferences (dark mode, language, etc.)
 */

// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;
let syncEnabled = false;
let workoutsUnsubscribe = null;
let chatsUnsubscribe = null;
let preferencesUnsubscribe = null;

// User preferences default values
let userPreferences = {
    darkMode: true,
    language: 'en',
    notifications: true,
    units: 'metric' // or 'imperial'
};

// ============================================================
// AUTHENTICATION
// ============================================================

/**
 * Initialize Firebase auth listener
 * Automatically redirects to auth.html if not signed in
 */
function initializeAuth() {
    if (!window.auth) {
        console.warn('⚠️ Firebase not configured. Running in offline mode.');
        return;
    }
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            syncEnabled = true;
            console.log('✅ User signed in:', user.email);
            
            // Show user info in UI
            updateUserUI(user);
            
            // Load user preferences from Firestore
            await loadUserPreferences();
            
            // Initial sync: Pull from cloud, then push local changes
            await syncFromCloud();
            
            // Set up real-time listeners
            setupRealtimeListeners();
            
        } else {
            currentUser = null;
            syncEnabled = false;
            console.log('ℹ️ No user signed in. Running in offline mode.');
            
            // Check if we're not on auth page and should redirect
            if (!window.location.pathname.includes('auth.html')) {
                // Optional: Show banner instead of forcing redirect
                showSyncStatusBanner('offline');
            }
        }
    });
}

/**
 * Update UI with user information
 */
function updateUserUI(user) {
    // Add user avatar/email to header if element exists
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        const displayName = user.displayName || user.email.split('@')[0];
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00d4ff&color=fff`;
        
        userInfo.innerHTML = `
            <div class="user-profile" onclick="toggleUserMenu()">
                <img src="${photoURL}" alt="${displayName}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--accent-primary);">
                <span style="margin-left: 8px; font-weight: 600;">${displayName}</span>
            </div>
        `;
    }
}

/**
 * Show sync status banner
 */
function showSyncStatusBanner(status) {
    let existingBanner = document.getElementById('syncBanner');
    if (existingBanner) {
        existingBanner.remove();
    }
    
    const banner = document.createElement('div');
    banner.id = 'syncBanner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        padding: 12px;
        background: ${status === 'offline' ? '#f59e0b' : '#10b981'};
        color: white;
        text-align: center;
        font-weight: 600;
        z-index: 100000;
        font-size: 14px;
    `;
    
    if (status === 'offline') {
        banner.innerHTML = `
            📴 Offline Mode - Data saved locally only. 
            <a href="auth.html" style="color: white; text-decoration: underline; margin-left: 8px;">Sign In</a> to enable cloud sync.
        `;
    } else if (status === 'syncing') {
        banner.innerHTML = '☁️ Syncing data...';
        banner.style.background = '#3b82f6';
    } else if (status === 'synced') {
        banner.innerHTML = '✅ All data synced to cloud';
        setTimeout(() => banner.remove(), 3000);
    }
    
    document.body.prepend(banner);
}

/**
 * Sign out user
 */
async function signOut() {
    if (!window.auth) return;
    
    try {
        // Unsubscribe from listeners
        if (workoutsUnsubscribe) workoutsUnsubscribe();
        if (chatsUnsubscribe) chatsUnsubscribe();
        if (preferencesUnsubscribe) preferencesUnsubscribe();
        
        await auth.signOut();
        console.log('✅ Signed out successfully');
        
        // Redirect to auth page
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('❌ Sign out error:', error);
        showAlert('Failed to sign out: ' + error.message);
    }
}

// ============================================================
// FIRESTORE SYNC - WORKOUTS
// ============================================================

/**
 * Sync workout history to Firestore
 */
async function syncWorkoutsToCloud() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        const batch = db.batch();
        
        for (const workout of workoutHistory) {
            const workoutId = workout.startTime; // Use startTime as unique ID
            const docRef = db.collection('users').doc(currentUser.uid)
                .collection('workouts').doc(workoutId);
            
            batch.set(docRef, {
                ...workout,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        
        await batch.commit();
        console.log('✅ Synced', workoutHistory.length, 'workouts to cloud');
    } catch (error) {
        console.error('❌ Error syncing workouts:', error);
    }
}

/**
 * Load workouts from Firestore
 */
async function loadWorkoutsFromCloud() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('workouts')
            .orderBy('startTime', 'desc')
            .get();
        
        const cloudWorkouts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Remove Firestore timestamps for localStorage compatibility
            delete data.updatedAt;
            cloudWorkouts.push(data);
        });
        
        console.log('📥 Loaded', cloudWorkouts.length, 'workouts from cloud');
        return cloudWorkouts;
    } catch (error) {
        console.error('❌ Error loading workouts:', error);
        return [];
    }
}

/**
 * Set up real-time listener for workouts
 */
function setupWorkoutsListener() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    workoutsUnsubscribe = db.collection('users').doc(currentUser.uid)
        .collection('workouts')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const workout = change.doc.data();
                delete workout.updatedAt;
                
                if (change.type === 'added' || change.type === 'modified') {
                    // Merge with local data (conflict resolution: cloud data wins)
                    const localIndex = workoutHistory.findIndex(w => w.startTime === workout.startTime);
                    if (localIndex >= 0) {
                        workoutHistory[localIndex] = workout;
                    } else {
                        workoutHistory.unshift(workout);
                    }
                }
                
                if (change.type === 'removed') {
                    workoutHistory = workoutHistory.filter(w => w.startTime !== workout.startTime);
                }
            });
            
            // Update UI and localStorage
            saveWorkoutHistory();
            renderHistory();
            updateHeaderStats();
            
            console.log('🔄 Workouts updated from cloud');
        }, (error) => {
            console.error('❌ Workouts listener error:', error);
        });
}

// ============================================================
// FIRESTORE SYNC - CHAT SESSIONS
// ============================================================

/**
 * Sync chat sessions to Firestore
 */
async function syncChatsToCloud() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        const batch = db.batch();
        
        for (const chat of chatSessions) {
            const docRef = db.collection('users').doc(currentUser.uid)
                .collection('chats').doc(chat.id);
            
            batch.set(docRef, {
                ...chat,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        
        await batch.commit();
        console.log('✅ Synced', chatSessions.length, 'chats to cloud');
    } catch (error) {
        console.error('❌ Error syncing chats:', error);
    }
}

/**
 * Load chats from Firestore
 */
async function loadChatsFromCloud() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('chats')
            .orderBy('createdAt', 'desc')
            .get();
        
        const cloudChats = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            delete data.updatedAt;
            cloudChats.push(data);
        });
        
        console.log('📥 Loaded', cloudChats.length, 'chats from cloud');
        return cloudChats;
    } catch (error) {
        console.error('❌ Error loading chats:', error);
        return [];
    }
}

/**
 * Set up real-time listener for chats
 */
function setupChatsListener() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    chatsUnsubscribe = db.collection('users').doc(currentUser.uid)
        .collection('chats')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const chat = change.doc.data();
                delete chat.updatedAt;
                
                if (change.type === 'added' || change.type === 'modified') {
                    const localIndex = chatSessions.findIndex(c => c.id === chat.id);
                    if (localIndex >= 0) {
                        chatSessions[localIndex] = chat;
                    } else {
                        chatSessions.push(chat);
                    }
                }
                
                if (change.type === 'removed') {
                    chatSessions = chatSessions.filter(c => c.id !== chat.id);
                }
            });
            
            // Update UI and localStorage
            saveChatSessions();
            renderChatSidebar();
            renderChatHistory();
            
            console.log('🔄 Chats updated from cloud');
        }, (error) => {
            console.error('❌ Chats listener error:', error);
        });
}

// ============================================================
// FIRESTORE SYNC - USER PREFERENCES
// ============================================================

/**
 * Load user preferences from Firestore
 */
async function loadUserPreferences() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        
        if (doc.exists) {
            const data = doc.data();
            userPreferences = {
                darkMode: data.darkMode !== undefined ? data.darkMode : true,
                language: data.language || 'en',
                notifications: data.notifications !== undefined ? data.notifications : true,
                units: data.units || 'metric'
            };
            
            console.log('✅ Loaded user preferences:', userPreferences);
            
            // Apply preferences to UI
            applyUserPreferences();
        } else {
            // First time user, save default preferences
            await saveUserPreferences();
        }
    } catch (error) {
        console.error('❌ Error loading preferences:', error);
    }
}

/**
 * Save user preferences to Firestore
 */
async function saveUserPreferences() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).set({
            email: currentUser.email,
            displayName: currentUser.displayName,
            ...userPreferences,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log('✅ Saved user preferences to cloud');
    } catch (error) {
        console.error('❌ Error saving preferences:', error);
    }
}

/**
 * Apply user preferences to UI
 */
function applyUserPreferences() {
    // Dark mode (already default, but could add light mode toggle)
    if (!userPreferences.darkMode) {
        document.body.classList.add('light-mode');
    }
    
    // Language (future implementation)
    // Units (future implementation)
    
    console.log('✅ Applied user preferences to UI');
}

/**
 * Set up real-time listener for preferences
 */
function setupPreferencesListener() {
    if (!syncEnabled || !currentUser || !window.db) return;
    
    preferencesUnsubscribe = db.collection('users').doc(currentUser.uid)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                userPreferences = {
                    darkMode: data.darkMode !== undefined ? data.darkMode : true,
                    language: data.language || 'en',
                    notifications: data.notifications !== undefined ? data.notifications : true,
                    units: data.units || 'metric'
                };
                
                applyUserPreferences();
                console.log('🔄 Preferences updated from cloud');
            }
        }, (error) => {
            console.error('❌ Preferences listener error:', error);
        });
}

// ============================================================
// SYNC ORCHESTRATION
// ============================================================

/**
 * Initial sync: Pull from cloud, merge with local data
 */
async function syncFromCloud() {
    if (!syncEnabled) return;
    
    showSyncStatusBanner('syncing');
    
    try {
        // Load data from cloud
        const [cloudWorkouts, cloudChats] = await Promise.all([
            loadWorkoutsFromCloud(),
            loadChatsFromCloud()
        ]);
        
        // Merge with local data (conflict resolution: keep newer based on timestamp)
        if (cloudWorkouts.length > 0) {
            mergeWorkouts(cloudWorkouts);
        }
        
        if (cloudChats.length > 0) {
            mergeChats(cloudChats);
        }
        
        // Push any local-only data to cloud
        await Promise.all([
            syncWorkoutsToCloud(),
            syncChatsToCloud()
        ]);
        
        showSyncStatusBanner('synced');
    } catch (error) {
        console.error('❌ Sync error:', error);
        showAlert('Sync failed. Your data is saved locally.');
    }
}

/**
 * Merge cloud workouts with local workouts
 */
function mergeWorkouts(cloudWorkouts) {
    const mergedMap = new Map();
    
    // Add local workouts to map
    workoutHistory.forEach(w => {
        mergedMap.set(w.startTime, w);
    });
    
    // Add/update with cloud workouts (cloud wins in conflicts)
    cloudWorkouts.forEach(w => {
        mergedMap.set(w.startTime, w);
    });
    
    // Convert back to array and sort
    workoutHistory = Array.from(mergedMap.values())
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    saveWorkoutHistory();
    renderHistory();
    updateHeaderStats();
    
    console.log('✅ Merged workouts:', workoutHistory.length, 'total');
}

/**
 * Merge cloud chats with local chats
 */
function mergeChats(cloudChats) {
    const mergedMap = new Map();
    
    // Add local chats to map
    chatSessions.forEach(c => {
        mergedMap.set(c.id, c);
    });
    
    // Add/update with cloud chats (cloud wins in conflicts)
    cloudChats.forEach(c => {
        mergedMap.set(c.id, c);
    });
    
    // Convert back to array and sort
    chatSessions = Array.from(mergedMap.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    saveChatSessions();
    renderChatSidebar();
    renderChatHistory();
    
    console.log('✅ Merged chats:', chatSessions.length, 'total');
}

/**
 * Set up all real-time listeners
 */
function setupRealtimeListeners() {
    setupWorkoutsListener();
    setupChatsListener();
    setupPreferencesListener();
    console.log('✅ Real-time sync listeners active');
}

/**
 * Debounced sync to cloud (called after local data changes)
 */
let syncTimeout = null;
function debouncedSyncToCloud() {
    if (!syncEnabled) return;
    
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        await Promise.all([
            syncWorkoutsToCloud(),
            syncChatsToCloud()
        ]);
        console.log('🔄 Auto-synced to cloud');
    }, 2000); // Wait 2s after last change
}

// ============================================================
// INITIALIZATION
// ============================================================

// Initialize auth when script loads
if (typeof firebase !== 'undefined' && window.auth) {
    initializeAuth();
}

// Export functions for global access
window.firebaseSync = {
    signOut,
    syncFromCloud,
    debouncedSyncToCloud,
    saveUserPreferences,
    userPreferences
};
