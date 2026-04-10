// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Dispatches interventions returned by the Q backend.
final class QActor {
    private let routeHandler: ((String) -> Void)?
    private var tourEngine: TourEngine?

    init(routeHandler: ((String) -> Void)?) {
        self.routeHandler = routeHandler
    }

    /// Execute an intervention command from the backend.
    @MainActor
    func execute(_ command: InterventionCommand) {
        switch command.action {
        case "overlay_highlight":
            guard let elementId = command.elementId else { return }
            HighlightOverlay.highlight(accessibilityIdentifier: elementId, message: command.message)

            Q.shared.transport?.sendTelemetry(eventName: "interventionDisplayed", screenName: Q.shared.currentScreen, properties: [
                "action": "overlay_highlight",
                "elementId": elementId,
            ])

        case "deep_link":
            guard let href = command.href, let handler = routeHandler else { return }
            handler(href)

            Q.shared.transport?.sendTelemetry(eventName: "interventionDisplayed", screenName: Q.shared.currentScreen, properties: [
                "action": "deep_link",
                "href": href,
            ])

        case "tour":
            guard let steps = command.steps, !steps.isEmpty else { return }
            tourEngine = TourEngine(steps: steps, routeHandler: routeHandler)
            tourEngine?.start()

            Q.shared.transport?.sendTelemetry(eventName: "interventionDisplayed", screenName: Q.shared.currentScreen, properties: [
                "action": "tour",
                "stepCount": String(steps.count),
            ])

        case "message_only":
            // Message is shown in the chat panel — no additional action needed
            break

        case "survey":
            // Survey rendering is handled by the chat view controller
            break

        default:
            if Q.shared.options.debugMode {
                print("[Q] Unknown intervention action: \(command.action)")
            }
        }
    }
}
