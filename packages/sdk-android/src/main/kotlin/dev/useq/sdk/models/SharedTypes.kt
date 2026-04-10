// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.models

/** Data classes matching @opentam/shared types */

data class DeviceInfo(
    val model: String,
    val os: String,
    val screenSize: String,
)

data class ChatRequest(
    val sessionId: String,
    val message: String,
    val currentUrl: String,
    val platform: String = "android",
    val screenName: String? = null,
    val domSnapshot: String? = null,
    val history: List<ChatMessage>? = null,
)

data class ChatMessage(
    val role: String, // "user" | "assistant"
    val content: String,
)

data class ChatResponse(
    val reply: String,
    val intervention: InterventionCommand? = null,
)

data class InterventionCommand(
    val action: String, // "overlay_highlight" | "deep_link" | "message_only" | "tour" | "survey"
    val elementId: String? = null,
    val href: String? = null,
    val message: String,
    val confidence: Double,
    val steps: List<TourStep>? = null,
    val workflowId: String? = null,
    val surveyId: String? = null,
    val surveyQuestions: List<SurveyQuestion>? = null,
    val platform: String? = null,
)

data class TourStep(
    val selector: String,
    val message: String,
    val urlPattern: String? = null,
    val action: String? = null,
)

data class SurveyQuestion(
    val id: String,
    val type: String, // "rating" | "single_choice" | "multi_choice" | "text"
    val text: String,
    val required: Boolean? = null,
    val options: List<String>? = null,
    val min: Int? = null,
    val max: Int? = null,
    val ratingStyle: String? = null,
)

data class TelemetryRequest(
    val eventType: String = "telemetry",
    val platform: String = "android",
    val eventName: String,
    val screenName: String? = null,
    val appVersion: String? = null,
    val deviceInfo: DeviceInfo? = null,
    val properties: Map<String, String>? = null,
)
