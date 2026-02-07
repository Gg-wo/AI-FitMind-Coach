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
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
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
