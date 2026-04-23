package com.example.myapplication

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey
import java.util.UUID

//---not support, not finish---
@Entity(
    tableName = "training_exercise",
    foreignKeys = [ForeignKey(
        entity = TrainingDay::class,
        parentColumns = ["training_day_id"],
        childColumns = ["training_day_id"],
        onDelete = ForeignKey.CASCADE,
        // never update
        onUpdate = ForeignKey.NO_ACTION
    )]
)
data class TrainingExercise(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "training_exercise_id")
    val trainingExerciseId: Int = 0,
    @ColumnInfo(name = "training_day_id") val trainingDayId: Int,
    @ColumnInfo(name = "exercises_name") val exercisesName: String,
    @ColumnInfo(name = "exercises_body_part") val exercisesBodyPart: String,
    @ColumnInfo(name = "exercises_equipment") val exercisesEquipment: String,
    @ColumnInfo(name = "exercises_sets") val exercisesSets: Int,
    @ColumnInfo(name = "exercises_reps") val exercisesReps: Int,
    @ColumnInfo(name = "exercises_weight_kg") val exercisesWeightKg: Float,
    @ColumnInfo(name = "exercises_rest_secs") val exercisesRestSecs: Int,
    @ColumnInfo(name = "exercises_order") val exercisesOrder: Int
)
//------
//---not support, not finish---
@Entity(
    tableName = "training_day",
    foreignKeys = [ForeignKey(
        entity = UserProfile::class,
        parentColumns = ["user_id"],
        childColumns = ["user_id"],
        onDelete = ForeignKey.CASCADE,
        onUpdate = ForeignKey.NO_ACTION
    )]
)
data class TrainingDay(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "training_day_id")
    val trainingDayId: Int = 0,
    @ColumnInfo(name = "training_timestamp") val trainingTimestamp: Long,
    @ColumnInfo(name = "user_id") val userId: UUID
)
//------
@Entity(
    tableName = "user_profile",
)
data class UserProfile(
    @PrimaryKey
    @ColumnInfo(name = "user_id")
    val userId: UUID = UUID.randomUUID(),
    @ColumnInfo(name = "profile_name") val profileName: String,
    @ColumnInfo(name = "profile_age") val profileAge: Int,
    @ColumnInfo(name = "profile_gender") val profileGender: String,
    @ColumnInfo(name = "profile_height") val profileHeight: Float,
    @ColumnInfo(name = "profile_weight") val profileWeight: Float,
    @ColumnInfo(name = "profile_fitness_level") val profileFitnessLevel: FitnessLevel,
    @ColumnInfo(name = "profile_goals") val profileGoals: List<String>,
    @ColumnInfo(name = "profile_target_weight") val profileTargetWeight: Float,
    @ColumnInfo(name = "profile_workout_frequency") val profileWorkoutFrequency: Int
)

@Entity(
    tableName = "chat",
    foreignKeys = [ForeignKey(
        entity = UserProfile::class,
        parentColumns = ["user_id"],
        childColumns = ["user_id"],
        onDelete = ForeignKey.CASCADE,
        onUpdate = ForeignKey.NO_ACTION
    )]
)
data class Chat(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "chat_id")
    val chatId: Int = 0,
    @ColumnInfo(name = "user_id") val userId: UUID,
    @ColumnInfo(name = "system_prompt") val systemPrompt: String,
    @ColumnInfo(name = "is_user_message") val isUserMessage: Boolean,
    @ColumnInfo(name = "chat_created_at_timestamp") val chatCreatedAtTimeStamp: Long,
    @ColumnInfo(name = "chat_updated_at_timestamp") val chatUpdatedAtTimeStamp: Long
)

@Entity(
    tableName = "message",
    foreignKeys = [
        ForeignKey(
            entity = Chat::class,
            parentColumns = ["chat_id"],
            childColumns = ["chat_id"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.NO_ACTION
        ),
        ForeignKey(
            entity = UserProfile::class,
            parentColumns = ["user_id"],
            childColumns = ["user_id"],
            onDelete = ForeignKey.CASCADE,
            onUpdate = ForeignKey.NO_ACTION
        )
    ]
)
data class Message(
    @PrimaryKey
    @ColumnInfo(name = "message_id")
    val messageId: UUID,
    @ColumnInfo(name = "chat_id") val chatId: Int,
    @ColumnInfo(name = "user_id") val userId: UUID,
    // Raw model-side text.
    // - user row: full prompt sent to the model for that turn
    // - model row: raw model output stream with control tokens
    @ColumnInfo(name = "raw_content") val rawContent: String,
    @ColumnInfo(name = "clean_content") val cleanContent: String,
    @ColumnInfo(name = "thinking_content") val thinkingContent: String? = null,
    // user and llm message both will store in message
    @ColumnInfo(name = "is_user_message") val isUserMessage: Boolean,
    @ColumnInfo(name = "message_created_at_timestamp") val messageCreatedAtTimeStamp: Long
)