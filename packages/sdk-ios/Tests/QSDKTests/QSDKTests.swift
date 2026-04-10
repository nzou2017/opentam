// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import QSDK

final class QSDKTests: XCTestCase {
    func testQOptionsDefaults() {
        let options = QOptions()
        XCTAssertFalse(options.debugMode)
        XCTAssertEqual(options.backendUrl, QOptions.defaultBackendUrl)
    }

    func testQStateSessionId() {
        let state = QState()
        let id1 = state.sessionId
        let id2 = state.sessionId
        XCTAssertEqual(id1, id2, "Session ID should be stable across reads")

        state.resetSession()
        let id3 = state.sessionId
        XCTAssertNotEqual(id1, id3, "Session ID should change after reset")
    }
}
