// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// Handles deep link navigation by delegating to the app's registered route handler.
/// The host app registers a route handler via `Q.registerRouteHandler`.
/// Q sends screen route strings (e.g. "settings/profile") and the app handles navigation.
struct DeepLinkHandler {
    /// Navigate to a screen route using the registered handler.
    static func navigate(to route: String) {
        guard let handler = Q.shared.routeHandler else {
            if Q.shared.options.debugMode {
                print("[Q] Deep link requested but no route handler registered. Call Q.registerRouteHandler first.")
            }
            return
        }
        DispatchQueue.main.async {
            handler(route)
        }
    }
}
