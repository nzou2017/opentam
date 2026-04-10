// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Draws a pulsing highlight overlay around a view identified by its accessibilityIdentifier.
final class HighlightOverlay {

    private static var currentOverlay: UIView?

    /// Find a view by accessibilityIdentifier, scroll it visible, and highlight it with a pulsing ring and tooltip.
    @MainActor
    static func highlight(accessibilityIdentifier: String, message: String) {
        dismiss()

        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }) else { return }

        guard let targetView = findView(identifier: accessibilityIdentifier, in: window) else {
            if Q.shared.options.debugMode {
                print("[Q] Could not find view with identifier: \(accessibilityIdentifier)")
            }
            return
        }

        // Scroll target into view if needed
        if let scrollView = findScrollParent(of: targetView) {
            scrollView.scrollRectToVisible(targetView.convert(targetView.bounds, to: scrollView), animated: true)
        }

        let targetFrame = targetView.convert(targetView.bounds, to: window)

        // Create overlay
        let overlay = UIView(frame: window.bounds)
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.3)
        overlay.isUserInteractionEnabled = true

        // Cutout mask
        let path = UIBezierPath(rect: overlay.bounds)
        let cutoutRect = targetFrame.insetBy(dx: -8, dy: -8)
        let cutoutPath = UIBezierPath(roundedRect: cutoutRect, cornerRadius: 8)
        path.append(cutoutPath)
        path.usesEvenOddFillRule = true

        let maskLayer = CAShapeLayer()
        maskLayer.path = path.cgPath
        maskLayer.fillRule = .evenOdd
        overlay.layer.mask = maskLayer

        // Pulsing ring around the target
        let ringView = UIView(frame: cutoutRect)
        ringView.layer.borderColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1).cgColor // #6366f1
        ringView.layer.borderWidth = 3
        ringView.layer.cornerRadius = 8
        ringView.isUserInteractionEnabled = false

        let pulseAnimation = CABasicAnimation(keyPath: "opacity")
        pulseAnimation.fromValue = 1.0
        pulseAnimation.toValue = 0.4
        pulseAnimation.duration = 1.0
        pulseAnimation.autoreverses = true
        pulseAnimation.repeatCount = .infinity
        ringView.layer.add(pulseAnimation, forKey: "pulse")

        // Tooltip
        let tooltip = createTooltip(message: message, targetFrame: targetFrame, containerBounds: window.bounds)

        // Add to window
        window.addSubview(overlay)
        window.addSubview(ringView)
        window.addSubview(tooltip)
        currentOverlay = overlay

        // Dismiss on tap
        let tapGesture = UITapGestureRecognizer(target: HighlightOverlayDismissHandler.shared, action: #selector(HighlightOverlayDismissHandler.handleTap))
        overlay.addGestureRecognizer(tapGesture)

        // Store references for cleanup
        HighlightOverlayDismissHandler.shared.views = [overlay, ringView, tooltip]

        // Send dismiss telemetry after tap
        HighlightOverlayDismissHandler.shared.onDismiss = {
            Q.shared.transport?.sendTelemetry(eventName: "interventionDismissed", screenName: Q.shared.currentScreen, properties: [
                "action": "overlay_highlight",
                "elementId": accessibilityIdentifier,
            ])
        }
    }

    @MainActor
    static func dismiss() {
        HighlightOverlayDismissHandler.shared.dismissAll()
    }

    // MARK: - Private helpers

    private static func findView(identifier: String, in view: UIView) -> UIView? {
        if view.accessibilityIdentifier == identifier { return view }
        for subview in view.subviews {
            if let found = findView(identifier: identifier, in: subview) { return found }
        }
        return nil
    }

    private static func findScrollParent(of view: UIView) -> UIScrollView? {
        var current = view.superview
        while let parent = current {
            if let scrollView = parent as? UIScrollView { return scrollView }
            current = parent.superview
        }
        return nil
    }

    private static func createTooltip(message: String, targetFrame: CGRect, containerBounds: CGRect) -> UIView {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping

        let padding: CGFloat = 12
        let maxWidth = min(containerBounds.width - 32, 280)
        let textSize = label.sizeThatFits(CGSize(width: maxWidth - padding * 2, height: .greatestFiniteMagnitude))

        let container = UIView()
        container.backgroundColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)
        container.layer.cornerRadius = 10
        container.layer.shadowColor = UIColor.black.cgColor
        container.layer.shadowOffset = CGSize(width: 0, height: 2)
        container.layer.shadowOpacity = 0.25
        container.layer.shadowRadius = 8

        let width = textSize.width + padding * 2
        let height = textSize.height + padding * 2

        // Position below target if space, otherwise above
        let yBelow = targetFrame.maxY + 12
        let yAbove = targetFrame.minY - height - 12
        let y = (yBelow + height < containerBounds.height) ? yBelow : yAbove
        let x = max(16, min(targetFrame.midX - width / 2, containerBounds.width - width - 16))

        container.frame = CGRect(x: x, y: y, width: width, height: height)
        label.frame = CGRect(x: padding, y: padding, width: textSize.width, height: textSize.height)
        container.addSubview(label)

        return container
    }
}

// Helper class for tap dismissal (needs @objc for selector)
private final class HighlightOverlayDismissHandler: NSObject {
    static let shared = HighlightOverlayDismissHandler()
    var views: [UIView] = []
    var onDismiss: (() -> Void)?

    @objc func handleTap() {
        dismissAll()
    }

    func dismissAll() {
        views.forEach { $0.removeFromSuperview() }
        views.removeAll()
        onDismiss?()
        onDismiss = nil
    }
}
