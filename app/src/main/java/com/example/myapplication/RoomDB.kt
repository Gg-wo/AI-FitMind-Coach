package com.example.myapplication

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [
        UserProfile::class,
        Chat::class,
        Message::class,
        TrainingDay::class,
        TrainingExercise::class
    ],
    version = 2,
    exportSchema = false
)
@TypeConverters(UUIDConverter::class, FitnessLevelConverter::class, StringListConverter::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userProfileDao(): UserProfileDao
    abstract fun chatDao(): ChatDao
    abstract fun messageDao(): MessageDao
}