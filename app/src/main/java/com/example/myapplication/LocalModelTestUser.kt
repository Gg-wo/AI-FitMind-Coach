package com.example.myapplication

import android.content.Context
import java.util.UUID
import androidx.core.content.edit


object TestUserInitializer {

    private const val PREF_NAME = "app_prefs"
    private const val KEY_CURRENT_USER_ID = "current_user_id"

    suspend fun initialize(context: Context, db: AppDatabase): UUID {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val cachedUserId = prefs.getString(KEY_CURRENT_USER_ID, null)?.let { UUID.fromString(it) }

        // if we have a cached ID and it still exists in DB, use it
        if (cachedUserId != null) {
            val existing = db.userProfileDao().getUserProfileByUserId(cachedUserId)
            if (existing != null) return cachedUserId
        }

        // else if DB already has users, choose first and cache it
        val firstUser = db.userProfileDao().getAllUserProfiles().firstOrNull()
        if (firstUser != null) {
            prefs.edit { putString(KEY_CURRENT_USER_ID, firstUser.userId.toString()) }
            return firstUser.userId
        }

        // else create fake user and cache new ID
        val fake = createTestUser()
        db.userProfileDao().insertUserProfile(fake)
        prefs.edit { putString(KEY_CURRENT_USER_ID, fake.userId.toString()) }
        return fake.userId
    }

    private fun createTestUser(): UserProfile {
        return UserProfile(
            userId = UUID.randomUUID(),
            profileName = "Test User One",
            profileAge = 25,
            profileGender = "Male",
            profileHeight = 175.0f,
            profileWeight = 70.0f,
            profileFitnessLevel = FitnessLevel.INTERMEDIATE,
            profileGoals = listOf("Build muscle", "Improve endurance"),
            profileTargetWeight = 75.0f,
            profileWorkoutFrequency = 3
        )
    }
}