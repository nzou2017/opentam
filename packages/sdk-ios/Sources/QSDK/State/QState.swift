// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// Lightweight persistence for Q SDK state using UserDefaults.
final class QState {
    private let defaults = UserDefaults(suiteName: "dev.useq.sdk") ?? .standard

    private enum Keys {
        static let bubbleX = "q_bubble_x"
        static let bubbleY = "q_bubble_y"
        static let sessionId = "q_session_id"
    }

    // MARK: - Bubble position

    var bubblePosition: CGPoint? {
        get {
            guard defaults.object(forKey: Keys.bubbleX) != nil else { return nil }
            return CGPoint(
                x: defaults.double(forKey: Keys.bubbleX),
                y: defaults.double(forKey: Keys.bubbleY)
            )
        }
        set {
            if let point = newValue {
                defaults.set(point.x, forKey: Keys.bubbleX)
                defaults.set(point.y, forKey: Keys.bubbleY)
            } else {
                defaults.removeObject(forKey: Keys.bubbleX)
                defaults.removeObject(forKey: Keys.bubbleY)
            }
        }
    }

    // MARK: - Session

    var sessionId: String {
        if let existing = defaults.string(forKey: Keys.sessionId) {
            return existing
        }
        let newId = UUID().uuidString
        defaults.set(newId, forKey: Keys.sessionId)
        return newId
    }

    func resetSession() {
        defaults.removeObject(forKey: Keys.sessionId)
    }
}
