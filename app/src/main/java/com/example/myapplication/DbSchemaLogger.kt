package com.example.myapplication

import android.util.Log
import androidx.room.RoomDatabase
import androidx.sqlite.db.SimpleSQLiteQuery

object DbSchemaLogger {
    private const val TAG = "DB_SCHEMA"

    fun dump(db: RoomDatabase) {
        db.runInTransaction {
            // 1) DB version stored by SQLite
            db.query(SimpleSQLiteQuery("PRAGMA user_version")).use { c ->
                if (c.moveToFirst()) {
                    Log.d(TAG, "PRAGMA user_version = ${c.getInt(0)}")
                }
            }

            // 2) All tables/views/indexes Room created
            db.query(
                SimpleSQLiteQuery(
                    """
                    SELECT type, name, tbl_name, sql
                    FROM sqlite_master
                    WHERE name NOT LIKE 'android_%'
                    ORDER BY type, name
                    """.trimIndent()
                )
            ).use { c ->
                while (c.moveToNext()) {
                    val type = c.getString(0)
                    val name = c.getString(1)
                    val tbl = c.getString(2)
                    val sql = c.getString(3)
                    Log.d(TAG, "[$type] $name (tbl=$tbl) SQL=$sql")
                }
            }

            // 3) Per-table columns
            listOf("user_profile", "chat", "message").forEach { table ->
                db.query(SimpleSQLiteQuery("PRAGMA table_info($table)")).use { c ->
                    while (c.moveToNext()) {
                        val cid = c.getInt(0)
                        val colName = c.getString(1)
                        val colType = c.getString(2)
                        val notNull = c.getInt(3)
                        val dflt = c.getString(4)
                        val pk = c.getInt(5)
                        Log.d(
                            TAG,
                            "table=$table cid=$cid name=$colName type=$colType notNull=$notNull default=$dflt pk=$pk"
                        )
                    }
                }
            }
        }
    }
}
