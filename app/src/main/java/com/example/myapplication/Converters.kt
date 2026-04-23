package com.example.myapplication

import androidx.room.TypeConverter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.UUID

class UUIDConverter {
    @TypeConverter
    fun fromUUID(uuid: UUID?): String? {
        return uuid?.toString()
    }

    @TypeConverter
    fun toUUID(uuidString: String?): UUID? {
        return uuidString?.let { UUID.fromString(it) }
    }
}

class StringListConverter {
    private val gson = Gson()

    @TypeConverter
    fun fromStringList(list: List<String>?): String? {
        return list?.let { gson.toJson(it) }
    }

    @TypeConverter
    fun toStringList(data: String?): List<String> {
        return if (data.isNullOrEmpty()) {
            emptyList()
        } else {
            val type = object : TypeToken<List<String>>() {}.type
            gson.fromJson(data, type) ?: emptyList()
        }
    }
}
class FitnessLevelConverter {
    @TypeConverter
    fun fromFitnessLevel(level: FitnessLevel?): String? {
        return level?.name
    }

    @TypeConverter
    fun toFitnessLevel(levelString: String?): FitnessLevel? {
        return levelString?.let {

            try {
                FitnessLevel.valueOf(it)
            } catch (e: IllegalArgumentException) {
                FitnessLevel.BEGINNER
            }
        }
    }
}