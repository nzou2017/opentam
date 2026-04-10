// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk

import android.app.Activity
import android.content.Context
import dev.useq.sdk.state.QState
import dev.useq.sdk.transport.QTransport
import dev.useq.sdk.transport.ViewSnapshot
import dev.useq.sdk.actor.QActor
import dev.useq.sdk.models.ChatMessage
import dev.useq.sdk.models.ChatResponse
import dev.useq.sdk.models.InterventionCommand

/**
 * Main entry point for the Q SDK.
 *
 * Q is a **headless SDK** — it provides chat, interventions, and view snapshots
 * but does NOT inject any UI. The host app decides how to present Q (floating button,
 * bottom sheet, navigation drawer item, etc.).
 *
 * Minimal integration:
 * ```kotlin
 * // 1. Initialize (Application.onCreate)
 * Q.initialize(context = this, sdkKey = "YOUR_KEY")
 *
 * // 2. Send a chat message from your own UI
 * val response = Q.chat("How do I change my password?")
 * showReply(response.reply)
 *
 * // 3. Handle interventions returned by the backend
 * response.intervention?.let { Q.executeIntervention(it) }
 * ```
 */
object Q {
    internal var sdkKey: String = ""
    internal var options: QOptions = QOptions()
    internal var transport: QTransport? = null
    internal var state: QState? = null
    internal var actor: QActor? = null

    internal var currentScreen: String = ""
    internal var currentRoute: String = ""
    internal var userId: String? = null
    internal var routeHandler: ((String) -> Unit)? = null

    /** The current foreground activity — set by the host app or activity lifecycle. */
    var currentActivity: Activity? = null

    /**
     * Initialize Q with your SDK key. Call once in Application.onCreate().
     */
    fun initialize(context: Context, sdkKey: String, options: QOptions = QOptions()) {
        this.sdkKey = sdkKey
        this.options = options
        this.state = QState(context)
        this.transport = QTransport(context, sdkKey, options.backendUrl)
        this.actor = QActor(null)

        if (options.debugMode) {
            android.util.Log.d("Q", "Initialized with SDK key: ${sdkKey.take(8)}...")
        }
    }

    /**
     * Track a screen view. Call in each Activity's onResume or Compose screen's LaunchedEffect.
     */
    fun trackScreen(name: String, route: String) {
        currentScreen = name
        currentRoute = route
        transport?.sendTelemetry("screenView", name, mapOf("route" to route))
    }

    /**
     * Set the current user ID for attribution.
     */
    fun setUserId(userId: String) {
        this.userId = userId
    }

    /**
     * Register a route handler for deep link interventions (highlight, tour, deep_link).
     */
    fun registerRouteHandler(handler: (String) -> Unit) {
        this.routeHandler = handler
        this.actor = QActor(handler)
    }

    // MARK: - Chat

    /**
     * Send a chat message and get a reply + optional intervention.
     * Call this from your own chat UI on a background thread.
     *
     * @param message The user's message text.
     * @param history Prior conversation turns for multi-turn context (optional, last 10 used).
     * @param includeViewSnapshot Whether to capture and send the current view hierarchy (default: true).
     * @return A [ChatResponse] with the assistant's reply and an optional intervention.
     */
    fun chat(
        message: String,
        history: List<ChatMessage>? = null,
        includeViewSnapshot: Boolean = true,
    ): ChatResponse {
        val transport = this.transport ?: throw IllegalStateException("Q not initialized. Call Q.initialize() first.")

        val snapshot = if (includeViewSnapshot) {
            currentActivity?.let { ViewSnapshot.capture(it) }
        } else null

        val recentHistory = history?.takeLast(10)

        return transport.sendChat(
            sessionId = state?.sessionId ?: java.util.UUID.randomUUID().toString(),
            message = message,
            currentUrl = currentRoute,
            screenName = currentScreen,
            domSnapshot = snapshot,
            history = recentHistory,
        )
    }

    // MARK: - Interventions

    /**
     * Execute an intervention returned by the backend (highlight, deep link, tour).
     * Call this after receiving an intervention from [chat].
     */
    fun executeIntervention(intervention: InterventionCommand) {
        actor?.execute(intervention)
    }

    // MARK: - View Snapshot

    /**
     * Capture the current view hierarchy as a JSON string.
     * Useful if you want to inspect what Q sends to the backend.
     */
    fun captureViewSnapshot(): String? {
        return currentActivity?.let { ViewSnapshot.capture(it) }
    }

    // MARK: - Telemetry

    /**
     * Send a custom telemetry event.
     */
    fun sendTelemetry(eventName: String, properties: Map<String, String>? = null) {
        transport?.sendTelemetry(eventName, currentScreen, properties)
    }
}
