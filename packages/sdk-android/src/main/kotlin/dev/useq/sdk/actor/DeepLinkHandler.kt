// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.actor

import android.os.Handler
import android.os.Looper
import dev.useq.sdk.Q

/**
 * Handles deep link navigation by delegating to the app's registered route handler.
 */
object DeepLinkHandler {
    fun navigate(route: String) {
        val handler = Q.routeHandler ?: run {
            if (Q.options.debugMode) {
                android.util.Log.d("Q", "Deep link requested but no route handler registered. Call Q.registerRouteHandler first.")
            }
            return
        }
        Handler(Looper.getMainLooper()).post { handler(route) }
    }
}
