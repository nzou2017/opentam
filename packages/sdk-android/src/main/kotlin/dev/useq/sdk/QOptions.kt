// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

package dev.useq.sdk

/**
 * Configuration options for the Q SDK.
 * UI presentation is entirely up to the host app — these options configure SDK behavior only.
 */
data class QOptions(
    /** The Q backend URL. */
    val backendUrl: String = "https://api.useq.dev",
    /** Enable debug logging. */
    val debugMode: Boolean = false,
)
