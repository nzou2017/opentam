// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Main entry point for the Q SDK.
///
/// Q is a **headless SDK** — it provides chat, interventions, and view snapshots
/// but does NOT inject any UI. The host app decides how to present Q (floating button,
/// tab bar, slide panel, etc.).
///
/// Minimal integration:
/// ```swift
/// // 1. Initialize (AppDelegate or @main App)
/// Q.initialize(sdkKey: "YOUR_KEY")
///
/// // 2. Send a chat message from your own UI
/// let response = try await Q.chat("How do I change my password?")
/// print(response.reply)
///
/// // 3. Handle interventions returned by the backend
/// if let intervention = response.intervention {
///     Q.executeIntervention(intervention)
/// }
/// ```
public final class Q {

    // MARK: - Lifecycle

    /// Initialize Q with your SDK key. Call once on app launch.
    public static func initialize(sdkKey: String, options: QOptions = QOptions()) {
        shared.sdkKey = sdkKey
        shared.options = options
        shared.state = QState()
        shared.transport = QTransport(sdkKey: sdkKey, backendUrl: options.backendUrl)
        shared.actor = QActor(routeHandler: nil)

        if options.debugMode {
            print("[Q] Initialized with SDK key: \(sdkKey.prefix(8))...")
        }
    }

    /// Track a screen view. Call in each view's onAppear or viewDidAppear.
    public static func trackScreen(_ name: String, route: String) {
        shared.currentScreen = name
        shared.currentRoute = route
        shared.transport?.sendTelemetry(eventName: "screenView", screenName: name, properties: ["route": route])
    }

    /// Set the current user ID for attribution.
    public static func setUserId(_ userId: String) {
        shared.userId = userId
    }

    /// Register a route handler for deep link interventions (highlight, tour, deep_link).
    public static func registerRouteHandler(_ handler: @escaping (String) -> Void) {
        shared.routeHandler = handler
        shared.actor = QActor(routeHandler: handler)
    }

    // MARK: - Chat

    /// Send a chat message and get a reply + optional intervention.
    /// Call this from your own chat UI (SwiftUI view, UIKit controller, etc.).
    ///
    /// - Parameters:
    ///   - message: The user's message text.
    ///   - history: Prior conversation turns for multi-turn context (optional, last 10 used).
    ///   - includeViewSnapshot: Whether to capture and send the current view hierarchy (default: true).
    /// - Returns: A `QChatResponse` with the assistant's reply and an optional intervention.
    public static func chat(
        _ message: String,
        history: [(role: String, content: String)]? = nil,
        includeViewSnapshot: Bool = true
    ) async throws -> QChatResponse {
        guard let transport = shared.transport else {
            throw QError.notInitialized
        }

        let snapshot = includeViewSnapshot ? ViewSnapshot.capture() : nil
        let chatHistory = history?.suffix(10).map { ChatMessage(role: $0.role, content: $0.content) }

        let response = try await transport.sendChat(
            sessionId: shared.state?.sessionId ?? UUID().uuidString,
            message: message,
            currentUrl: shared.currentRoute,
            screenName: shared.currentScreen,
            domSnapshot: snapshot,
            history: chatHistory.map { Array($0) }
        )

        return QChatResponse(
            reply: response.reply,
            intervention: response.intervention
        )
    }

    // MARK: - Interventions

    /// Execute an intervention returned by the backend (highlight, deep link, tour).
    /// Call this after receiving an intervention from `Q.chat()`.
    @MainActor
    public static func executeIntervention(_ intervention: InterventionCommand) {
        shared.actor?.execute(intervention)
    }

    // MARK: - View Snapshot

    /// Capture the current view hierarchy as a JSON string.
    /// Useful if you want to inspect what Q sends to the backend.
    public static func captureViewSnapshot() -> String? {
        return ViewSnapshot.capture()
    }

    // MARK: - Telemetry

    /// Send a custom telemetry event.
    public static func sendTelemetry(eventName: String, properties: [String: String]? = nil) {
        shared.transport?.sendTelemetry(eventName: eventName, screenName: shared.currentScreen, properties: properties)
    }

    // MARK: - Internal

    static let shared = Q()
    private init() {}

    var sdkKey: String = ""
    var options: QOptions = QOptions()
    var transport: QTransport?
    var state: QState?
    var actor: QActor?

    var currentScreen: String = ""
    var currentRoute: String = ""
    var userId: String?
    var routeHandler: ((String) -> Void)?
}

// MARK: - Public response type

/// Response from `Q.chat()`.
public struct QChatResponse {
    /// The assistant's text reply.
    public let reply: String
    /// An optional intervention (highlight, tour, deep link) — execute via `Q.executeIntervention()`.
    public let intervention: InterventionCommand?
}

/// Q SDK errors.
public enum QError: Error {
    case notInitialized
}
