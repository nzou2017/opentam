// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

/// Captures the view hierarchy as a JSON string for the Q backend.
/// Privacy-filtered: no text content, skips secure/sensitive fields.
struct ViewSnapshot {

    struct ViewNode: Codable {
        let cls: String              // e.g. "UIButton"
        let id: String?              // accessibilityIdentifier
        let label: String?           // accessibilityLabel
        let frame: [Int]             // [x, y, width, height]
        let isAccessible: Bool
        let children: [ViewNode]?
    }

    /// Maximum number of nodes to capture.
    private static let maxNodes = 200

    /// Sensitive identifier patterns (case-insensitive).
    private static let sensitivePatterns = ["password", "cvv", "ssn", "pin", "secret"]

    /// Capture the current key window's view hierarchy as a JSON string.
    static func capture() -> String? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }) else {
            return nil
        }

        var count = 0
        let root = walk(view: window, count: &count)
        guard let data = try? JSONEncoder().encode(root) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func walk(view: UIView, count: inout Int) -> ViewNode? {
        guard count < maxNodes else { return nil }

        // Skip secure text entries
        if let textField = view as? UITextField, textField.isSecureTextEntry { return nil }

        // Skip views with sensitive identifiers
        let allIds = [view.accessibilityIdentifier, view.accessibilityLabel].compactMap { $0?.lowercased() }
        for id in allIds {
            for pattern in sensitivePatterns {
                if id.contains(pattern) { return nil }
            }
        }

        count += 1

        let frame = view.frame
        let children: [ViewNode]? = view.subviews.isEmpty ? nil : view.subviews.compactMap { walk(view: $0, count: &count) }

        return ViewNode(
            cls: String(describing: type(of: view)),
            id: view.accessibilityIdentifier,
            label: view.accessibilityLabel,
            frame: [Int(frame.origin.x), Int(frame.origin.y), Int(frame.width), Int(frame.height)],
            isAccessible: view.isAccessibilityElement,
            children: children?.isEmpty == true ? nil : children
        )
    }
}
