# Q Admin Portal — Feature Expansion Plan

## Context

The Q admin dashboard is functional but bare-bones: light-mode only, no pagination on tables, no password reset / SSO / 2FA, no audit trail, no feedback collection system. The user wants a **powerful, polished admin portal** with enterprise-grade auth, user management, and a feedback/survey pipeline that connects the SDK's frustration detection to actionable product insights.

---

## Phase 0: Shared Infrastructure

**Why first:** Dark mode and DataTable are used by every phase that follows.

### 0A — Dark Mode

| File | Change |
|------|--------|
| `dashboard/tailwind.config.ts` | Add `darkMode: 'class'` |
| `dashboard/src/app/globals.css` | Add CSS variables for light/dark themes (backgrounds, borders, text, surfaces) |
| **New** `dashboard/src/components/ThemeProvider.tsx` | Client component: reads `localStorage('q_theme')`, sets `.dark` class on `<html>`, provides `useTheme()` hook. Also sets cookie for SSR to prevent FOUC |
| **New** `dashboard/src/components/ThemeToggle.tsx` | Sun/moon toggle button (light → dark → system) |
| `dashboard/src/app/layout.tsx` | Wrap with `<ThemeProvider>`, read `q_theme` cookie for initial class, add `<ThemeToggle>` to sidebar footer |
| All page files | Add `dark:` variants: `bg-white` → `bg-white dark:bg-gray-900`, `border-gray-200` → `border-gray-200 dark:border-gray-700`, etc. |

### 0B — Reusable DataTable Component

**New** `dashboard/src/components/DataTable.tsx` — generic client component:

```typescript
interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
}
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;        // default 20
  searchable?: boolean;     // global text search
  rowKey: (row: T) => string;
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
}
```

Features: global search, per-column filter inputs, sort by column, pagination (prev/next + page N of M + page size 10/20/50). All Tailwind, dark-mode compatible.

**Refactor existing tables** to use DataTable:
- `map/MapTable.tsx` entries table
- `workflows/page.tsx` workflows list
- `settings/team/page.tsx` users table
- `page.tsx` (overview) intervention logs table
- `settings/integrations/page.tsx` integrations list

---

## Phase 1: Auth Hardening

### 1A — Forgot Password / Reset

| File | Change |
|------|--------|
| `shared/src/index.ts` | (no change needed — reset tokens are backend-internal) |
| `backend/src/db/store.ts` | Add `mustChangePassword?: boolean` to `User`; add `createPasswordResetToken()`, `getPasswordResetToken()`, `deletePasswordResetToken()` |
| `backend/src/db/schema.ts` | Add `password_reset_tokens` table (id, userId, tokenHash, expiresAt, createdAt); add `must_change_password` column to `users` |
| `backend/src/db/inMemoryStore.ts` | Implement new methods with Map |
| `backend/src/db/sqliteStore.ts` | Implement new methods with Drizzle |
| **New** `backend/src/routes/passwordReset.ts` | `POST /api/v1/auth/forgot-password` — generate reset token (dev: return in response; prod: email). `POST /api/v1/auth/reset-password` — validate token, hash new password, invalidate all sessions |
| `backend/src/middleware/auth.ts` | Add new routes to `PUBLIC_PREFIXES` |
| `backend/src/routes/auth.ts` | On login, include `mustChangePassword` flag in response. New: `POST /api/v1/auth/change-password` (requires current password + JWT) |
| **New** `dashboard/src/app/forgot-password/page.tsx` | Email input form |
| **New** `dashboard/src/app/reset-password/page.tsx` | Token + new password form |
| **New** `dashboard/src/app/change-password/page.tsx` | Force change on first login |
| `dashboard/src/app/login/page.tsx` | Add "Forgot password?" link; handle `mustChangePassword` response → redirect to `/change-password` |
| `dashboard/src/middleware.ts` | Add `/forgot-password`, `/reset-password`, `/change-password` to public paths |

### 1B — Google SSO

| File | Change |
|------|--------|
| `backend/src/db/store.ts` | Add `oauthProvider?: string`, `oauthProviderId?: string` to `User` |
| `backend/src/db/schema.ts` | Add columns to `users` table |
| Both store implementations | Handle new fields |
| **New** `backend/src/routes/sso.ts` | `POST /api/v1/auth/sso/google` — verify Google ID token (manual JWT verify against Google's JWKS at `googleapis.com/oauth2/v3/certs`), match or create user+tenant, return JWT. No new dependencies needed (use `jose` already in project for JWKS fetch). `GET /api/v1/auth/sso/config` — public endpoint, returns `{ google: { enabled, clientId } }` so login page knows which SSO providers are active |
| `backend/src/middleware/auth.ts` | Add `/api/v1/auth/sso/` to `PUBLIC_PREFIXES` |
| `backend/src/db/store.ts` | Add to `TenantSettings`: `ssoGoogleClientId?: string`, `ssoGoogleEnabled?: boolean` |
| `dashboard/src/app/login/page.tsx` | Email/password form always shown (never hidden). On mount, fetch `/api/v1/auth/sso/config`. If Google enabled, show "Sign in with Google" button below the password form with a divider ("or"). Load Google Identity Services script dynamically, POST credential to backend |
| `dashboard/src/app/register/page.tsx` | Same Google button |
| `dashboard/src/app/settings/` (SSO section) | New "SSO" tab under Settings: Google Client ID input, enable/disable toggle. Stored via `PUT /api/v1/tenant/settings` (reuse existing settings route) |
| `dashboard/src/components/SettingsNav.tsx` | Add "SSO" link |
| **No env vars needed** — Google Client ID is configured per-tenant from the Settings UI |

### 1C — Two-Factor Authentication (TOTP)

| File | Change |
|------|--------|
| `backend/package.json` | Add `otpauth` (~5kb TOTP library) |
| `backend/src/db/store.ts` | Add to `User`: `totpSecret?: string`, `totpEnabled?: boolean`, `backupCodes?: string` (JSON array of hashed codes) |
| `backend/src/db/schema.ts` | Add columns to `users` |
| Both store implementations | Handle new fields |
| **New** `backend/src/routes/twoFactor.ts` | `POST /2fa/setup` → generate secret + otpauth URI. `POST /2fa/verify` → verify code, enable 2FA, return 8 backup codes. `POST /2fa/disable` → require password. `POST /2fa/validate` → validate code during login (accepts temp token) |
| `backend/src/routes/auth.ts` | Login: if `totpEnabled`, return `{ requires2FA: true, tempToken }` instead of full JWT. Temp token is a short-lived JWT (5 min, claim: `purpose: '2fa'`) |
| `dashboard/src/app/login/page.tsx` | Handle `requires2FA` response: show 6-digit TOTP input, call `/2fa/validate` |
| **New** `dashboard/src/app/settings/security/page.tsx` | QR code display for setup, verification input, backup codes panel, disable 2FA button |
| `dashboard/src/components/SettingsNav.tsx` | Add "Security" link |

### 1D — Initial Setup / Force Password Change

- **Seeded admin user**: `inMemoryStore.ts` seeds a default admin user: email `admin@q.local`, password `changeme`, `mustChangePassword: true`. This user is the owner of the Q admin tenant and is always available as a fallback login
- Invite flow (existing in `auth.ts`) already creates temp passwords → add `mustChangePassword: true`
- Dashboard middleware: after login, if `mustChangePassword` flag → redirect to `/change-password`
- The `/change-password` page (from 1A) handles this

**Critical safety rule**: Password-based login (email + password) is **always available** and can never be disabled, even when SSO is configured. SSO is an *additional* login method, not a replacement. This ensures:
- If SSO is misconfigured, admins can still log in with email/password to fix settings
- The seeded `admin@q.local` / `changeme` account always works as a last-resort recovery path
- The login page always shows the email/password form; SSO buttons appear below it when enabled

---

## Phase 2: User Management & Audit

### 2A — User Profile

| File | Change |
|------|--------|
| `backend/src/db/store.ts` | Add `avatar?: string` to `User` |
| `backend/src/db/schema.ts` | Add `avatar` column |
| Both stores | Handle new field |
| `backend/src/routes/auth.ts` | New: `POST /api/v1/auth/change-password` (current + new password). Include `avatar` in `/me` response. New: `POST /api/v1/tenant/users/:id/reset-password` (admin action — generates temp password, sets `mustChangePassword`) |
| **New** `dashboard/src/app/settings/profile/page.tsx` | Sections: avatar (initials-based colored circle or emoji picker), name/email edit, password change form, recovery codes (if 2FA enabled) |
| `dashboard/src/components/SettingsNav.tsx` | Add "Profile" link |
| `dashboard/src/app/settings/team/page.tsx` | Add "Reset Password" admin action per user |

### 2B — Audit Log

| File | Change |
|------|--------|
| `shared/src/index.ts` | Add `AuditLogEntry` type: `{ id, tenantId, userId, userEmail, action, resource, resourceId?, details?, ipAddress?, createdAt }` |
| `backend/src/db/store.ts` | Add `createAuditLog()`, `getAuditLogs(tenantId, opts?)`, `countAuditLogs()` |
| `backend/src/db/schema.ts` | Add `audit_logs` table |
| Both stores | Implement |
| **New** `backend/src/middleware/audit.ts` | Helper: `logAudit(request, action, resource, resourceId?, details?)` — extracts user/tenant/IP from request |
| **New** `backend/src/routes/auditLogs.ts` | `GET /api/v1/audit-logs` — paginated, filterable by action/user/date. Owner/admin only |
| Instrument: `auth.ts`, `settings.ts`, `tenant.ts`, `workflows.ts`, `map.ts`, `integrations.ts` | Add `logAudit()` calls on write operations |
| **New** `dashboard/src/app/audit-logs/page.tsx` | DataTable with columns: Time, User, Action, Resource, Details. Filters by action type, user |
| `dashboard/src/app/layout.tsx` | Add "Audit Logs" to sidebar nav |
| `dashboard/src/lib/api.ts` | Add `getAuditLogs()` |

---

## Phase 3: Map/Workflow Scoping & Feature Requests

### 3A — Map Editor & Workflow Scoping

The Q admin tenant (`tenant-q-admin`) has its own map entries and workflows for the dashboard itself. Regular tenant users should see only their own data, with an option to view Q's entries as a reference.

| File | Change |
|------|--------|
| `backend/src/routes/map.ts` | Add `?includeReference=true` query param. When set, return `{ entries: [...own...], referenceEntries: [...q-admin...] }` |
| `backend/src/routes/workflows.ts` | Same pattern for workflows list |
| `dashboard/src/app/map/MapTable.tsx` | Add collapsible "Q Reference Entries" section (read-only, muted styling). Toggle button |
| `dashboard/src/app/workflows/page.tsx` | Same collapsible reference section |

### 3B — Feature Requests & Feedback Collection

| File | Change |
|------|--------|
| `shared/src/index.ts` | Add types: `FeatureRequestStatus` (`new` \| `under_review` \| `planned` \| `in_progress` \| `completed` \| `declined`), `FeedbackType` (`feature_request` \| `positive_feedback` \| `bug_report`), `FeatureRequest` (id, tenantId, type, title, description, status, votes, submittedBy, submittedByEmail?, createdAt, updatedAt) |
| `backend/src/db/store.ts` | Add: `createFeatureRequest()`, `getFeatureRequestsByTenantId(tenantId, type?, status?)`, `getFeatureRequestById()`, `updateFeatureRequest()`, `deleteFeatureRequest()`, `voteFeatureRequest()` |
| `backend/src/db/schema.ts` | Add `feature_requests` + `feature_request_votes` tables |
| Both stores | Implement |
| **New** `backend/src/routes/featureRequests.ts` | Full CRUD. `POST` checks for similar titles (SQL `LIKE` on keywords) → returns `possibleDuplicates[]` so client can offer "vote instead". `POST /:id/vote` (SDK key or JWT auth). Optional: `rawFeedback` field processed by LLM into structured title+description |
| **New** `dashboard/src/app/feature-requests/page.tsx` | Tabbed view: Feature Requests \| Positive Feedback \| Bug Reports. DataTable per tab. Status badges, vote counts, admin status dropdown. "New Request" button with smart form |
| `dashboard/src/app/layout.tsx` | Add "Feedback" to sidebar nav |
| `dashboard/src/lib/api.ts` | Add feedback CRUD helpers |

---

## Phase 4: Survey System (Frustration Feedback + UX Surveys)

### 4A — Shared Types & Backend

| File | Change |
|------|--------|
| `shared/src/index.ts` | Add: `SurveyQuestionType` (`rating` \| `single_choice` \| `multi_choice` \| `text`), `SurveyQuestion` (id, type, text, required?, options?, min?, max?, ratingStyle?), `SurveyDefinition` (id, tenantId, name, description?, questions[], triggerOn?, active, createdAt, updatedAt), `SurveyResponse` (id, surveyId, tenantId, sessionId, answers, createdAt). Add `'survey'` to `InterventionAction`. Add `surveyId?`, `surveyQuestions?` to `InterventionCommand` |
| `backend/src/db/store.ts` | Add: `createSurvey()`, `getSurveysByTenantId()`, `getSurveyById()`, `updateSurvey()`, `deleteSurvey()`, `createSurveyResponse()`, `getSurveyResponses()`, `getSurveyResponseStats()` |
| `backend/src/db/schema.ts` | Add `surveys` (questions as JSON), `survey_responses` (answers as JSON) tables |
| Both stores | Implement |
| **New** `backend/src/routes/surveys.ts` | CRUD for survey definitions (JWT admin). `POST /:id/responses` (SDK key auth — end users submit). `GET /:id/stats` — aggregated analytics (avg ratings, choice distributions) |
| `backend/src/routes/events.ts` | After intervention generated, check for active surveys with matching trigger → attach survey to response. **Never attach surveys for the Q admin tenant** (`tenant-q-admin`) |

### 4B — SDK Survey UI

| File | Change |
|------|--------|
| **New** `sdk/src/survey.ts` | `SurveyPanel` class: creates a slide-up overlay form (separate from chat widget). Renders rating (stars/emoji SVGs), single-choice (styled radio divs), multi-choice (toggle divs), text (textarea). Submit → `POST /api/v1/surveys/:id/responses`. Dismiss button. CSS animations |
| `sdk/src/actor.ts` | Handle `action: 'survey'` → instantiate `SurveyPanel` with the questions from `InterventionCommand`. **Skip survey actions when SDK is initialized with the Q admin tenant** (`sdk_q_admin`) — surveys are for customers' end-users only, not the admin portal itself |
| `sdk/src/index.ts` | Import and wire `SurveyPanel`. Pass a `isAdminPortal` flag (derived from SDK key matching `sdk_q_admin`) to the Actor so it knows to mute surveys |

**Scoping rule**: The Q admin portal's embedded Q instance (`tenant-q-admin`) never shows surveys. Surveys are exclusively a feature that Q customers deploy to *their* end-users. The admin portal Q only provides navigation guidance and product help.

### 4C — Dashboard Survey Management

| File | Change |
|------|--------|
| **New** `dashboard/src/app/surveys/page.tsx` | DataTable listing surveys: name, question count, active status, response count, actions |
| **New** `dashboard/src/app/surveys/new/page.tsx` | Survey builder: name, description, add/remove/reorder questions with type-specific editors (rating range, choice options, etc.), trigger config, save |
| **New** `dashboard/src/app/surveys/[id]/page.tsx` | Edit survey + view summary stats |
| **New** `dashboard/src/app/surveys/[id]/results/page.tsx` | Results dashboard: bar charts (recharts) for choice distributions, average ratings with trend, text response list, response timeline |
| `dashboard/src/app/layout.tsx` | Add "Surveys" to sidebar nav |
| `dashboard/src/lib/api.ts` | Add survey CRUD + stats helpers |

### 4D — Admin-Triggered Surveys

- Dashboard surveys page gets a "Send to Users" button per survey
- Backend: `POST /api/v1/surveys/:id/trigger` — marks survey as pending for all active SDK sessions
- SDK: on next heartbeat/event, checks for pending surveys and shows the panel
- This allows admins to proactively collect UX feedback without waiting for frustration events

---

## Phase 5: Q Admin Tenant Updates & Accessibility

Every new dashboard page/feature must be reflected in the Q admin tenant's self-hosted guidance data, and every interactive UI element must have a meaningful `aria-label` so the SDK's DOMMapper can build stable selectors.

### 5A — aria-label on all dashboard UI elements

All interactive elements across the dashboard must have `aria-label` attributes. This is a sweep across all pages (existing + new):

| Element type | aria-label pattern | Example |
|-|-|-|
| Sidebar nav links | `"Navigate to {page}"` | `aria-label="Navigate to Surveys"` |
| Table action buttons | `"{Action} {resource}"` | `aria-label="Edit workflow"`, `aria-label="Delete map entry"` |
| Form inputs | `"{Field name} input"` | `aria-label="Email input"` |
| Toggle/switches | `"Toggle {feature}"` | `aria-label="Toggle dark mode"` |
| Tab buttons | `"{Tab name} tab"` | `aria-label="Feature Requests tab"` |
| Modal/dialog triggers | `"{Action}"` | `aria-label="Create new survey"` |
| Pagination controls | `"Next page"`, `"Previous page"` | |
| Filter inputs | `"Filter by {column}"` | `aria-label="Filter by status"` |

Files to update: **every page and component** in `dashboard/src/app/` and `dashboard/src/components/`.

### 5B — Update Q admin tenant seed data

| File | Change |
|------|--------|
| `backend/src/seed/qAdminDocs.ts` | Add new doc entries for every new feature: Surveys (how to create, trigger, view results), Feature Requests (how the voting system works, how to manage), Audit Logs (what actions are tracked), User Profile (avatar, password, 2FA), SSO (how to configure Google), Dark Mode. Update existing docs to reference new pages |
| `backend/src/db/inMemoryStore.ts` (`seedQAdminTenant`) | Add new map entries for all new sidebar pages: Surveys (`/surveys`), Feature Requests/Feedback (`/feature-requests`), Audit Logs (`/audit-logs`), Settings > Profile (`/settings/profile`), Settings > Security (`/settings/security`), Settings > SSO (`/settings/sso`). Update selectors to use `aria-label` based selectors |
| `backend/src/db/inMemoryStore.ts` (`seedQAdminTenant`) | Add new workflows: "Create and configure a survey", "Set up Google SSO", "Enable 2FA for your account", "Review audit logs", "Submit a feature request", "Manage user profiles and roles" |

### 5C — Keep Q admin data in sync

Add a note/convention: whenever a new dashboard page or feature is added in future work, the developer must also:
1. Add `aria-label` to all interactive elements on the page
2. Add a map entry in `seedQAdminTenant()` for the page
3. Add a doc entry in `qAdminDocs.ts` explaining the feature
4. Add a workflow if the feature involves multi-step setup

---

## Phase 6: Testing

| File | Change |
|------|--------|
| `backend/src/__tests__/setup.ts` | Register all new routes (passwordReset, sso, twoFactor, featureRequests, surveys, auditLogs) |
| `backend/src/__tests__/api.test.ts` | Add test sections for each new feature area |
| New test files (optional split) | `auth-extended.test.ts`, `featureRequests.test.ts`, `surveys.test.ts`, `auditLogs.test.ts` |
| Q admin seed tests | Verify new map entries, workflows, and docs are correctly seeded for `tenant-q-admin` |

Key test scenarios:
- Password reset: request → use token → login with new password
- Force password change: login with `mustChangePassword` → verify flag in response
- 2FA: setup → verify → login flow with temp token → validate
- Google SSO: mock ID token verification → login/register
- Feature requests: CRUD, vote, duplicate detection
- Surveys: create → submit response → verify stats aggregation
- Audit logs: perform actions → verify logs recorded → query with filters
- Map scoping: verify `?includeReference=true` returns Q admin entries separately

---

## Dependency Graph

```
Phase 0 (Dark Mode + DataTable) ← foundation
  ├── Phase 1 (Auth Hardening) ← depends on 0 for dark mode on new pages
  │     └── Phase 2 (Users & Audit) ← depends on 1A for password change
  ├── Phase 3 (Scoping & Feedback) ← depends on 0 for DataTable
  ├── Phase 4 (Surveys) ← depends on 0, uses shared types
  ├── Phase 5 (Q Admin Tenant + aria-labels) ← runs alongside/after each phase as pages are built
  └── Phase 6 (Testing) ← depends on all
```

Phases 1, 3, and 4 are largely independent after Phase 0 and can be parallelized. Phase 5 (aria-labels + Q admin data updates) is done incrementally as each new page is built.

---

## New Files Summary

**Backend (8 new):** `routes/passwordReset.ts`, `routes/sso.ts`, `routes/twoFactor.ts`, `routes/featureRequests.ts`, `routes/surveys.ts`, `routes/auditLogs.ts`, `middleware/audit.ts`

**Dashboard (15 new):** `components/ThemeProvider.tsx`, `components/ThemeToggle.tsx`, `components/DataTable.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/change-password/page.tsx`, `app/settings/profile/page.tsx`, `app/settings/security/page.tsx`, `app/settings/sso/page.tsx`, `app/audit-logs/page.tsx`, `app/feature-requests/page.tsx`, `app/surveys/page.tsx`, `app/surveys/new/page.tsx`, `app/surveys/[id]/page.tsx`, `app/surveys/[id]/results/page.tsx`

**SDK (1 new):** `src/survey.ts`

**Modified key files:** `shared/src/index.ts`, `backend/src/db/store.ts`, `backend/src/db/schema.ts`, `backend/src/db/inMemoryStore.ts`, `backend/src/db/sqliteStore.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/events.ts`, `backend/src/middleware/auth.ts`, `dashboard/tailwind.config.ts`, `dashboard/src/app/globals.css`, `dashboard/src/app/layout.tsx`, `dashboard/src/middleware.ts`, `dashboard/src/app/login/page.tsx`, `dashboard/src/components/SettingsNav.tsx`, `dashboard/src/lib/api.ts`, `sdk/src/actor.ts`, `sdk/src/index.ts`

---

## Verification

1. **Dark mode:** Toggle theme → all pages render correctly in both modes, no FOUC on refresh
2. **DataTable:** Map editor shows pagination, column filters, search. Same for workflows, team, etc.
3. **Auth:** Register → forgot password → reset → login → 2FA setup → logout → login with TOTP → Google SSO login
4. **User profile:** Change avatar, update name, change password, view recovery codes
5. **Audit:** Perform various admin actions → verify entries appear in audit log page with correct details
6. **Map scoping:** Login as regular tenant → see only own entries. Toggle reference → see Q admin entries (read-only)
7. **Feature requests:** Submit request → detect duplicate → vote → admin changes status
8. **Surveys:** Create survey → trigger after frustration event → SDK renders survey panel → submit → view results in dashboard
9. **Tests:** `npx vitest run` — all existing + new tests pass
