// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import Network
import CryptoKit

/// HTTP transport layer for Q SDK. Handles all communication with the Q backend.
/// Includes offline retry queue for telemetry events (fire-and-forget).
/// Chat requests are NOT queued — they fail immediately when offline.
final class QTransport {
    private let sdkKey: String
    private let backendUrl: String
    private let session: URLSession
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private let deviceId: String
    private let appIdentifier: String
    private let deviceInfo: DeviceInfo

    // Offline retry queue (telemetry only)
    private var retryQueue: [Data] = []
    private let maxQueueSize = 50
    private let pathMonitor = NWPathMonitor()
    private var isConnected = true

    init(sdkKey: String, backendUrl: String) {
        self.sdkKey = sdkKey
        self.backendUrl = backendUrl
        self.session = URLSession(configuration: .default)

        // Device ID: SHA-256 of identifierForVendor
        let idfv = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        self.deviceId = SHA256.hash(data: Data(idfv.utf8)).compactMap { String(format: "%02x", $0) }.joined()

        // App identifier: bundle ID
        self.appIdentifier = Bundle.main.bundleIdentifier ?? "unknown"

        // Device info
        let screen = UIScreen.main.bounds
        self.deviceInfo = DeviceInfo(
            model: Self.deviceModel(),
            os: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            screenSize: "\(Int(screen.width))x\(Int(screen.height))"
        )

        // Monitor connectivity for retry queue
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            self?.isConnected = connected
            if connected { self?.flushRetryQueue() }
        }
        pathMonitor.start(queue: DispatchQueue(label: "dev.useq.network"))
    }

    // MARK: - Chat (no retry — fails immediately)

    func sendChat(
        sessionId: String,
        message: String,
        currentUrl: String,
        screenName: String?,
        domSnapshot: String?,
        history: [ChatMessage]?
    ) async throws -> ChatResponse {
        let body = ChatRequest(
            sessionId: sessionId,
            message: message,
            currentUrl: currentUrl,
            platform: "ios",
            screenName: screenName,
            domSnapshot: domSnapshot,
            history: history
        )

        let data = try encoder.encode(body)
        let responseData = try await post(path: "/api/v1/chat", body: data)
        return try decoder.decode(ChatResponse.self, from: responseData)
    }

    // MARK: - Telemetry (fire-and-forget with retry queue)

    func sendTelemetry(eventName: String, screenName: String?, properties: [String: String]? = nil) {
        let body = TelemetryRequest(
            eventType: "telemetry",
            platform: "ios",
            eventName: eventName,
            screenName: screenName,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
            deviceInfo: deviceInfo,
            properties: properties
        )

        guard let data = try? encoder.encode(body) else { return }

        if isConnected {
            Task {
                do {
                    _ = try await post(path: "/api/v1/events", body: data)
                } catch {
                    enqueueForRetry(data)
                }
            }
        } else {
            enqueueForRetry(data)
        }
    }

    // MARK: - HTTP

    private func post(path: String, body: Data) async throws -> Data {
        guard let url = URL(string: backendUrl + path) else {
            throw QTransportError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("Bearer \(sdkKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(appIdentifier, forHTTPHeaderField: "X-Q-App-Identifier")
        request.setValue(deviceId, forHTTPHeaderField: "X-Q-Device-Id")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw QTransportError.httpError(statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return data
    }

    // MARK: - Retry Queue

    private func enqueueForRetry(_ data: Data) {
        if retryQueue.count >= maxQueueSize {
            retryQueue.removeFirst() // drop oldest
        }
        retryQueue.append(data)
    }

    private func flushRetryQueue() {
        let pending = retryQueue
        retryQueue.removeAll()

        for data in pending {
            Task {
                do {
                    _ = try await post(path: "/api/v1/events", body: data)
                } catch {
                    // After flush failure, don't re-enqueue — move to dead letter (just log)
                    if Q.shared.options.debugMode {
                        print("[Q] Retry failed, dropping telemetry event")
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private static func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        return machineMirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(value)))
        }
    }
}

enum QTransportError: Error {
    case invalidURL
    case httpError(statusCode: Int)
    case offline
}
