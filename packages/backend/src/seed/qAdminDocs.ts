// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * OpenTAM Admin Portal — product documentation content.
 * Ingested into ChromaDB for the q-admin tenant so the embedded Q assistant
 * can answer questions about OpenTAM itself.
 *
 * Each entry has a docId (stable across restarts so upserts are idempotent)
 * and markdown content.
 */

export const Q_ADMIN_DOCS: Array<{ docId: string; title: string; content: string }> = [
  {
    docId: 'q-overview',
    title: 'What is OpenTAM?',
    content: `# What is OpenTAM?

OpenTAM is an AI-powered in-app guidance assistant that detects user frustration in real-time and provides
non-intrusive help. Instead of forcing users to leave your app to read docs or submit tickets,
OpenTAM watches for behavioral signals — rage clicks, dead-end loops, hesitation, cursor search patterns —
and proactively offers contextual guidance.

## How it works

OpenTAM has three core modules that form a continuous loop:

1. **Observer** — A lightweight JavaScript SDK (<20 KB) injected into your site. It captures
   behavioral signals (clicks, navigation, dwell time, scroll patterns) and emits frustration events
   when anomalies are detected.

2. **Brain** — An LLM reasoning layer that uses RAG (Retrieval-Augmented Generation) over your
   product documentation and UI metadata. When a frustration event fires, the Brain decides
   the best intervention: highlight a button, start a guided tour, or answer a question via chat.

3. **Actor** — Delivers the guidance. It can highlight elements on the page, walk users through
   multi-step workflows with interactive tours, deep-link to the right page, or answer questions
   in a conversational chat widget.

## Key concepts

- **Functional Map**: Maps UI features to DOM selectors and URLs.
  Example: \`{ feature: "API Key", selector: "#api-btn", url: "/settings/api" }\`
- **Workflows**: Ordered sequences of steps that guide users through multi-step tasks.
- **Interventions**: Actions Q takes — highlighting, tours, chat responses, deep links.
- **Tenants**: Each customer gets isolated data (map entries, docs, workflows, analytics).
`,
  },
  {
    docId: 'q-dashboard-overview',
    title: 'OpenTAM Admin Dashboard',
    content: `# OpenTAM Admin Dashboard

The OpenTAM Admin Dashboard is the control center for managing your OpenTAM deployment. It runs as a
Next.js application (default: http://localhost:3002).

## Dashboard pages

### Overview (/)
The home page shows a summary of your Q deployment — active tenants, recent interventions,
and system health.

### Map Editor (/map)
Create and manage your functional map — the mapping of UI features to DOM selectors and URLs.
Each map entry has:
- **Feature name**: Human-readable label (e.g., "Settings page")
- **Selector**: CSS selector targeting the element (e.g., \`a[href="/settings"]\`)
- **URL**: The page where this element appears
- **Description**: What the feature does
- **Source**: "manual" (created by admin) or "discovered" (auto-detected by SDK)

### Workflows (/workflows)
Create and manage multi-step guided workflows (SOPs). Each workflow is an ordered sequence
of steps that walk users through a task. Workflows can be:
- **Draft**: Being edited, not active
- **Published**: Active and available to users
- **Archived**: Retired from use

### Crawler (/crawl)
Crawl external documentation sites or GitHub repositories to build your knowledge base.
Crawled content is chunked, embedded, and stored in ChromaDB for RAG search.

### Docs (/docs)
Manage ingested documentation. You can ingest text, markdown, HTML, or PDF content.
Each document is split into chunks, embedded, and indexed for semantic search.

### Analytics (/analytics)
View frustration events, intervention success rates, and user behavior patterns.
Filter by date range and event type.

### Usage (/usage)
Monitor API usage, chat requests, and intervention counts per tenant.

### Settings (/settings)
Configure per-tenant settings:
- LLM provider and model
- API keys
- Embedding provider
- Custom system prompts

### Install (/install)
Get the SDK installation snippet for your application. Shows the script tag and
initialization code to add Q to your site.

### Surveys (/surveys)
Create and manage user surveys with rating, choice, and free-text questions. Set triggers
to control when surveys appear. View collected responses and result analytics.

### Feedback (/feature-requests)
Tabbed view for feature requests, positive feedback, and bug reports. Users can vote on
requests and admins can manage status and deduplication.

### Audit Logs (/audit-logs)
System audit trail showing user actions, configuration changes, and security events.
Filter by action type or search by user.

### Settings > Profile (/settings/profile)
Update your avatar, display name, and password.

### Settings > Security (/settings/security)
Enable two-factor authentication (2FA) with an authenticator app. Manage backup/recovery codes.

### Settings > SSO (/settings/sso)
Configure Google SSO for single sign-on authentication across your team.

### Dark Mode
Toggle between light and dark themes using the theme button in the sidebar.
Respects system preference by default.

### Forgot Password (/forgot-password)
Password reset flow — enter your email to receive a reset link.
`,
  },
  {
    docId: 'q-functional-map',
    title: 'Functional Map — how it works',
    content: `# Functional Map

The functional map is OpenTAM's understanding of your application's UI. It maps human-readable
feature names to CSS selectors and URLs so Q knows where things are and can guide users to them.

## Creating map entries

### Manual creation
In the Map Editor (/map), click "Add Entry" and fill in:
- Feature name (required)
- CSS selector (required) — must uniquely identify the element
- URL pattern — the page where the element lives
- Description — explains what the feature does

### Auto-discovery
The Q SDK's DOMMapper automatically discovers UI elements (links, buttons, tabs, form controls)
and reports them to the backend. Discovered entries appear with source "discovered" and can be
promoted to "manual" after review.

The DOMMapper scans for:
- Navigation links (\`<a>\` tags with href)
- Buttons and submit inputs
- Tab elements (ARIA roles and CSS-class patterns)
- Form controls with labels

### Stable selectors
Q generates stable CSS selectors in this priority order:
1. Element ID: \`#my-button\`
2. data-* attributes: \`[data-testid="submit"]\`
3. aria-label: \`[aria-label="Save"]\`
4. role + class combination
5. Class + nth-child fallback

## Using the map
The Brain uses the functional map to:
- Answer "where is X?" questions by highlighting the correct element
- Build guided tours that reference specific UI elements
- Understand the user's current context based on the URL they're on
`,
  },
  {
    docId: 'q-workflows-guide',
    title: 'Workflows — creating guided tours',
    content: `# Workflows

Workflows are ordered sequences of steps that guide users through multi-step tasks.
They power OpenTAM's guided tour feature.

## Creating a workflow

1. Go to Workflows (/workflows) in the dashboard
2. Click "New Workflow"
3. Fill in the workflow details:
   - **Name**: Short description (e.g., "Connect Splunk integration")
   - **Description**: What the workflow accomplishes
   - **Tags**: Optional categorization
4. Add steps in order. Each step has:
   - **URL pattern**: The page for this step (e.g., "/settings/integrations")
   - **Selector**: CSS selector of the target element
   - **Action**: What the user should do — click, navigate, input, wait, or verify
   - **Context hint**: Instructions shown to the user (e.g., "Paste your API key here")
5. Save as Draft, then Publish when ready

## Workflow statuses

- **Draft**: Editable, not served to users
- **Published**: Active — the Q agent can use it to create guided tours
- **Archived**: Soft-deleted, kept for history

## How workflows are used

When a user asks Q for help with a multi-step task (e.g., "How do I set up a webhook?"),
the Brain searches published workflows using semantic similarity. If a matching workflow
is found, Q creates an interactive tour that walks the user through each step, navigating
between pages as needed.

## Workflow sources

- **Manual**: Created by admins in the dashboard
- **Learned**: Auto-generated from observed user navigation patterns (privacy-safe)
- **Imported**: Brought in from external documentation or other systems
`,
  },
  {
    docId: 'q-sdk-installation',
    title: 'Installing the Q SDK',
    content: `# Installing the Q SDK

The Q SDK is a lightweight JavaScript bundle (<20 KB) that you add to your web application.

## Quick start

Add this script tag to your HTML, before the closing \`</body>\` tag:

\`\`\`html
<script src="https://your-q-backend.com/sdk/q.min.js"></script>
<script>
  Q.init('your_sdk_key', { backendUrl: 'https://your-q-backend.com' });
</script>
\`\`\`

## Configuration options

\`Q.init(sdkKey, options)\` accepts:
- **sdkKey** (required): Your tenant's SDK key from the dashboard
- **backendUrl** (required): URL of your Q backend server
- **debug** (optional): Enable console logging for development

## What the SDK does

Once initialized, the SDK:
1. **Observes** user behavior — clicks, navigation, scroll, dwell time
2. **Detects** frustration signals — rage clicks, dead-end loops, hesitation
3. **Maps** the UI — auto-discovers navigable elements (links, buttons, tabs)
4. **Reports** events to the Q backend for analysis
5. **Renders** interventions — highlights, tooltips, guided tours, chat widget
6. **Records** navigation paths (anonymized) for workflow learning

## Multi-page support

The SDK handles single-page apps (SPA) and traditional multi-page sites.
For SPAs, it listens to pushState/popState to detect navigation.
Guided tours can span multiple pages — Q navigates and continues the tour.
`,
  },
  {
    docId: 'q-chat-assistant',
    title: 'Q Chat — the embedded assistant',
    content: `# Q Chat

Q includes an embedded chat widget where users can ask questions about your product.
The chat is powered by an LLM with access to your documentation, functional map, and workflows.

## How it works

1. User opens the Q chat widget (floating button in the corner)
2. User types a question (e.g., "How do I create an API key?")
3. The Brain searches your indexed documentation (RAG) and functional map
4. The LLM generates a contextual answer, optionally highlighting UI elements or
   starting a guided tour

## Scope

Q Chat is strictly scoped to product guidance. It will:
- Answer questions about your product's features and UI
- Guide users to the right page or element
- Walk users through multi-step workflows
- Explain how features work based on your documentation

Q Chat will NOT:
- Write code or scripts
- Answer general knowledge questions
- Act as a general-purpose AI assistant

## LLM providers

Q supports multiple LLM providers:
- **Anthropic** (default): Claude models with full tool-use support
- **Google Gemini**: Via Gemini's OpenAI-compatible endpoint
- **OpenAI-compatible**: Any provider with an OpenAI-compatible API
  (OpenAI, MiniMax, DeepSeek, Groq, Ollama, etc.)

Configure the provider in Settings (/settings) or via environment variables.
`,
  },
  {
    docId: 'q-analytics-events',
    title: 'Analytics and frustration events',
    content: `# Analytics & Frustration Events

Q tracks user behavior to detect frustration and measure the effectiveness of interventions.

## Frustration signals

The Observer detects these patterns:
- **Rage clicks**: Rapid repeated clicks on the same element (≥3 clicks in 2 seconds)
- **Dead-end loops**: User navigates to the same page repeatedly without making progress
- **Dwell time anomaly**: User stays on a page much longer than average
- **Cursor search**: Rapid mouse movement across the page, indicating the user is looking for something
- **Error encounters**: User hits error pages or sees error messages

## Event types

Events sent to the backend include:
- \`frustration\` — a frustration signal was detected
- \`click\` — user clicked an element
- \`navigation\` — user navigated to a new page
- \`intervention_shown\` — Q showed a guidance intervention
- \`intervention_completed\` — user completed a guided tour
- \`intervention_dismissed\` — user dismissed the guidance

## Viewing analytics

Go to Analytics (/analytics) in the dashboard to see:
- Frustration event timeline
- Most common frustration locations (URL + element)
- Intervention success rate
- Tour completion rates
- Drop-off analysis for multi-step workflows
`,
  },
  {
    docId: 'q-integrations',
    title: 'Integrations — webhooks and external services',
    content: `# Integrations

Q can notify external services when events occur, enabling you to connect Q with
your existing tools (Slack, PagerDuty, custom webhooks, etc.).

## Setting up an integration

1. Go to Settings (/settings) or use the API
2. Create an integration with:
   - **Name**: Display name (e.g., "Slack alerts")
   - **Type**: "webhook" (more types coming)
   - **Config**: Provider-specific configuration (URL, headers, etc.)
3. Create triggers that define when the integration fires:
   - **Event type**: Which event triggers it (e.g., "frustration")
   - **Conditions**: Optional filters (e.g., minimum frustration score)

## Webhook format

When a trigger fires, Q sends a POST request to your webhook URL with:
\`\`\`json
{
  "event": "frustration",
  "tenantId": "your-tenant-id",
  "data": { ... },
  "timestamp": "2025-01-15T10:30:00Z"
}
\`\`\`

## Use cases

- Alert your support team in Slack when rage clicks spike
- Log frustration events to your analytics platform
- Trigger automated responses in your help desk system
- Feed data into your product analytics pipeline
`,
  },
  {
    docId: 'q-multi-tenancy',
    title: 'Multi-tenancy — tenant isolation',
    content: `# Multi-Tenancy

Q is multi-tenant by design. Each customer (tenant) gets fully isolated data.

## Tenant model

Each tenant has:
- **Tenant ID**: Unique identifier
- **SDK Key**: Used by the JavaScript SDK for client-side authentication
- **Secret Key**: Used for server-side API calls (admin operations)
- **Plan**: Determines feature limits (hobbyist, startup, enterprise)

## Data isolation

All data is scoped to a tenant:
- Functional map entries
- Workflows and workflow steps
- Ingested documentation (separate ChromaDB collection per tenant)
- Analytics and intervention logs
- Settings and LLM configuration
- Integrations and triggers

## Authentication

- **SDK key** (\`x-sdk-key\` header): Allows the embedded SDK to send events and receive interventions
- **Secret key** (\`Authorization: Bearer sk_...\`): Allows admin operations — CRUD on map, workflows, docs, settings
- **JWT tokens**: For dashboard users (register/login flow)

## Per-tenant LLM settings

Each tenant can configure their own LLM provider and model in Settings.
This allows different customers to use different AI providers based on their
compliance requirements or preferences.
`,
  },
  {
    docId: 'q-surveys',
    title: 'Surveys — collecting user feedback',
    content: `# Surveys

Surveys let you collect structured feedback from users directly inside your application.
Q can trigger surveys based on user behavior or display them on demand.

## Question types

Each survey can contain one or more questions of these types:
- **Rating**: A numeric scale (e.g., 1–5 stars or 1–10 NPS)
- **Choice**: Single or multiple choice from a set of options
- **Text**: Free-form text response

## Creating a survey

1. Go to Surveys (/surveys) in the dashboard
2. Click "New Survey"
3. Fill in the survey name and description
4. Add questions — choose the type and configure options
5. Set a trigger condition (e.g., after completing a workflow, on frustration event, on page visit)
6. Save the survey

## Triggers

Surveys can be triggered by:
- **Manual**: Shown via the Q SDK API call
- **Frustration event**: Appears when the Observer detects user frustration
- **Page visit**: Shown when the user visits a specific URL
- **Workflow completion**: Appears after a guided tour completes

## Viewing results

Go to the survey detail page and click "Results" to see:
- Response count and completion rate
- Per-question breakdowns (average rating, choice distribution, text responses)
- Response timeline
`,
  },
  {
    docId: 'q-feature-requests',
    title: 'Feature Requests & Feedback',
    content: `# Feature Requests & Feedback

The Feedback page (/feature-requests) provides a tabbed interface for managing user-submitted
feedback across three categories.

## Feedback types

- **Feature Request**: Ideas for new features or improvements. Users can vote on requests
  to signal demand.
- **Positive Feedback**: Compliments and things users love about the product. Helps identify
  what's working well.
- **Bug Report**: Issues and problems users encounter. Includes reproduction details.

## Voting and deduplication

Users can upvote feature requests to signal demand. Q automatically detects and flags
potential duplicates based on title and description similarity, helping admins keep the
list clean.

## Status management

Each feedback item progresses through statuses:
- **Open**: Newly submitted
- **Under Review**: Being evaluated by the team
- **Planned**: Accepted and scheduled for implementation
- **In Progress**: Currently being worked on
- **Completed**: Implemented and released
- **Declined**: Not planned for implementation (with reason)

## Filtering and search

Use the tab bar to switch between feature requests, positive feedback, and bug reports.
Within each tab, filter by status or search by title.
`,
  },
  {
    docId: 'q-audit-logs',
    title: 'Audit Logs — system activity trail',
    content: `# Audit Logs

The Audit Logs page (/audit-logs) provides a chronological record of all significant
actions taken within your Q tenant.

## What gets logged

Every administrative action is recorded, including:
- **Authentication**: Login, logout, failed login attempts, password resets
- **User management**: User invitations, role changes, account deletions
- **Configuration changes**: Settings updates, LLM provider changes, integration modifications
- **Data operations**: Map entry CRUD, workflow creation/publishing, document ingestion
- **Security events**: 2FA enable/disable, SSO configuration, API key rotation

## Log entry fields

Each audit log entry contains:
- **Timestamp**: When the action occurred
- **User**: Who performed the action (email/name)
- **Action**: What was done (e.g., "settings.update", "user.invite", "workflow.publish")
- **Resource**: The affected resource type and ID
- **Details**: Additional context (e.g., which fields changed)
- **IP address**: Origin of the request

## Filtering

- **By action type**: Use the action dropdown to filter by category (auth, settings, data, security)
- **By user**: Search by email or name to see a specific person's activity
- **By date range**: Narrow results to a specific time period
`,
  },
  {
    docId: 'q-profile-security',
    title: 'User Profile & Security Settings',
    content: `# User Profile & Security

## Profile (/settings/profile)

Manage your personal account settings:
- **Avatar**: Upload a profile picture displayed in the sidebar and team views
- **Display name**: Change the name shown to other team members
- **Password**: Update your password (requires current password confirmation)

## Two-Factor Authentication (/settings/security)

Add an extra layer of security to your account with 2FA:

### Setup
1. Go to Settings > Security
2. Click "Enable 2FA"
3. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.)
4. Enter the 6-digit verification code to confirm
5. Save the backup codes in a secure location

### Backup codes
When you enable 2FA, Q generates one-time backup codes. Use these if you lose access to
your authenticator app. Each code can only be used once. You can regenerate codes from the
Security settings page.

## Google SSO (/settings/sso)

Configure Google as a single sign-on provider for your team:

### Setup
1. Create an OAuth 2.0 Client ID in the Google Cloud Console
2. Add your Q dashboard URL as an authorized redirect URI
3. Go to Settings > SSO in the Q dashboard
4. Enter the Google Client ID
5. Toggle SSO on and save

Once enabled, team members can sign in with their Google account instead of
a password. You can require SSO for all team members or allow both SSO and
password login.

## Forgot Password (/forgot-password)

If you forget your password:
1. Click "Forgot password?" on the login page
2. Enter your email address
3. Check your inbox for a reset link
4. Click the link and set a new password

Reset links expire after 1 hour for security.
`,
  },
  {
    docId: 'q-dark-mode',
    title: 'Dark Mode — theme preferences',
    content: `# Dark Mode

Q supports light and dark themes to reduce eye strain and match your preference.

## Toggling themes

Click the theme toggle button in the sidebar to switch between light and dark mode.
The button uses a sun/moon icon to indicate the current state.

## System preference

By default, Q respects your operating system's color scheme preference. If your OS is
set to dark mode, Q will automatically use the dark theme on first visit.

## Persistence

Your theme choice is saved in local storage and persists across sessions and page reloads.
Changing the system preference will not override a manually selected theme.
`,
  },
];
