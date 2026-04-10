// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.actor

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import dev.useq.sdk.Q
import dev.useq.sdk.models.TourStep

/**
 * Manages multi-step guided tours: navigate -> wait for view -> highlight -> advance.
 */
class TourEngine(
    private val steps: List<TourStep>,
    private val routeHandler: ((String) -> Unit)?,
) {
    private var currentStepIndex = 0
    private val handler = Handler(Looper.getMainLooper())

    fun start() {
        if (steps.isEmpty()) return
        currentStepIndex = 0
        executeCurrentStep()
    }

    private fun executeCurrentStep() {
        if (currentStepIndex >= steps.size) {
            cleanup()
            return
        }

        val step = steps[currentStepIndex]

        // Navigate to screen if urlPattern is specified
        if (!step.urlPattern.isNullOrEmpty()) {
            routeHandler?.invoke(step.urlPattern)
            // Wait for view to appear (poll for up to 3 seconds)
            waitForView(step.selector, timeoutMs = 3000) {
                showStepHighlight(step)
            }
        } else {
            showStepHighlight(step)
        }
    }

    private fun showStepHighlight(step: TourStep) {
        val stepNumber = currentStepIndex + 1
        val totalSteps = steps.size
        val message = "($stepNumber/$totalSteps) ${step.message}"

        HighlightOverlay.highlight(step.selector, message)

        // TODO: Add "Next" button overlay that calls advanceToNextStep()
        // For now, tapping the overlay dismisses and advances
    }

    private fun advanceToNextStep() {
        HighlightOverlay.dismiss()
        currentStepIndex++
        executeCurrentStep()
    }

    private fun cleanup() {
        HighlightOverlay.dismiss()
    }

    private fun waitForView(identifier: String, timeoutMs: Long, onFound: () -> Unit) {
        val startTime = System.currentTimeMillis()
        val checkRunnable = object : Runnable {
            override fun run() {
                val activity = Q.currentActivity ?: return
                val rootView = activity.window?.decorView?.rootView ?: return

                if (findView(identifier, rootView) != null) {
                    handler.post { onFound() }
                } else if (System.currentTimeMillis() - startTime < timeoutMs) {
                    handler.postDelayed(this, 200)
                } else {
                    // Timeout — show highlight anyway
                    handler.post { onFound() }
                }
            }
        }
        handler.post(checkRunnable)
    }

    private fun findView(identifier: String, view: View): View? {
        if (view.contentDescription?.toString() == identifier) return view
        if (view.id != View.NO_ID) {
            try {
                val resName = view.resources.getResourceEntryName(view.id)
                if (resName == identifier) return view
            } catch (_: Exception) {}
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findView(identifier, view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }
}
