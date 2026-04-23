/**
 * Firebase Configuration
 * 
 * To set up Firebase for your app:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or use existing)
 * 3. Add a Web app to your project
 * 4. Copy the Firebase config values below
 * 5. Enable Authentication (Email/Password + Google)
 * 6. Create a Firestore database in production mode
 * 7. Set up Firestore security rules (see FIRESTORE_RULES.txt)
 */

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCwHwAmOu1HRWtfoc3-7IbmszIUu1t-M4E",
    authDomain: "fitmind-ai-eba88.firebaseapp.com",
    projectId: "fitmind-ai-eba88",
    storageBucket: "fitmind-ai-eba88.firebasestorage.app",
    messagingSenderId: "695472345697",
    appId: "1:695472345697:web:8556e2d665634b7a0dd020",
    measurementId: "G-RPYQJYTREE"
};

// Initialize Firebase
if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey !== 'YOUR_FIREBASE_API_KEY') {
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        console.log('✅ Firebase initialized successfully');
        
        // Get references to Firebase services
        window.auth = firebase.auth();
        window.db = firebase.firestore();
        
        // Enable offline persistence
        db.enablePersistence({ synchronizeTabs: true })
            .then(() => {
                console.log('✅ Offline persistence enabled');
            })
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn('⚠️ Multiple tabs open, persistence enabled in first tab only');
                } else if (err.code === 'unimplemented') {
                    console.warn('⚠️ Browser doesn\'t support offline persistence');
                }
            });
            
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
    }
} else {
    console.warn('⚠️ Firebase not configured. Please update firebase-config.js with your Firebase credentials.');
    console.warn('ℹ️ App will continue to work with localStorage only (no cloud sync).');
}
