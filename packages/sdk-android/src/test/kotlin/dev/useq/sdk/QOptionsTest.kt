// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk

import org.junit.Assert.*
import org.junit.Test

class QOptionsTest {
    @Test
    fun `default options have expected values`() {
        val options = QOptions()
        assertFalse(options.debugMode)
        assertEquals("https://api.useq.dev", options.backendUrl)
    }
}
