// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk.actor

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.*
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import dev.useq.sdk.Q

/**
 * Draws a pulsing highlight overlay around a view identified by contentDescription or resource ID.
 */
object HighlightOverlay {

    private var currentOverlay: View? = null
    private const val BRAND_COLOR = 0xFF6366F1.toInt()

    fun highlight(identifier: String, message: String) {
        dismiss()

        val activity = getCurrentActivity() ?: return
        val rootView = activity.window?.decorView?.rootView ?: return
        val targetView = findView(identifier, rootView) ?: run {
            if (Q.options.debugMode) {
                android.util.Log.d("Q", "Could not find view with identifier: $identifier")
            }
            return
        }

        // Get target bounds
        val location = IntArray(2)
        targetView.getLocationOnScreen(location)
        val targetRect = Rect(
            location[0] - 8,
            location[1] - 8,
            location[0] + targetView.width + 8,
            location[1] + targetView.height + 8,
        )

        // Create overlay
        val container = activity.window?.decorView as? ViewGroup ?: return
        val overlay = OverlayView(activity, targetRect, message)
        overlay.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        overlay.setOnClickListener {
            dismiss()
            Q.transport?.sendTelemetry("interventionDismissed", Q.currentScreen, mapOf(
                "action" to "overlay_highlight",
                "elementId" to identifier,
            ))
        }

        container.addView(overlay)
        currentOverlay = overlay
    }

    fun dismiss() {
        currentOverlay?.let { view ->
            (view.parent as? ViewGroup)?.removeView(view)
        }
        currentOverlay = null
    }

    private fun findView(identifier: String, view: View): View? {
        // Check contentDescription
        if (view.contentDescription?.toString() == identifier) return view

        // Check resource ID name
        if (view.id != View.NO_ID) {
            try {
                val resName = view.resources.getResourceEntryName(view.id)
                if (resName == identifier) return view
            } catch (_: Exception) {}
        }

        // Recurse children
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findView(identifier, view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun getCurrentActivity(): Activity? {
        return Q.currentActivity
    }

    /**
     * Custom view that draws a semi-transparent overlay with a cutout around the target,
     * a pulsing ring, and a tooltip message.
     */
    private class OverlayView(
        context: android.content.Context,
        private val targetRect: Rect,
        private val message: String,
    ) : View(context) {

        private val overlayPaint = Paint().apply {
            color = Color.argb(77, 0, 0, 0) // 30% black
            style = Paint.Style.FILL
        }

        private val ringPaint = Paint().apply {
            color = BRAND_COLOR
            style = Paint.Style.STROKE
            strokeWidth = 6f
            isAntiAlias = true
        }

        private var pulseAlpha = 1f

        init {
            // Pulsing animation
            val animator = ObjectAnimator.ofFloat(this, "pulseAlpha", 1f, 0.4f)
            animator.duration = 1000
            animator.repeatMode = ValueAnimator.REVERSE
            animator.repeatCount = ValueAnimator.INFINITE
            animator.addUpdateListener { pulseAlpha = it.animatedValue as Float; invalidate() }
            animator.start()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            // Draw overlay with cutout
            val path = Path()
            path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            val cutout = RectF(targetRect)
            path.addRoundRect(cutout, 16f, 16f, Path.Direction.CCW)
            path.fillType = Path.FillType.EVEN_ODD
            canvas.drawPath(path, overlayPaint)

            // Draw pulsing ring
            ringPaint.alpha = (pulseAlpha * 255).toInt()
            canvas.drawRoundRect(RectF(targetRect), 16f, 16f, ringPaint)

            // Draw tooltip
            drawTooltip(canvas)
        }

        private fun drawTooltip(canvas: Canvas) {
            val textPaint = Paint().apply {
                color = Color.WHITE
                textSize = 40f
                isAntiAlias = true
            }

            val padding = 24f
            val maxWidth = (width * 0.75f).coerceAtMost(600f)
            val textLayout = android.text.StaticLayout.Builder.obtain(message, 0, message.length, android.text.TextPaint().apply {
                color = Color.WHITE
                textSize = 40f
                isAntiAlias = true
            }, maxWidth.toInt() - (padding * 2).toInt()).build()

            val tooltipWidth = maxWidth
            val tooltipHeight = textLayout.height + padding * 2

            // Position below target if space, otherwise above
            val yBelow = targetRect.bottom + 24f
            val yAbove = targetRect.top - tooltipHeight - 24f
            val y = if (yBelow + tooltipHeight < height) yBelow else yAbove
            val x = ((targetRect.centerX() - tooltipWidth / 2).coerceIn(16f, width - tooltipWidth - 16f))

            // Background
            val bgPaint = Paint().apply {
                color = BRAND_COLOR
                style = Paint.Style.FILL
                isAntiAlias = true
            }
            canvas.drawRoundRect(RectF(x, y, x + tooltipWidth, y + tooltipHeight), 20f, 20f, bgPaint)

            // Text
            canvas.save()
            canvas.translate(x + padding, y + padding)
            textLayout.draw(canvas)
            canvas.restore()
        }
    }
}
