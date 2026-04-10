// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.state

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/**
 * Lightweight persistence for Q SDK state using SharedPreferences.
 */
class QState(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("dev.useq.sdk", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_BUBBLE_X = "q_bubble_x"
        private const val KEY_BUBBLE_Y = "q_bubble_y"
        private const val KEY_SESSION_ID = "q_session_id"
    }

    // MARK: - Bubble position

    var bubbleX: Float
        get() = prefs.getFloat(KEY_BUBBLE_X, -1f)
        set(value) = prefs.edit().putFloat(KEY_BUBBLE_X, value).apply()

    var bubbleY: Float
        get() = prefs.getFloat(KEY_BUBBLE_Y, -1f)
        set(value) = prefs.edit().putFloat(KEY_BUBBLE_Y, value).apply()

    // MARK: - Session

    val sessionId: String
        get() {
            val existing = prefs.getString(KEY_SESSION_ID, null)
            if (existing != null) return existing
            val newId = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_SESSION_ID, newId).apply()
            return newId
        }

    fun resetSession() {
        prefs.edit().remove(KEY_SESSION_ID).apply()
    }
}
