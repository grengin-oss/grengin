# Grengin Mock API Server

Standalone mock API server for frontend development. Provides realistic API responses with in-memory state.

**API Version: 1.0.0** (OpenAPI 3.2.0)

## Usage

### Start Mock Server

```bash
# From webapp root
pnpm mock:dev
# Server runs on http://localhost:3000
```

### Regenerate Types

After updating the API spec in the `api/` submodule:

```bash
pnpm mock:generate-types
```

> Note: The API uses OpenAPI 3.2.0 which may not be fully supported by openapi-typescript yet.

## Features

- **Stateful**: In-memory data persists during server runtime
- **SSE Streaming**: Real `/chat/stream` endpoint with streaming responses
- **Realistic Data**: Uses Faker.js for realistic mock data
- **CORS Enabled**: Ready for cross-origin frontend development
- **Hot Reload**: Fast iteration with tsx

## Structure

```
mock/
├── server.ts             # Express server entry point
├── handlers.ts           # Handler exports for MSW
├── index.ts              # Module exports
├── examples/             # Example API response data (JSON)
│   ├── admin/            # Admin endpoint examples
│   ├── analytics/        # Analytics endpoint examples
│   ├── audit/            # Audit log examples
│   ├── auth/             # Auth endpoint examples
│   ├── chat/             # Chat endpoint examples
│   └── user/             # User endpoint examples
├── handlers/             # MSW handlers by domain
│   ├── admin.ts          # Admin management endpoints
│   ├── analytics.ts      # Usage analytics and costs
│   ├── audit.ts          # Audit log endpoints
│   ├── auth.ts           # Authentication & onboarding
│   ├── chat.ts           # Chat conversations
│   ├── files.ts          # File management
│   ├── health.ts         # Health check
│   ├── models.ts         # AI model listing
│   ├── settings.ts       # User settings
│   └── user.ts           # User profile
├── lib/                  # Shared utilities
│   ├── auth.ts           # Auth helpers
│   ├── constants.ts      # API base URL
│   └── index.ts          # Lib exports
└── types/
    └── api.ts            # Generated from OpenAPI spec
```

## API Endpoints

### Health (No Auth)
- `GET /health` - Health check with service status

### Authentication (No Auth / Token-Based)

#### Onboarding Flow
- `POST /onboarding/start` - Start onboarding session
- `GET /onboarding/status` - Get onboarding status (X-Onboarding-Token)
- `POST /onboarding/organization` - Set organization details
- `POST /onboarding/admin` - Create super admin
- `POST /onboarding/providers` - Configure LLM providers
- `POST /onboarding/providers/validate` - Validate API key
- `POST /onboarding/sso` - Configure SSO (or skip)
- `POST /onboarding/sso/test` - Test SSO configuration
- `POST /onboarding/complete` - Complete onboarding

#### Authentication
- `POST /auth/login` - Password login
- `GET /auth/{provider}` - Initiate SSO
- `GET /auth/{provider}/callback` - OAuth callback
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (requires auth)

#### MFA
- `POST /auth/mfa/setup` - Setup MFA (requires auth)
- `POST /auth/mfa/verify` - Verify MFA code
- `POST /auth/mfa/recovery` - Use recovery code
- `POST /auth/mfa/regenerate-codes` - Regenerate recovery codes (requires auth)

#### Password Management
- `POST /auth/password/forgot` - Request password reset
- `POST /auth/password/reset` - Reset password with token
- `POST /auth/password/change` - Change password (requires auth)

### User (Requires Auth)
- `GET /me` - Get current user
- `GET /me/rate-limit` - Rate limit status
- `GET /me/budget` - Budget status
- `GET /me/usage` - Usage summary (period: day/week/month)

### Chat (Requires Auth)
- `GET /chat` - List conversations (paginated, search, archived filter)
- `GET /chat/{chat_id}` - Get conversation with messages
- `PUT /chat/{chat_id}` - Update conversation (title, archived)
- `DELETE /chat/{chat_id}` - Delete conversation
- `POST /chat/stream` - Stream chat response (SSE)

### Files (Requires Auth)
- `GET /files` - List files (paginated, sorted, filtered)
- `POST /files` - Upload file (multipart/form-data)
- `GET /files/{file_id}` - Get file details
- `GET /files/{file_id}/download` - Download file content
- `DELETE /files/{file_id}` - Delete file

### Settings (Requires Auth)
- `GET /settings` - Get user settings
- `PUT /settings` - Update user settings

### Models (No Auth)
- `GET /models` - List available AI models by provider

### Admin (Requires Auth + Admin Role)

#### Dashboard
- `GET /admin/dashboard` - Admin dashboard overview

#### User Management
- `GET /admin/users` - List users (paginated, filtered)
- `POST /admin/users` - Create user
- `POST /admin/users/bulk` - Bulk import users
- `GET /admin/users/{user_id}` - Get user
- `PUT /admin/users/{user_id}` - Update user
- `DELETE /admin/users/{user_id}` - Deactivate user
- `GET /admin/users/{user_id}/usage` - Get user usage

#### Organization
- `GET /admin/organization` - Get organization settings
- `PUT /admin/organization` - Update organization

#### API Keys
- `GET /admin/api-keys` - List API keys
- `POST /admin/api-keys` - Create API key
- `GET /admin/api-keys/{key_id}` - Get API key
- `DELETE /admin/api-keys/{key_id}` - Delete API key
- `POST /admin/api-keys/{key_id}/validate` - Validate API key

#### SSO Providers
- `GET /admin/sso-providers` - List SSO providers
- `POST /admin/sso-providers` - Create SSO provider
- `GET /admin/sso-providers/{provider_id}` - Get SSO provider
- `PUT /admin/sso-providers/{provider_id}` - Update SSO provider
- `DELETE /admin/sso-providers/{provider_id}` - Delete SSO provider
- `POST /admin/sso-providers/{provider_id}/test` - Test SSO provider

#### Rate Limits
- `GET /admin/rate-limits` - List rate limits
- `POST /admin/rate-limits` - Create rate limit
- `GET /admin/rate-limits/{limit_id}` - Get rate limit
- `PUT /admin/rate-limits/{limit_id}` - Update rate limit
- `DELETE /admin/rate-limits/{limit_id}` - Delete rate limit

#### Budgets
- `GET /admin/budgets` - List budgets
- `POST /admin/budgets` - Create budget
- `GET /admin/budgets/{budget_id}` - Get budget
- `PUT /admin/budgets/{budget_id}` - Update budget
- `DELETE /admin/budgets/{budget_id}` - Delete budget

### Analytics (Requires Auth)
- `GET /analytics/costs` - Cost breakdown (start_date, end_date required)
- `GET /analytics/costs/export` - Export costs as CSV/JSON
- `GET /analytics/usage` - Usage statistics
- `GET /analytics/trends` - Cost trends over time

### Audit (Requires Auth)
- `GET /audit/logs` - List audit logs (paginated, filtered)
- `GET /audit/logs/export` - Export audit logs as CSV/JSON

## Using MSW Handlers in Tests

The handlers can also be used with MSW for in-browser mocking:

```typescript
import { setupWorker } from 'msw/browser'
import { handlers } from './mock/handlers'

export const worker = setupWorker(...handlers)
```

## Authentication

Mock server accepts any Bearer token. Use the login endpoint to get a mock token:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@grengin.com", "password": "Demo123456!@"}'
```

### Demo Credentials
- **Admin**: `admin@grengin.com` / `Demo123456!@`
- **MFA User**: `mfa@grengin.com` (any password) - returns MFA required

## SSE Streaming Events

The `/chat/stream` endpoint returns Server-Sent Events with these event types:

- **start** - Stream initialization with conversation ID
- **token** - Individual text tokens as they're generated
- **set_title** - Auto-generated conversation title
- **done** - Stream completion with message IDs
- **error** - Error occurred during streaming

## Notes

- Data persists in memory during server runtime
- Server restart resets all data
- CORS is enabled for all origins
- Authentication is permissive (any Bearer token works)
- Admin role is assumed for all authenticated requests
