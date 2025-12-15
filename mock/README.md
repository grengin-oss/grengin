# Grengin Mock API Server

Standalone mock API server for frontend development. Provides realistic API responses with in-memory state.

**API Version: 1.1.0** (OpenAPI 3.2.0)

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
├── routes/               # Route handlers by domain
│   ├── admin.ts          # Admin management endpoints
│   ├── auth.ts           # Authentication & SSO
│   ├── chat.ts           # Chat conversations & streaming
│   ├── files.ts          # File management
│   ├── health.ts         # Health check
│   ├── models.ts         # AI model listing
│   ├── settings.ts       # User settings
│   └── user.ts           # User profile
├── lib/                  # Shared utilities
│   ├── middleware.ts     # Auth middleware
│   └── store.ts          # In-memory stores & seed data
├── examples/             # Example API response data (JSON)
│   ├── admin/            # Admin endpoint examples
│   ├── analytics/        # Analytics endpoint examples
│   ├── audit/            # Audit log examples
│   ├── auth/             # Auth endpoint examples
│   ├── chat/             # Chat endpoint examples
│   ├── models/           # Models endpoint examples
│   └── user/             # User endpoint examples
└── types/
    └── api.ts            # Generated from OpenAPI spec
```

## API Endpoints

### Health (No Auth)
- `GET /health` - Health check with service status

### Authentication (No Auth / Token-Based)

#### Authentication
- `POST /auth/login` - Password login
- `GET /auth/{provider}` - Initiate SSO (google, azure, keycloak)
- `GET /auth/{provider}/callback` - OAuth callback (GET)
- `POST /auth/{provider}/callback` - OAuth callback (POST)
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (requires auth)

### User (Requires Auth)
- `GET /me` - Get current user

### Chat (Requires Auth)
- `GET /chat` - List conversations
- `GET /chat/search` - Search conversations
- `GET /chat/{chat_id}` - Get conversation with messages
- `PUT /chat/{chat_id}` - Update conversation (title, archived)
- `DELETE /chat/{chat_id}` - Delete conversation
- `POST /chat/stream` - Stream chat response (SSE)

### Files (Requires Auth)
- `GET /files` - List files (paginated, sorted)
- `POST /files` - Create file record
- `GET /files/{file_id}` - Get file details
- `DELETE /files/{file_id}` - Delete file

### Settings (Requires Auth)
- `GET /settings` - Get user settings
- `PUT /settings` - Update user settings

### Models (No Auth)
- `GET /models` - List available AI models by provider

### Admin (Requires Auth)

#### AI Engines
- `GET /admin/ai-engines` - List AI engines
- `GET /admin/ai-engines/{engine_key}` - Get engine details
- `PUT /admin/ai-engines/{engine_key}` - Update engine config
- `POST /admin/ai-engines/{engine_key}/validate` - Validate API key
- `GET /admin/ai-engines/{engine_key}/models` - List available models
- `DELETE /admin/ai-engines/{engine_key}/api-key` - Remove API key

## Authentication

Mock server accepts any Bearer token. Use the login endpoint to get a mock token:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@grengin.com", "password": "Demo123456!@"}'
```

### Demo Credentials
- **Admin**: `admin@grengin.com` / `Demo123456!@`

## SSE Streaming Events

The `/chat/stream` endpoint returns Server-Sent Events with these event types:

- **chunk** - Text content chunks as they're generated
- **done** - Stream completion with conversation ID

## Notes

- Data persists in memory during server runtime
- Server restart resets all data
- CORS is enabled for all origins
- Authentication is permissive (any Bearer token works)
