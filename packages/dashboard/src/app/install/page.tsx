'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import { backendConfig } from '@/lib/config';

type PlatformTab = 'web' | 'ios' | 'android';

export default function InstallPage() {
  const { sdkKey, backendUrl } = backendConfig;
  const [tab, setTab] = useState<PlatformTab>('web');

  const scriptSnippet = `<script src="https://cdn.useq.dev/q.min.js"></script>
<script>
  Q.init("${sdkKey}");
</script>`;

  const curlSnippet = `curl -X POST ${backendUrl}/api/v1/events \\
  -H "Content-Type: application/json" \\
  -d '{
    "tenantId": "tenant-1",
    "sessionId": "test-session",
    "currentUrl": "/dashboard",
    "signals": {
      "rageClicks": 3,
      "deadEndLoops": 1,
      "dwellSeconds": 45,
      "cursorEntropy": 0.8
    },
    "domSnapshot": "<button id=\\"create-project-btn\\">Create Project</button>",
    "timestamp": "${new Date().toISOString()}"
  }'`;

  const iosSnippet = `// Package.swift dependency
.package(url: "https://github.com/nicholasgousis/q-sdk-ios.git", from: "1.0.0")

// 1. Initialize (AppDelegate or @main App)
import QSDK

Q.initialize(sdkKey: "${sdkKey}", options: QOptions(
    backendUrl: "${backendUrl}"
))

// 2. Track screens (call in each view's onAppear)
Q.trackScreen("Home", route: "home")

// 3. Send chat from your own UI (async)
let response = try await Q.chat("How do I reset my password?")
print(response.reply)

// 4. Handle interventions (optional)
if let intervention = response.intervention {
    await Q.executeIntervention(intervention)
}

// 5. Register a route handler for deep link interventions (optional)
Q.registerRouteHandler { route in
    // Navigate to the given screen route
}`;

  const androidSnippet = `// build.gradle.kts (app module)
dependencies {
    implementation("dev.useq:q-sdk-android:1.0.0")
}

// 1. Initialize (Application.onCreate)
import dev.useq.sdk.Q
import dev.useq.sdk.QOptions

Q.initialize(
    context = this,
    sdkKey = "${sdkKey}",
    options = QOptions(backendUrl = "${backendUrl}")
)

// 2. Track screens (call in onResume or Compose LaunchedEffect)
Q.trackScreen("Home", route = "home")

// 3. Send chat from your own UI (on background thread)
val response = Q.chat("How do I reset my password?")
showReply(response.reply)

// 4. Handle interventions (optional)
response.intervention?.let { Q.executeIntervention(it) }

// 5. Register a route handler for deep link interventions (optional)
Q.registerRouteHandler { route ->
    // Navigate to the given destination
}`;

  const tabCls = (t: PlatformTab) =>
    `rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
      tab === t
        ? 'bg-white dark:bg-gray-900 text-amber-600 border-b-2 border-amber-500'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Install</h1>

      {/* Platform tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => setTab('web')} className={tabCls('web')}>Web</button>
        <button onClick={() => setTab('ios')} className={tabCls('ios')}>iOS</button>
        <button onClick={() => setTab('android')} className={tabCls('android')}>Android</button>
      </div>

      {tab === 'web' && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              1. Add the Q snippet to your site
            </h2>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Paste this into the <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs">&lt;head&gt;</code> of every page where you want Q to run.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap">
              {scriptSnippet}
            </pre>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              SDK key: <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">{sdkKey}</code>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              2. Test your installation
            </h2>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Run this curl command to send a test frustration event and verify the backend responds with an intervention.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-blue-300 shadow-inner whitespace-pre-wrap">
              {curlSnippet}
            </pre>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">3. Verify</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              After sending the test event, visit the{' '}
              <a href="/" aria-label="Navigate to Overview" className="text-amber-600 underline hover:text-amber-700">
                Overview
              </a>{' '}
              page to see the intervention logged in real time.
            </p>
          </section>
        </>
      )}

      {tab === 'ios' && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              1. Add the Q SDK via Swift Package Manager
            </h2>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              In Xcode, go to <strong>File &gt; Add Package Dependencies</strong> and enter the repository URL. Q is a headless SDK — initialize it, then call <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs">Q.chat()</code> from your own chat UI.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap">
              {iosSnippet}
            </pre>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              SDK key: <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">{sdkKey}</code>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              2. Set accessibility identifiers
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Q uses accessibility identifiers to locate UI elements. Add <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs">.accessibilityIdentifier(&quot;my-button&quot;)</code> to key views, then register them in the Functional Map with platform set to <strong>iOS</strong>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">3. Verify</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Open the chat bubble in your app and ask a question. Check the{' '}
              <a href="/" aria-label="Navigate to Overview" className="text-amber-600 underline hover:text-amber-700">
                Overview
              </a>{' '}
              page to see telemetry events arriving from your iOS app.
            </p>
          </section>
        </>
      )}

      {tab === 'android' && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              1. Add the Q SDK via Gradle
            </h2>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Add the dependency to your app module. Q is a headless SDK — initialize it, then call <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs">Q.chat()</code> from your own chat UI.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-gray-900 px-5 py-4 text-sm text-green-300 shadow-inner whitespace-pre-wrap">
              {androidSnippet}
            </pre>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              SDK key: <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">{sdkKey}</code>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              2. Set content descriptions and view IDs
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Q uses <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 text-xs">contentDescription</code> and view IDs to locate UI elements. Add them to key views, then register them in the Functional Map with platform set to <strong>Android</strong>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">3. Verify</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Open the chat bubble in your app and ask a question. Check the{' '}
              <a href="/" aria-label="Navigate to Overview" className="text-amber-600 underline hover:text-amber-700">
                Overview
              </a>{' '}
              page to see telemetry events arriving from your Android app.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
