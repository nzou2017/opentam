// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.transport

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.provider.Settings
import com.google.gson.Gson
import dev.useq.sdk.Q
import dev.useq.sdk.models.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList

/**
 * HTTP transport layer for Q Android SDK.
 * Handles all communication with the Q backend.
 * Includes offline retry queue for telemetry events (fire-and-forget).
 * Chat requests are NOT queued — they fail immediately when offline.
 */
class QTransport(
    private val context: Context,
    private val sdkKey: String,
    private val backendUrl: String,
) {
    private val client = OkHttpClient()
    private val gson = Gson()
    private val jsonMediaType = "application/json".toMediaType()

    private val deviceId: String
    private val appIdentifier: String
    private val deviceInfo: DeviceInfo

    // Offline retry queue (telemetry only)
    private val retryQueue = CopyOnWriteArrayList<String>()
    private val maxQueueSize = 50
    private var isConnected = true

    init {
        // Device ID: SHA-256 of ANDROID_ID
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
        deviceId = sha256(androidId)

        // App identifier: package name
        appIdentifier = context.packageName

        // Device info
        val display = context.resources.displayMetrics
        deviceInfo = DeviceInfo(
            model = "${Build.MANUFACTURER} ${Build.MODEL}",
            os = "Android ${Build.VERSION.RELEASE}",
            screenSize = "${display.widthPixels}x${display.heightPixels}",
        )

        // Monitor connectivity
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        connectivityManager?.registerNetworkCallback(
            NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build(),
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    isConnected = true
                    flushRetryQueue()
                }
                override fun onLost(network: Network) {
                    isConnected = false
                }
            }
        )
    }

    // MARK: - Chat (no retry — fails immediately)

    fun sendChat(
        sessionId: String,
        message: String,
        currentUrl: String,
        screenName: String?,
        domSnapshot: String?,
        history: List<ChatMessage>?,
    ): ChatResponse {
        val body = ChatRequest(
            sessionId = sessionId,
            message = message,
            currentUrl = currentUrl,
            platform = "android",
            screenName = screenName,
            domSnapshot = domSnapshot,
            history = history,
        )

        val responseBody = post("/api/v1/chat", gson.toJson(body))
        return gson.fromJson(responseBody, ChatResponse::class.java)
    }

    // MARK: - Telemetry (fire-and-forget with retry queue)

    fun sendTelemetry(eventName: String, screenName: String?, properties: Map<String, String>? = null) {
        val appVersion = try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        } catch (_: Exception) { null }

        val body = TelemetryRequest(
            eventName = eventName,
            screenName = screenName,
            appVersion = appVersion,
            deviceInfo = deviceInfo,
            properties = properties,
        )

        val json = gson.toJson(body)

        if (isConnected) {
            Thread {
                try {
                    post("/api/v1/events", json)
                } catch (_: Exception) {
                    enqueueForRetry(json)
                }
            }.start()
        } else {
            enqueueForRetry(json)
        }
    }

    // MARK: - HTTP

    private fun post(path: String, jsonBody: String): String {
        val request = Request.Builder()
            .url("$backendUrl$path")
            .post(jsonBody.toRequestBody(jsonMediaType))
            .addHeader("Authorization", "Bearer $sdkKey")
            .addHeader("Content-Type", "application/json")
            .addHeader("X-Q-App-Identifier", appIdentifier)
            .addHeader("X-Q-Device-Id", deviceId)
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw IOException("HTTP ${response.code}")
        }
        return response.body?.string() ?: ""
    }

    // MARK: - Retry Queue

    private fun enqueueForRetry(json: String) {
        if (retryQueue.size >= maxQueueSize) {
            retryQueue.removeAt(0) // drop oldest
        }
        retryQueue.add(json)
    }

    private fun flushRetryQueue() {
        val pending = ArrayList(retryQueue)
        retryQueue.clear()

        Thread {
            for (json in pending) {
                try {
                    post("/api/v1/events", json)
                } catch (_: Exception) {
                    if (Q.options.debugMode) {
                        android.util.Log.d("Q", "Retry failed, dropping telemetry event")
                    }
                }
            }
        }.start()
    }

    // MARK: - Helpers

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}
