# 🔥 Firebase Setup Guide for FitMind AI Coach

## Overview
This guide will help you set up Firebase Authentication and Firestore Database for cloud sync functionality.

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or select an existing project
3. Enter project name: `FitMind-AI-Coach` (or your choice)
4. (Optional) Enable Google Analytics
5. Click **"Create project"**

---

## Step 2: Add Web App to Firebase Project

1. In Firebase Console, click the **Web icon (</>)** to add a web app
2. Register app nickname: `FitMind Web App`
3. **Check** "Also set up Firebase Hosting" (optional)
4. Click **"Register app"**
5. **Copy the Firebase configuration object** - you'll need this!

It should look like:
```javascript
{
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "fitmind-xxxxx.firebaseapp.com",
  projectId: "fitmind-xxxxx",
  storageBucket: "fitmind-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
}
```

---

## Step 3: Configure Firebase in Your App

1. Open `firebase-config.js` in your project
2. Replace the placeholder values with your Firebase config:

```javascript
const FIREBASE_CONFIG = {
    apiKey: "YOUR_ACTUAL_API_KEY",              // ← Replace this
    authDomain: "your-project.firebaseapp.com", // ← Replace this
    projectId: "your-project-id",                // ← Replace this
    storageBucket: "your-project.appspot.com",   // ← Replace this
    messagingSenderId: "123456789012",           // ← Replace this
    appId: "1:123456789012:web:abcdef123456"    // ← Replace this
};
```

3. Save the file

---

## Step 4: Enable Authentication

1. In Firebase Console, go to **"Authentication"** in the left sidebar
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Enable the following providers:

### Email/Password Authentication:
- Click on **"Email/Password"**
- Toggle **"Enable"** switch
- Click **"Save"**

### Google Sign-In (Optional but Recommended):
- Click on **"Google"**
- Toggle **"Enable"** switch
- Select a support email (your email)
- Click **"Save"**

---

## Step 5: Create Firestore Database

1. In Firebase Console, go to **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. **Choose location**: Select closest to your users (e.g., `us-central1`, `europe-west1`)
4. **Start in production mode** (we'll add security rules next)
5. Click **"Enable"**

---

## Step 6: Set Up Firestore Security Rules

1. In Firestore Database, click on the **"Rules"** tab
2. Replace the default rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User documents - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // User workouts subcollection
      match /workouts/{workoutId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // User chat sessions subcollection
      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

3. Click **"Publish"**

### What These Rules Do:
- ✅ Only authenticated users can access data
- ✅ Users can only read/write their own data (not other users')
- ✅ Protects workouts and chats subcollections
- ❌ Prevents unauthorized access

---

## Step 7: Test Your Setup

1. Open your app in a browser
2. You should see a banner: **"📴 Offline Mode - Sign In to enable cloud sync"**
3. Click **"Sign In"** or the settings gear icon (⚙️)
4. Create a new account with email/password or Google
5. After signing in, you should see:
   - Your email/avatar in the header
   - **"☁️ Syncing data..."** banner
   - Data automatically syncing to cloud

---

## Step 8: Verify Data in Firestore

1. Go back to Firebase Console → **Firestore Database**
2. You should see a new document structure:
   ```
   users/
     └── [your-user-id]/
           ├── (user preferences)
           ├── workouts/
           │     └── [workout documents]
           └── chats/
                 └── [chat documents]
   ```

3. Try these tests:
   - ✅ Complete a workout → Check if it appears in Firestore
   - ✅ Send a chat message → Check if it syncs to cloud
   - ✅ Sign in on another device → Data should sync automatically
   - ✅ Sign out and sign back in → All your data should load

---

## Troubleshooting

### ❌ "Firebase not configured" error
- **Solution**: Check that you replaced ALL placeholder values in `firebase-config.js`
- **Verify**: `apiKey` should NOT say `"YOUR_FIREBASE_API_KEY"`

### ❌ "Permission denied" in Firestore
- **Solution**: Make sure you published the security rules from Step 6
- **Check**: Go to Firestore → Rules tab → Verify rules are active

### ❌ Google Sign-In popup doesn't work
- **Solution**: Add your domain to authorized domains:
  1. Firebase Console → Authentication → Settings
  2. Scroll to "Authorized domains"
  3. Add `localhost` and your domain

### ❌ Data not syncing
- **Solution**: Open browser console (F12) and check for errors
- **Check**: Make sure you're signed in (check header for email/avatar)

---

## Optional: Enable Offline Persistence

Offline persistence is **already enabled** in your app! This means:
- ✅ App works offline with local data
- ✅ Changes sync automatically when back online
- ✅ No data loss during network issues

---

## Security Best Practices

1. **Never commit `firebase-config.js` with real credentials to public repos**
   - Add it to `.gitignore` if making public
   - For this private project, it's fine

2. **Keep security rules strict**
   - Users should only access their own data
   - Never set `allow read, write: if true;` in production

3. **Monitor usage**
   - Firebase has generous free tier: 50,000 reads/day, 20,000 writes/day
   - Check Firebase Console → Usage tab

---

## Free Tier Limits

Firebase Spark Plan (Free) includes:
- ✅ 50,000 reads/day
- ✅ 20,000 writes/day  
- ✅ 1 GB storage
- ✅ 10 GB/month network egress
- ✅ Unlimited Authentication users

**This is MORE than enough for personal use!**

---

## Need Help?

- 📚 [Firebase Documentation](https://firebase.google.com/docs)
- 🔐 [Authentication Guide](https://firebase.google.com/docs/auth/web/start)
- 💾 [Firestore Guide](https://firebase.google.com/docs/firestore/quickstart)
- ⚡ [Security Rules Reference](https://firebase.google.com/docs/firestore/security/get-started)

---

## Summary Checklist

- [ ] Created Firebase project
- [ ] Added web app to project
- [ ] Copied Firebase config to `firebase-config.js`
- [ ] Enabled Email/Password authentication
- [ ] (Optional) Enabled Google Sign-In
- [ ] Created Firestore database
- [ ] Published security rules
- [ ] Tested sign-in and data sync
- [ ] Verified data appears in Firestore Console

**Once all checked, your cloud sync is ready! 🎉**
