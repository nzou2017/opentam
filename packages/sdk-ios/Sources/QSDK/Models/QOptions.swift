// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Configuration options for the Q SDK.
/// UI presentation is entirely up to the host app — these options configure SDK behavior only.
public struct QOptions {
    public static let defaultBackendUrl = "https://api.useq.dev"

    /// The Q backend URL.
    public var backendUrl: String

    /// Enable debug logging to console.
    public var debugMode: Bool

    public init(
        backendUrl: String? = nil,
        debugMode: Bool? = nil
    ) {
        self.backendUrl = backendUrl ?? QOptions.defaultBackendUrl
        self.debugMode = debugMode ?? false
    }
}
