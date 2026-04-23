package com.example.myapplication

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import java.util.UUID

@Dao
interface UserProfileDao {
    @Insert
    suspend fun insertUserProfile(userProfile: UserProfile)

    @Update
    suspend fun updateUserProfile(userProfile: UserProfile)

    @Delete
    suspend fun deleteUserProfile(userProfile: UserProfile)

    @Query("SELECT * FROM user_profile WHERE user_id = :userId")
    suspend fun getUserProfileByUserId(userId: UUID): UserProfile?

    @Query("SELECT * FROM user_profile WHERE profile_name = :name")
    suspend fun getUserProfileByProfileName(name: String): UserProfile?

    @Query("SELECT * FROM user_profile")
    suspend fun getAllUserProfiles(): List<UserProfile>

    @Query("DELETE FROM user_profile WHERE user_id = :userId")
    suspend fun deleteUserProfileByUserId(userId: UUID)
}

@Dao
interface ChatDao {
    @Insert
    suspend fun insertChat(chat: Chat): Long

    @Update
    suspend fun updateChat(chat: Chat)

    @Delete
    suspend fun deleteChat(chat: Chat)

    @Query("SELECT * FROM chat WHERE chat_id = :chatId")
    suspend fun getChatByChatId(chatId: Int): Chat?

    @Query("SELECT * FROM chat WHERE user_id = :userId ORDER BY chat_updated_at_timestamp ASC")
    suspend fun getChatsByUserId(userId: UUID): List<Chat>

    @Query("SELECT * FROM chat WHERE user_id = :userId AND chat_created_at_timestamp > :timestamp ORDER BY chat_updated_at_timestamp ASC")
    suspend fun getChatsByUserIdWithTimestamp(userId: UUID, timestamp: Long): List<Chat>

    @Query("DELETE FROM chat WHERE chat_id = :chatId")
    suspend fun deleteChatByChatId(chatId: Int)

    @Query("UPDATE chat SET system_prompt = :prompt, chat_updated_at_timestamp = :timestamp WHERE chat_id = :chatId")
    suspend fun updateSystemPrompt(chatId: Int, prompt: String, timestamp: Long)

    @Query("SELECT * FROM chat WHERE user_id = :userId ORDER BY chat_updated_at_timestamp DESC LIMIT 1")
    suspend fun getLatestChatByUserId(userId: UUID): Chat?
}

@Dao
interface MessageDao {
    @Insert
    suspend fun insertMessage(message: Message)

    //=============
    @Insert
    suspend fun insertMessages(messages: List<Message>)

    @Insert
    suspend fun insertMessages(vararg messages: Message)
    //=============

    @Update
    suspend fun updateMessage(message: Message)

    @Delete
    suspend fun deleteMessage(message: Message)

    @Query("SELECT * FROM message WHERE message_id = :messageId")
    suspend fun getMessageByMessageId(messageId: UUID): Message?

    @Query("SELECT * FROM message WHERE chat_id = :chatId ORDER BY message_created_at_timestamp ASC")
    suspend fun getMessagesByChatId(chatId: Int): List<Message>

    @Query("SELECT * FROM message WHERE user_id = :userId ORDER BY message_created_at_timestamp ASC")
    suspend fun getMessagesByUserId(userId: UUID): List<Message>

    @Query("SELECT * FROM message WHERE chat_id = :chatId AND is_user_message = :isUser ORDER BY message_created_at_timestamp DESC LIMIT 1")
    suspend fun getLastUserMessageByChatId(chatId: Int, isUser: Boolean): Message?

    @Query("SELECT * FROM message WHERE chat_id = :chatId AND message_created_at_timestamp > :timestamp ORDER BY message_created_at_timestamp ASC")
    suspend fun getRecentMessagesChatId(chatId: Int, timestamp: Long): List<Message>

    @Query("DELETE FROM message WHERE chat_id = :chatId")
    suspend fun deleteMessagesByChatId(chatId: Int)

    @Query("DELETE FROM message WHERE message_id = :messageId")
    suspend fun deleteMessageByMessageId(messageId: UUID)

    @Query("SELECT * FROM message WHERE chat_id = :chatId ORDER BY message_created_at_timestamp ASC LIMIT :limit")
    suspend fun getLimitedMessagesByChatId(chatId: Int, limit: Int = 50): List<Message>
}





























// for reference
//@Dao
//interface UserProfileDao {
//    @Query("SELECT * FROM user_profile")
//    fun getAll(): List<UserProfile>
//
//    // for reference
////    @Query("SELECT * FROM user_profile WHERE userId IN (:userIds)")
////    fun loadAllByIds(userIds: IntArray): List<UserProfile>
//
//    // for reference
////    @Query("SELECT * FROM user WHERE first_name LIKE :first AND " +
////            "last_name LIKE :last LIMIT 1")
////    fun findByName(first: String, last: String): User
//
//    @Query("SELECT * FROM user_profile WHERE userId =:userIds")
//    fun loadAllByIds(userIds: IntArray): UserProfile
//
//    @Query("SELECT * FROM user_profile WHERE profile_name = :name" )
//    fun findByName(name: String): UserProfile
//
//    @Insert
//    fun insertAll(vararg users: UserProfile)
//
//    @Delete
//    fun delete(user: UserProfile)
//}
