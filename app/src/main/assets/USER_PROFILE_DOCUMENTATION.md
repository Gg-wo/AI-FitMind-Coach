# User Profile Field Documentation

> Source: `index.html` · `app.js` (`getDefaultProfile`, `saveProfile`, `loadProfileIntoForm`)  
> Last updated: April 20, 2026

---

## Overview

The User Profile is stored in **localStorage** (keyed per user UID when signed in) and synced to **Firestore** for authenticated users. The profile object is defined by `getDefaultProfile()` in `app.js`.

---

## Profile Fields

### 1. Name
| Property | Value |
|----------|-------|
| Field ID | `profileName` |
| Profile Key | `name` |
| Input Type | `text` |
| Placeholder | `Your Name` |
| Default | `""` (empty string) |
| Constraints | None (free text) |
| Saved As | `String` |

---

### 2. Age
| Property | Value |
|----------|-------|
| Field ID | `profileAge` |
| Profile Key | `age` |
| Input Type | `number` |
| Placeholder | `25` |
| Default | `null` |
| Constraints | min: **13**, max: **120** |
| Saved As | `Integer` (`parseInt`) or `null` |

---

### 3. Sex
| Property | Value |
|----------|-------|
| Field ID | `profileSex` |
| Profile Key | `sex` |
| Input Type | `select` |
| Default | `""` (empty / unselected) |
| Saved As | `String` |

**Available Options:**

| Value | Label |
|-------|-------|
| `""` | *(Select)* — placeholder |
| `male` | Male |
| `female` | Female |
| `other` | Other |

---

### 4. Height
| Property | Value |
|----------|-------|
| Field ID | `profileHeight` |
| Profile Key | `height` |
| Input Type | `number` |
| Unit | **cm** |
| Placeholder | `170` |
| Default | `null` |
| Constraints | min: **100**, max: **250** |
| Saved As | `Float` (`parseFloat`) or `null` |

---

### 5. Weight (Current)
| Property | Value |
|----------|-------|
| Field ID | `profileWeight` |
| Profile Key | `weight` |
| Input Type | `number` |
| Unit | **kg** |
| Placeholder | `70` |
| Default | `null` |
| Constraints | min: **30**, max: **300**, step: **0.1** |
| Saved As | `Float` (`parseFloat`) or `null` |

---

### 6. Fitness Level
| Property | Value |
|----------|-------|
| Field ID | `profileFitnessLevel` |
| Profile Key | `fitnessLevel` |
| Input Type | `select` |
| Default | `""` (empty / unselected) |
| Saved As | `String` |

**Available Options:**

| Value | Label |
|-------|-------|
| `""` | *(Select your level)* — placeholder |
| `beginner` | 🌱 Beginner - Just starting out |
| `intermediate` | 💪 Intermediate - Regular exerciser |
| `advanced` | 🏆 Advanced - Experienced athlete |

---

### 7. Workout Frequency (Weekly Target)
| Property | Value |
|----------|-------|
| Field ID | `profileWorkoutFrequency` |
| Profile Key | `workoutFrequency` |
| Input Type | `range` (slider) |
| Unit | **days / week** |
| Default | `3` |
| Constraints | min: **1**, max: **7**, step: **1** |
| Saved As | `Integer` (`parseInt`) |

The label element (`profileWorkoutFrequencyValue`) displays the current value as `"N day(s)"`.

---

### 8. Fitness Goals
| Property | Value |
|----------|-------|
| Field ID | `goalChips` (container) |
| Profile Key | `goal` |
| Input Type | Multi-select toggle chips |
| Default | `[]` (empty array) |
| Saved As | `String[]` (array of selected goal values) |

**Available Goal Chips:**

| Value | Label |
|-------|-------|
| `weight-loss` | Lose weight |
| `muscle-gain` | Build muscle |
| `endurance` | Improve endurance |
| `flexibility` | Increase flexibility |
| `sleep` | Better sleep |
| `stress` | Reduce stress |
| `event` | Train for event |

> Multiple goals can be selected simultaneously.

---

### 9. Target Weight
| Property | Value |
|----------|-------|
| Field ID | `profileTargetWeight` |
| Profile Key | `targetWeight` |
| Input Type | `number` |
| Unit | **kg** |
| Placeholder | `65` |
| Default | `null` |
| Constraints | min: **30**, max: **300**, step: **0.1** |
| Saved As | `Float` (`parseFloat`) or `null` |

---

### 10. Avatar / Profile Photo
| Property | Value |
|----------|-------|
| Field ID | `profilePhoto` |
| Profile Key | `photoEmoji` |
| Input Type | Emoji picker (button grid) |
| Default | `👤` |
| Saved As | `String` (single emoji character) |

**Available Avatars:**

`👤` `😊` `💪` `🏃` `🧘` `🚴` `🏋️` `⚡` `🔥` `🌟` `🎯` `🦸` `🥇` `👨` `👩` `🧑`

---

### 11. Email
| Property | Value |
|----------|-------|
| Field ID | `profileEmail` |
| Profile Key | `email` |
| Input Type | `email` (disabled — read-only) |
| Default | `""` |
| Saved As | `String` |

> This field is **read-only** in the UI. It is populated from Firebase Auth when the user is signed in.

---

## Internal / Auto-managed Fields

These fields are **not directly editable** in the UI but are stored as part of the profile object:

| Profile Key | Type | Description |
|-------------|------|-------------|
| `createdAt` | `String` (ISO 8601) | Timestamp when the profile was first created |
| `updatedAt` | `String` (ISO 8601) | Timestamp of the last save |
| `units` | `String` | Unit system — default: `"metric"` |
| `notifications` | `String` | Notification preference — default: `"all"` |
| `diet` | `String` | Diet preference — default: `""` |

---

## Default Profile Object

```js
{
    name: '',
    email: '',
    age: null,
    sex: '',
    height: null,         // cm
    weight: null,         // kg
    fitnessLevel: '',
    goal: [],
    targetWeight: null,   // kg
    workoutFrequency: 3,  // days/week
    units: 'metric',
    notifications: 'all',
    diet: '',
    photoEmoji: '👤',
    createdAt: '<ISO timestamp>'
}
```

---

## Storage

| Scope | Mechanism | Key Pattern |
|-------|-----------|-------------|
| Guest / local | `localStorage` | `fitmind_user_profile` |
| Authenticated user | `localStorage` + Firestore | `fitmind_user_profile_<uid>` |

Data is synced to Firestore via `window.firebaseSync.saveUserProfile(profile)` when the user is signed in.

