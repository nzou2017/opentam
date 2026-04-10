// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.actor

import dev.useq.sdk.Q
import dev.useq.sdk.models.InterventionCommand

/**
 * Dispatches interventions returned by the Q backend.
 */
class QActor(private val routeHandler: ((String) -> Unit)?) {

    fun execute(command: InterventionCommand) {
        when (command.action) {
            "overlay_highlight" -> {
                val elementId = command.elementId ?: return
                HighlightOverlay.highlight(elementId, command.message)
                Q.transport?.sendTelemetry("interventionDisplayed", Q.currentScreen, mapOf(
                    "action" to "overlay_highlight",
                    "elementId" to elementId,
                ))
            }

            "deep_link" -> {
                val href = command.href ?: return
                val handler = routeHandler ?: return
                handler(href)
                Q.transport?.sendTelemetry("interventionDisplayed", Q.currentScreen, mapOf(
                    "action" to "deep_link",
                    "href" to href,
                ))
            }

            "tour" -> {
                val steps = command.steps ?: return
                if (steps.isEmpty()) return
                TourEngine(steps, routeHandler).start()
                Q.transport?.sendTelemetry("interventionDisplayed", Q.currentScreen, mapOf(
                    "action" to "tour",
                    "stepCount" to steps.size.toString(),
                ))
            }

            "message_only" -> {
                // Message shown in chat panel — no additional action
            }

            "survey" -> {
                // Survey rendering handled by chat view
            }

            else -> {
                if (Q.options.debugMode) {
                    android.util.Log.d("Q", "Unknown intervention action: ${command.action}")
                }
            }
        }
    }
}
