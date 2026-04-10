# iOS/iPad Mobile App Support for Q

## Context

Q's AI assistant currently only works with web apps via a JavaScript SDK that relies on DOM events, CSS selectors, and browser APIs. The goal is to extend Q to support native iOS/iPad and Android apps so that mobile app producers can:

- Provide on-demand AI-powered guidance (tap Q bubble when stuck)
- Get feature suggestions and navigation help via deep links
- Collect feature requests and bug reports from mobile users
- Reduce support burden with proactive in-app assistance

**Core principle: Q on mobile is user-initiated.** Unlike web where Q passively detects frustration, mobile Q lives as a floating button the user taps when they need help. No passive tracking, no battery drain, privacy-friendly by default.

**Approach:** Keep existing web SDK and API contracts untouched. Add a `platform` field to make the backend platform-aware, build native Swift and Kotlin SDKs, and adapt the AI agent prompts/tools per platform.

---

## Phase 1: Shared Types (backward-compatible additions)

**File: `packages/shared/src/index.ts`**

1. Add `Platform` type:
   ```ts
   export type Platform = 'web' | 'ios' | 'android';
   ```

2. Extend `FrustrationEvent` with optional fields:
   ```ts
   platform?: Platform;         // defaults to 'web' if absent
   screenName?: string;         // e.g. "Settings", "Checkout"
   appVersion?: string;         // app build version
   deviceInfo?: {
     model: string;             // "iPhone 15 Pro", "Pixel 8"
     os: string;                // "iOS 18.2", "Android 14"
     screenSize: string;        // "393x852"
   };
   ```

3. Add `domSnapshot` to `ChatMessage` (used by mobile SDK to send view hierarchy):
   ```ts
   domSnapshot?: string;        // JSON string of view hierarchy (mobile) or DOM snapshot (web)
   ```
   **Naming note:** The field is called `domSnapshot` for backward compatibility with the existing web contract. On mobile, it carries a view hierarchy JSON, not an actual DOM. This reuse is intentional — do not rename it.

4. Extend `FunctionalMapEntry` with `platform` field:
   ```ts
   platform?: Platform;         // defaults to 'web' if absent
   ```
   On iOS, `selector` = accessibility identifier, `url` = screen route identifier.
   On Android, `selector` = content description or view ID, `url` = screen/destination name.

5. Extend `InterventionCommand` with optional `platform` hint:
   ```ts
   platform?: Platform;
   ```

**Note:** Mobile SDK does NOT send `FrustrationSignals`. There is no passive detection. All mobile interactions are user-initiated via the Q bubble. `FrustrationSignals` schema remains web-only.

**No breaking changes** — all new fields are optional; missing `platform` defaults to `'web'`.

---

## Phase 2: Database Schema

**File: `packages/backend/src/db/schema.ts`**

Add `platform` column to:
- `functionalMapEntries` (line 69): `platform: text('platform').default('web')`
- `interventionLogs` (line 80): `platform: text('platform')`
- `workflowSteps`: `platform: text('platform').default('web')`

Create new table for mobile telemetry:
- `telemetry_events`: `id`, `sdkKey: text`, `platform: text`, `eventName: text` (e.g. `chatOpened`, `screenView`), `screenName: text`, `appVersion: text`, `deviceInfo: jsonb`, `properties: jsonb`, `createdAt: timestamp`

Add `app_identifiers` JSONB column to `sdk_keys` table (for key scoping, see §SDK Key Security):
- `app_identifiers: jsonb('app_identifiers')` — array of allowed bundle IDs / package names, e.g. `['com.app.ios', 'com.app.android']`. Null or empty = no restriction (backward compat for web keys).

Create migration with `DEFAULT 'web'` on platform columns so existing rows stay valid.

---

## Phase 3: Backend API Changes

### 3a. Event Route
**File: `packages/backend/src/routes/events.ts`**

Extend `FrustrationEventSchema` with platform context fields:
```ts
platform: z.enum(['web', 'ios', 'android']).optional().default('web'),
screenName: z.string().optional(),
appVersion: z.string().optional(),
deviceInfo: z.object({ model: z.string(), os: z.string(), screenSize: z.string() }).optional(),
```

**Mobile uses events endpoint for telemetry only.** Since mobile is entirely user-initiated, the primary mobile code path is `POST /api/v1/chat`. The events endpoint accepts mobile payloads under an `eventType: "telemetry"` discriminator — distinct from `eventType: "frustration"` used by web:

```ts
eventType: z.enum(['frustration', 'telemetry']),
// FrustrationEventSchema (frustration): web-only FrustrationSignals + signals + context
// TelemetryEventSchema (telemetry): platform + screenName + appVersion + deviceInfo + eventName + properties
eventName: z.enum(['chatOpened', 'interventionDisplayed', 'interventionDismissed', 'screenView']),
```

Allowed mobile telemetry events: `chatOpened`, `interventionDisplayed`, `interventionDismissed`, `screenView`. Mobile SDKs never send `FrustrationSignals`.

Backend stores telemetry events in a dedicated `telemetry_events` table (not `interventionLogs`) to avoid polluting intervention analytics. See Phase 2 for schema.

Pass `platform` through to `getIntervention()` for functional map filtering.

### 3b. Chat Route
**File: `packages/backend/src/routes/chat.ts`**

Extend `ChatBody`:
```ts
platform: z.enum(['web', 'ios', 'android']).optional().default('web'),
screenName: z.string().optional(),
domSnapshot: z.string().optional(),  // Mobile: JSON view hierarchy string
```

Pass `platform` and `domSnapshot` to `runChatAgent()`.

### 3c. Map Route
**File: `packages/backend/src/routes/map.ts`**

- Accept `platform` in create/update schemas
- Add `?platform=ios` query filter to `GET /api/v1/map`

### 3d. Intervention Service
**File: `packages/backend/src/services/interventionService.ts`**

- Filter functional map entries by matching `platform`
- Pass `platform` to `runInterventionAgent()`
- Set `platform` on returned `InterventionCommand`

**Note:** Frustration scorer (`frustrationScorer.ts`) remains web-only. Mobile has no automated intervention triggers — all guidance is user-initiated via chat.

---

## Phase 4: AI Agent Platform Awareness

### 4a. Intervention Agent
**File: `packages/backend/src/agent/graph.ts`**

Create `getSystemPrompt(platform: Platform)`:
- **Web (existing)**: Current `SYSTEM_PROMPT` unchanged
- **iOS**: Replace "web application" → "iOS application". Replace "CSS selector" → "accessibility identifier". Replace "DOM snapshot" → "view hierarchy snapshot". Replace "URL" → "screen route".
- **Android**: Replace "web application" → "Android application". Replace "CSS selector" → "content description or view ID". Replace "DOM snapshot" → "view hierarchy snapshot". Replace "URL" → "destination name".

Update `runInterventionAgent()` signature to accept `platform`, select prompt accordingly.

Update `buildUserMessage()`:
- iOS: label as "Current screen" instead of "Current URL", "View hierarchy" instead of "DOM snapshot"
- Android: similar adaptations using "content description" and "destination"

### 4b. Chat Agent
**File: `packages/backend/src/agent/chatAgent.ts`**

Update `runChatAgent()` signature to accept `platform` and `domSnapshot`.

Include `domSnapshot` in the user message context when present — on mobile this is the view hierarchy JSON, on web it's the DOM snapshot. Pass it through `buildUserMessage()` so the LLM can reference the current screen structure.

Create `getChatSystemPrompt(platform: Platform)`:
- iOS variant: Replace "web application" → "iOS application", "CSS selectors" → "accessibility identifiers", selector reference format: `Feature → accessibilityId (screen: route)`
- Android variant: Replace "web application" → "Android application", "CSS selectors" → "content descriptions / view IDs", selector reference format: `Feature → contentDescription:id (screen: destination)`

### 4c. Tool Definitions
**File: `packages/backend/src/agent/tools.ts`**

Create `getToolDefinitions(platform: Platform)`:
- iOS: `highlight_element.selector` description → "Accessibility identifier (e.g. settings-profile-button)"
- iOS: `deep_link.href` description → "Screen route (e.g. settings/profile)"
- Android: `highlight_element.selector` description → "Content description or view ID (e.g. settings_profile_btn)"
- Android: `deep_link.href` description → "Destination name (e.g. settings/profile)"
- iOS/Android: `create_tour` step descriptions adapted similarly

No new tool names needed — same tools, different descriptions so the LLM generates platform-appropriate values.

---

## Phase 5: iOS SDK (`packages/sdk-ios/`)

### 5a. Package Structure

```
packages/sdk-ios/
  Package.swift
  Sources/QSDK/
    Q.swift                        # Public API: Q.initialize(), Q.trackScreen()
    Transport/
      QTransport.swift             # URLSession HTTP client → same backend endpoints
      ViewSnapshot.swift           # Accessibility tree → JSON string (privacy-filtered)
    Actor/
      QActor.swift                 # Dispatches interventions
      HighlightOverlay.swift       # UIView overlay with cutout
      TourEngine.swift             # Multi-step guided tours (highlight + navigate sequence)
      DeepLinkHandler.swift        # Screen navigation via registered routes
    UI/
      QChatView.swift              # SwiftUI chat panel
      QBubbleView.swift            # Floating action button (always visible)
      SurveyView.swift             # Survey question rendering
    State/
      QState.swift                 # UserDefaults persistence
    Models/
      *.swift                      # Codable structs matching shared types
  Tests/QSDKTests/
```

**No Observer module.** There is no passive frustration detection. All signal tracking (TapTracker, NavigationTracker, GestureEntropyTracker, DwellTracker, ShakeDetector) is removed. Q is entirely user-initiated.

### 5b. Public API

```swift
public final class Q {
    public static func initialize(sdkKey: String, options: QOptions = QOptions())
    public static func trackScreen(_ name: String, route: String)
    public static func setUserId(_ userId: String)
    public static func registerRouteHandler(_ handler: @escaping (String) -> Void)
    public static func show()        // Programmatically show Q bubble
    public static func hide()        // Programmatically hide Q bubble
    public static var isEnabled: Bool { get set }
}

public struct QOptions {
    public static let defaultBrandColor = UIColor(red: 99/255, green: 102/255, blue: 241/255, alpha: 1) // #6366f1 indigo

    public var brandColor: UIColor = QOptions.defaultBrandColor
    public var bubblePosition: BubblePosition = .bottomEnd
    public var showOnScreens: [String] = []
    public var debugMode: Bool = false

    public init(
        brandColor: UIColor? = nil,
        bubblePosition: BubblePosition? = nil,
        showOnScreens: [String]? = nil,
        debugMode: Bool? = nil
    ) {
        self.brandColor = brandColor ?? QOptions.defaultBrandColor
        self.bubblePosition = bubblePosition ?? .bottomEnd
        self.showOnScreens = showOnScreens ?? []
        self.debugMode = debugMode ?? false
    }

    public enum BubblePosition { case topStart, topEnd, bottomStart, bottomEnd }
}
```

**Minimal integration — 1 line to work:**
```swift
// In AppDelegate.swift or @main struct
Q.initialize(sdkKey: "YOUR_KEY")
```

Optional steps for richer experience:
1. Call `Q.trackScreen(name:route:)` on each screen appearance for contextual chat
2. Set accessibility identifiers on key UI elements for highlight interventions
3. Register a route handler for deep link navigation

### 5c. Q Bubble (Primary UI)

The `QBubbleView` is a floating action button, always visible (can be hidden via `Q.hide()`). Tapping it opens the chat panel. No passive detection — the user is always in control.

- Position: bottom-end corner, 16pt from edges
- Size: 56pt diameter circle
- Color: configurable via `QOptions`, default brand color
- Drag to reposition (position persisted in UserDefaults)
- Auto-hides on keyboard appearance to avoid obstruction

### 5d. View Snapshot

Walk view hierarchy via `UIWindow.subviews` recursively. For each `UIView`:
- `accessibilityIdentifier`
- `accessibilityLabel`
- `accessibilityTraits`
- Class name (`UIButton`, `UILabel`, etc.)
- `frame` bounds
- `isAccessibilityElement`

**Privacy filter (required):**
- Skip any view where `isSecureTextEntry == true`
- Skip any view with `accessibilityIdentifier` or `accessibilityLabel` matching: `*password*`, `*cvv*`, `*ssn*`, `*pin*`, `*secret*` (case-insensitive)
- Skip any text content — only structural data (identifier, class, frame) is sent, never actual text values
- Cap at 200 elements

**SwiftUI compatibility note:** Walking `UIWindow.subviews` works for UIKit-based apps. For SwiftUI-first apps using `UIViewRepresentable`, the wrapped views should expose accessibility identifiers. Pure SwiftUI navigation via `NavigationStack`/`:sheet` may not expose a usable view hierarchy — in these cases, `trackScreen()` provides the only screen context.

### 5e. Interventions (Actor)

- **highlight (overlay_highlight)**: Find view by `accessibilityIdentifier`, scroll to visible, overlay transparent UIView with cutout + pulsing ring (`#6366f1`), tooltip UIView, dismiss on tap
- **deep link (deep_link)**: Call registered route handler with screen route string
- **tour (create_tour)**: Sequence of highlight + deep link steps. For each step: navigate to screen via route handler → wait for target view to appear (poll by `accessibilityIdentifier`, timeout 3s) → highlight with tooltip → advance on tap/"Next" button. `TourEngine.swift` manages step progression, back/dismiss, and cleanup of overlays between steps.
- **message (message_only)**: Show in chat panel
- **survey**: Present `SurveyView` sheet

### 5f. Chat UI

SwiftUI views: floating bubble (draggable, always visible), expandable chat panel (360pt wide), message list, text input. Same API calls as web SDK (`POST /api/v1/chat` with `platform: "ios"`).

### 5g. Transport Headers

Both SDKs send the same headers on every request:

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <sdkKey>` | Yes |
| `X-Q-App-Identifier` | Bundle ID on iOS; package name on Android (e.g. `com.app.product`) | Yes |
| `X-Q-Device-Id` | SHA-256 hash of device identifier | Yes |
| | iOS: identifierForVendor (IDFV), stored in Keychain | |
| | Android: `Settings.Secure.ANDROID_ID` (unique per app + device reset), stored in EncryptedSharedPreferences | |
| `Content-Type` | `application/json` | Yes |

`X-Q-App-Identifier` enables backend key scoping (§SDK Key Security). `X-Q-Device-Id` enables per-device rate limiting without requiring user sign-in.

---

## Phase 6: Android SDK (`packages/sdk-android/`)

### 6a. Package Structure

```
packages/sdk-android/
  build.gradle.kts
  src/main/kotlin/com/qsdk/
    Q.kt                        # Public API: Q.initialize(), Q.trackScreen()
    Transport/
      QTransport.kt             # OkHttp HTTP client → same backend endpoints
      ViewSnapshot.kt           # View tree + Compose semantics → JSON string (privacy-filtered)
    Actor/
      QActor.kt                 # Dispatches interventions
      HighlightOverlay.kt       # View overlay with cutout
      TourEngine.kt             # Multi-step guided tours (highlight + navigate sequence)
      DeepLinkHandler.kt        # Screen navigation via registered routes
    UI/
      QChatView.kt              # Compose chat panel
      QBubbleView.kt            # Floating action button
      SurveyView.kt             # Survey question rendering
    State/
      QState.kt                 # SharedPreferences persistence
    Models/
      *.kt                      # Data classes matching shared types
  tests/
```

**Same principle as iOS: no passive detection, user-initiated via Q bubble.**

### 6b. Public API

```kotlin
object Q {
    fun initialize(sdkKey: String, options: QOptions = QOptions())
    fun trackScreen(name: String, route: String)
    fun setUserId(userId: String)
    fun registerRouteHandler(handler: (String) -> Unit)
    fun show()
    fun hide()
    var isEnabled: Boolean
}

data class QOptions(
    val brandColor: Int = 0xFF6366F1.toInt(),  // Default indigo
    val bubblePosition: BubblePosition = BubblePosition.BOTTOM_END,
    val showOnScreens: List<String> = emptyList(),  // Routes to auto-show bubble; empty = all screens
    val debugMode: Boolean = false
)

enum class BubblePosition { TOP_START, TOP_END, BOTTOM_START, BOTTOM_END }
```

**Minimal integration:**
```kotlin
// In Application class
Q.initialize(sdkKey = "YOUR_KEY")
```

### 6c. Q Bubble (Primary UI)

`QBubbleView` is a floating action button, always visible (hidden via `Q.hide()`). Tapping opens the chat panel.

- Position: bottom-end corner, 16dp from edges
- Size: 56dp diameter circle
- Color: configurable via `QOptions`, default brand color
- Drag to reposition (position persisted in SharedPreferences)
- Auto-hides on keyboard appearance to avoid obstruction

Same API behavior as iOS bubble. Chat panel uses Jetpack Compose.

### 6d. View Snapshot

**Primary approach (no special permissions):** Traverse the hosting Activity's view tree via `Activity.window.decorView.rootView` recursively. For each `View`:
- `id` → resolve to resource name via `resources.getResourceEntryName(view.id)` (e.g., `settings_profile_btn`)
- `contentDescription`
- `className` (e.g., `android.widget.Button`, `androidx.compose.ui.platform.ComposeView`)
- `getGlobalVisibleRect()` bounds
- `isClickable`, `isFocusable`

For Jetpack Compose: `ComposeView` subtrees are opaque to the View system. Use `SemanticsNode` traversal via `composeView.semanticsOwner.rootSemanticsNode` to extract `testTag`, `contentDescription`, `role`, and bounds from the Compose semantics tree.

**Compose API stability note:** `semanticsOwner` is an internal API (`@InternalComposeUiApi`) that may break between Compose versions. Pin a minimum Compose BOM version (e.g., `2024.06.00`+) and test against it. If `semanticsOwner` is unavailable at runtime (reflection check), fall back gracefully to treating the `ComposeView` as a single opaque node — `trackScreen()` still provides screen context.

**Privacy filter (required):**
- Skip any node where the `View` is a `TextInputLayout`/`EditText` with `inputType` containing `TYPE_TEXT_VARIATION_PASSWORD` or `TYPE_TEXT_VARIATION_VISIBLE_PASSWORD`
- Skip any node with resource name or `contentDescription` matching: `*password*`, `*cvv*`, `*ssn*`, `*pin*`, `*secret*` (case-insensitive)
- Never send text content — only structural data (resource name, class, bounds)
- Cap at 200 nodes

**No special permissions required.** The SDK only inspects views within the host app's own process. `AccessibilityService` is NOT needed (that's for inspecting *other* apps). This avoids the scary system-level permission dialog entirely.

### 6e. Interventions (Actor)

- **highlight**: Find view by resource name or `contentDescription`, scroll to visible, overlay cutout View with pulsing ring
- **deep_link**: Call registered route handler with destination name
- **tour**: Same step-based engine as iOS — navigate → wait for view → highlight → advance
- **message**: Show in chat panel
- **survey**: Present survey Compose dialog

### 6f. Transport Headers

Same headers as iOS §5g. Both SDKs send `Authorization`, `X-Q-App-Identifier`, `X-Q-Device-Id`, and `Content-Type` on every request.

---

## Phase 7: Dashboard Changes

### 7a. Functional Map Editor
**File: `packages/dashboard/src/app/map/MapTable.tsx`**
- Add "Platform" column with badge (Web / iOS / Android)
- Platform selector in create/edit form (default: web)
- Filter toggle to show web/iOS/Android/all entries
- Contextual labels: "CSS Selector" vs "Accessibility ID" vs "Content Desc / View ID", "URL Path" vs "Screen Route" vs "Destination"

### 7b. Install Page
**File: `packages/dashboard/src/app/install/page.tsx`**
- Add iOS tab with Swift Package Manager instructions + code snippet
- Add Android tab with Maven/Gradle instructions + code snippet

### 7c. Analytics
**File: `packages/dashboard/src/app/analytics/page.tsx`**
- Platform filter dropdown
- Platform distribution chart

---

## Cross-Cutting Concerns

### SDK Key Security

Web SDK keys are semi-hidden in page source, but mobile app binaries are trivially decompiled — the `sdkKey` will be extracted. Mitigations:

- **Key scoping**: A single SDK key can be scoped to one or more app identifiers. The `sdk_keys` table gains an `app_identifiers` JSONB column: `['com.app.ios', 'com.app.android']`. The mobile SDK sends `X-Q-App-Identifier` header with every request; the backend rejects requests where the identifier isn't in the key's allowlist.
- **Rate limiting**: Per-device rate limiting (keyed on a device fingerprint hash, not user ID) to prevent abuse from extracted keys.
- **Key rotation**: Dashboard should support creating new keys and revoking old ones with a configurable grace period (e.g., 24h) during which both old and new keys are valid.

The `QTransport` layer in both SDKs must send `X-Q-App-Identifier` header from day one. Key validation logic and `sdk_keys` schema are fully specified above.

### Offline Resilience & Retry

Mobile networks are unreliable. Both SDKs need a basic retry queue:

- **iOS (`QTransport.swift`)**: On network failure, persist pending request to a lightweight on-disk queue (JSON file in app's caches directory). Monitor connectivity via `NWPathMonitor`; flush queue when path becomes `.satisfied`. Cap queue at 50 items; drop oldest on overflow.
- **Android (`QTransport.kt`)**: Same pattern using `ConnectivityManager.NetworkCallback`. Persist to internal storage JSON file.
- **Retry policy**: Exponential backoff (1s, 2s, 4s) with max 3 retries per request. After 3 failures, move to dead-letter queue (logged locally, not retried).
- **Scope**: Retry queue applies only to fire-and-forget telemetry events (`POST /api/v1/events` with `eventType: "telemetry"`). Chat messages (`POST /api/v1/chat`) must NOT be queued — a stale chat message retried 30s later produces a confusing UX. Chat requests fail immediately.
- **Chat UX**: When offline, show "You're offline — please try again when you have a connection" in the chat panel. Do not queue or auto-retry the message.

---

## Files Summary

### New files
| File | Purpose |
|---|---|
| `packages/sdk-ios/` (entire package) | Native iOS/iPad SDK |
| `packages/sdk-android/` (entire package) | Native Android SDK |
| DB migration file | Add `platform` columns + create `telemetry_events` table + add `app_identifiers` to `sdk_keys` |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/index.ts` | Add `Platform` type; add optional fields to FrustrationEvent, FunctionalMapEntry, InterventionCommand; add `domSnapshot` to ChatMessage. `FrustrationSignals` unchanged (web-only). |
| `packages/backend/src/db/schema.ts` | Add `platform` column to 3 tables; create `telemetry_events` table; add `app_identifiers` JSONB column to `sdk_keys` table |
| `packages/backend/src/routes/events.ts` | Accept `platform` + mobile telemetry in Zod schema with `eventType` discriminator and `eventName` enum |
| `packages/backend/src/routes/chat.ts` | Accept `platform` + `domSnapshot` in ChatBody |
| `packages/backend/src/routes/map.ts` | Accept `platform` in CRUD, add query filter |
| `packages/backend/src/services/interventionService.ts` | Filter entries by platform, pass through |
| `packages/backend/src/agent/graph.ts` | Platform-aware system prompt + `buildUserMessage` for iOS + Android |
| `packages/backend/src/agent/chatAgent.ts` | Platform-aware chat prompt, accept `platform` + `domSnapshot` params |
| `packages/backend/src/agent/tools.ts` | `getToolDefinitions(platform)` with adapted descriptions for all 3 platforms |
| `packages/dashboard/src/app/map/MapTable.tsx` | Platform column + filter |
| `packages/dashboard/src/app/install/page.tsx` | iOS + Android install tabs |
| `packages/dashboard/src/app/analytics/page.tsx` | Platform filter + distribution chart |

---

## Implementation Order

1. Shared types (Phase 1) — no breaking changes
2. DB schema migration (Phase 2)
3. Backend route + intervention service changes (Phase 3)
4. Agent platform awareness (Phase 4) — add iOS + Android variants
5. iOS SDK core: Q + Transport + ViewSnapshot + UI (Phase 5a-d, 5f)
6. iOS SDK Actor: HighlightOverlay + TourEngine + DeepLinkHandler (Phase 5e)
7. Android SDK (Phase 6)
8. Dashboard changes (Phase 7)

**Implementation notes:**
- iOS and Android SDKs can be built in parallel after Phase 4
- Mobile interventions are always user-initiated (no automated triggers)
- Web SDK remains unchanged; frustration detection stays web-only
- Frustration scorer is not used for mobile — removed from mobile code paths entirely

---

## Verification

1. **Backward compat**: Existing web SDK sends events without `platform` → backend defaults to `'web'`, everything works as before
2. **Backend**: `POST /api/v1/chat` with `platform: "ios"` → chat agent uses iOS system prompt → returns intervention with accessibility identifiers
3. **Backend**: `POST /api/v1/chat` with `platform: "android"` → chat agent uses Android system prompt → returns intervention with view IDs
4. **Backend**: `GET /api/v1/map?platform=ios` → returns only iOS entries
5. **Backend**: `POST /api/v1/events` with `eventType: "telemetry"`, `eventName: "screenView"` → stored in `telemetry_events` table with correct `platform` and `screenName`
6. **iOS SDK**: Initialize in test app → tap Q bubble → chat opens → enter "how do I export my data?" → backend responds with correct iOS-formatted guidance
7. **iOS SDK**: Send "highlight settings" → backend returns `highlight` command with iOS accessibility ID → overlay appears on correct view
8. **Android SDK**: Same flow with Android-specific accessibility/view ID formatting
9. **Privacy**: Snapshot contains no secure text fields, no text content matching sensitive patterns
10. **Dashboard**: Map editor shows platform column; creating entry with platform=ios stores correctly; install page shows both mobile SDK setup instructions
11. **Tests**: `pnpm test` — all existing tests pass (no breaking changes)
