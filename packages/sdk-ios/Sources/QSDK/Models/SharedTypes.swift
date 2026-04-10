// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

// MARK: - Codable structs matching @opentam/shared types

struct DeviceInfo: Codable {
    let model: String
    let os: String
    let screenSize: String
}

// MARK: - Internal request/response types

struct ChatRequest: Codable {
    let sessionId: String
    let message: String
    let currentUrl: String
    let platform: String
    let screenName: String?
    let domSnapshot: String?
    let history: [ChatMessage]?
}

struct ChatMessage: Codable {
    let role: String // "user" | "assistant"
    let content: String
}

struct ChatResponse: Codable {
    let reply: String
    let intervention: InterventionCommand?
}

struct TelemetryRequest: Codable {
    let eventType: String // "telemetry"
    let platform: String
    let eventName: String
    let screenName: String?
    let appVersion: String?
    let deviceInfo: DeviceInfo?
    let properties: [String: String]?
}

// MARK: - Public types (host app can inspect these)

/// An intervention command returned by the Q backend.
/// Pass to `Q.executeIntervention()` to let the SDK handle it,
/// or inspect the fields to render custom UI.
public struct InterventionCommand: Codable {
    /// The intervention type: `"overlay_highlight"`, `"deep_link"`, `"message_only"`, `"tour"`, `"survey"`.
    public let action: String
    /// The accessibility identifier of the target element (for `overlay_highlight`).
    public let elementId: String?
    /// The screen route to navigate to (for `deep_link`).
    public let href: String?
    /// A human-readable message to show the user.
    public let message: String
    /// Confidence score (0–1).
    public let confidence: Double
    /// Ordered steps for a guided tour (for `tour`).
    public let steps: [TourStep]?
    /// Workflow ID if this tour is based on a stored workflow.
    public let workflowId: String?
    /// Survey ID (for `survey`).
    public let surveyId: String?
    /// Survey questions (for `survey`).
    public let surveyQuestions: [SurveyQuestion]?
    /// Platform hint.
    public let platform: String?
}

/// A single step in a guided tour.
public struct TourStep: Codable {
    /// The accessibility identifier of the target element.
    public let selector: String
    /// Instruction text for this step.
    public let message: String
    /// Screen route to navigate to before highlighting (optional).
    public let urlPattern: String?
    /// What the user should do: `"click"`, `"navigate"`, `"input"`, `"wait"`, `"verify"`.
    public let action: String?
}

/// A survey question.
public struct SurveyQuestion: Codable {
    public let id: String
    /// Question type: `"rating"`, `"single_choice"`, `"multi_choice"`, `"text"`.
    public let type: String
    /// The question text.
    public let text: String
    public let required: Bool?
    /// Answer options (for `single_choice`, `multi_choice`).
    public let options: [String]?
    /// Min value (for `rating`, default 1).
    public let min: Int?
    /// Max value (for `rating`, default 5).
    public let max: Int?
    public let ratingStyle: String?
}
