// swift-tools-version: 5.9
// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import PackageDescription

let package = Package(
    name: "QSDK",
    platforms: [
        .iOS(.v15),
    ],
    products: [
        .library(name: "QSDK", targets: ["QSDK"]),
    ],
    targets: [
        .target(
            name: "QSDK",
            path: "Sources/QSDK"
        ),
        .testTarget(
            name: "QSDKTests",
            dependencies: ["QSDK"],
            path: "Tests/QSDKTests"
        ),
    ]
)
