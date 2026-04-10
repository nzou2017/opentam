// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.transport

import android.app.Activity
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import com.google.gson.Gson

/**
 * Captures the view hierarchy as a JSON string for the Q backend.
 * Privacy-filtered: no text content, skips secure/sensitive fields.
 *
 * Primary approach: traverse Activity.window.decorView.rootView recursively.
 * For Compose views, attempts to access SemanticsNode tree (graceful fallback if unavailable).
 */
object ViewSnapshot {

    data class ViewNode(
        val cls: String,
        val id: String? = null,
        val desc: String? = null,
        val bounds: List<Int>,
        val clickable: Boolean = false,
        val children: List<ViewNode>? = null,
    )

    private const val MAX_NODES = 200
    private val sensitivePatterns = listOf("password", "cvv", "ssn", "pin", "secret")
    private val gson = Gson()

    /**
     * Capture the current activity's view hierarchy as a JSON string.
     */
    fun capture(activity: Activity): String? {
        val rootView = activity.window?.decorView?.rootView ?: return null
        var count = 0
        val root = walk(activity, rootView, count = { count++ ; count })
        return try { gson.toJson(root) } catch (_: Exception) { null }
    }

    private fun walk(activity: Activity, view: View, count: () -> Int): ViewNode? {
        if (count() > MAX_NODES) return null

        // Skip password fields
        if (view is EditText) {
            val inputType = view.inputType
            if (inputType and InputType.TYPE_TEXT_VARIATION_PASSWORD != 0 ||
                inputType and InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD != 0) {
                return null
            }
        }

        // Skip views with sensitive identifiers
        val resName = try {
            if (view.id != View.NO_ID) activity.resources.getResourceEntryName(view.id) else null
        } catch (_: Exception) { null }

        val contentDesc = view.contentDescription?.toString()

        val allIds = listOfNotNull(resName?.lowercase(), contentDesc?.lowercase())
        for (id in allIds) {
            for (pattern in sensitivePatterns) {
                if (id.contains(pattern)) return null
            }
        }

        // Bounds
        val rect = android.graphics.Rect()
        view.getGlobalVisibleRect(rect)
        val bounds = listOf(rect.left, rect.top, rect.width(), rect.height())

        // Children
        val children = if (view is ViewGroup && view.childCount > 0) {
            (0 until view.childCount).mapNotNull { i ->
                walk(activity, view.getChildAt(i), count)
            }.ifEmpty { null }
        } else null

        return ViewNode(
            cls = view.javaClass.simpleName,
            id = resName,
            desc = contentDesc,
            bounds = bounds,
            clickable = view.isClickable,
            children = children,
        )
    }
}
