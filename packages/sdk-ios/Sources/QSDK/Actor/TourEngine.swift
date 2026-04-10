// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Manages multi-step guided tours: navigate → wait for view → highlight → advance.
final class TourEngine {
    private let steps: [TourStep]
    private let routeHandler: ((String) -> Void)?
    private var currentStepIndex = 0
    private var waitTimer: Timer?

    init(steps: [TourStep], routeHandler: ((String) -> Void)?) {
        self.steps = steps
        self.routeHandler = routeHandler
    }

    @MainActor
    func start() {
        guard !steps.isEmpty else { return }
        currentStepIndex = 0
        executeCurrentStep()
    }

    @MainActor
    private func executeCurrentStep() {
        guard currentStepIndex < steps.count else {
            cleanup()
            return
        }

        let step = steps[currentStepIndex]

        // Navigate to screen if urlPattern is specified
        if let urlPattern = step.urlPattern, !urlPattern.isEmpty, let handler = routeHandler {
            handler(urlPattern)
            // Wait for view to appear (poll for up to 3 seconds)
            waitForView(identifier: step.selector, timeout: 3.0) { [weak self] found in
                if found {
                    self?.showStepHighlight(step: step)
                } else {
                    // Timeout — show message anyway at the current location
                    self?.showStepHighlight(step: step)
                }
            }
        } else {
            showStepHighlight(step: step)
        }
    }

    @MainActor
    private func showStepHighlight(step: TourStep) {
        let stepNumber = currentStepIndex + 1
        let totalSteps = steps.count
        let message = "(\(stepNumber)/\(totalSteps)) \(step.message)"

        HighlightOverlay.highlight(accessibilityIdentifier: step.selector, message: message)

        // Override dismiss handler to advance to next step
        HighlightOverlayDismissAdvancer.shared.onAdvance = { [weak self] in
            self?.advanceToNextStep()
        }

        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = scene.windows.first(where: { $0.isKeyWindow }) {
            // Add a "Next" button if not the last step
            if currentStepIndex < steps.count - 1 {
                let nextButton = createNextButton(in: window)
                HighlightOverlayDismissAdvancer.shared.extraViews.append(nextButton)
            }
        }
    }

    @MainActor
    private func advanceToNextStep() {
        HighlightOverlay.dismiss()
        HighlightOverlayDismissAdvancer.shared.cleanup()
        currentStepIndex += 1
        executeCurrentStep()
    }

    @MainActor
    private func cleanup() {
        HighlightOverlay.dismiss()
        HighlightOverlayDismissAdvancer.shared.cleanup()
        waitTimer?.invalidate()
        waitTimer = nil
    }

    private func waitForView(identifier: String, timeout: TimeInterval, completion: @escaping (Bool) -> Void) {
        let startTime = Date()
        waitTimer?.invalidate()

        waitTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] timer in
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let window = scene.windows.first(where: { $0.isKeyWindow }) else {
                return
            }

            if Self.findView(identifier: identifier, in: window) != nil {
                timer.invalidate()
                self?.waitTimer = nil
                DispatchQueue.main.async { completion(true) }
            } else if Date().timeIntervalSince(startTime) >= timeout {
                timer.invalidate()
                self?.waitTimer = nil
                DispatchQueue.main.async { completion(false) }
            }
        }
    }

    private static func findView(identifier: String, in view: UIView) -> UIView? {
        if view.accessibilityIdentifier == identifier { return view }
        for subview in view.subviews {
            if let found = findView(identifier: identifier, in: subview) { return found }
        }
        return nil
    }

    @MainActor
    private func createNextButton(in window: UIWindow) -> UIView {
        let button = UIButton(type: .system)
        button.setTitle("Next", for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        button.backgroundColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1)
        button.layer.cornerRadius = 20
        button.frame = CGRect(x: window.bounds.width - 100, y: window.bounds.height - 100, width: 80, height: 40)
        button.addTarget(HighlightOverlayDismissAdvancer.shared, action: #selector(HighlightOverlayDismissAdvancer.handleNext), for: .touchUpInside)
        window.addSubview(button)
        return button
    }
}

// Helper for tour step advancement
private final class HighlightOverlayDismissAdvancer: NSObject {
    static let shared = HighlightOverlayDismissAdvancer()
    var onAdvance: (() -> Void)?
    var extraViews: [UIView] = []

    @objc func handleNext() {
        onAdvance?()
    }

    func cleanup() {
        extraViews.forEach { $0.removeFromSuperview() }
        extraViews.removeAll()
        onAdvance = nil
    }
}
