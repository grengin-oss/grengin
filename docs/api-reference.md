# API Reference

This document describes the API endpoints for the Grengin installer and the main Grengin API.

## Installer API

The installer exposes a REST API on port 9000 during the setup process.

### Base URL

```
http://server-ip:9000/api
```

### Endpoints

#### GET /api/status

Returns the current installation status and system information.

**Response**:
```json
{
  "currentStep": 1,
  "steps": [
    { "id": 1, "name": "system", "status": "completed" },
    { "id": 2, "name": "database", "status": "in_progress" },
    { "id": 3, "name": "domain", "status": "pending" },
    { "id": 4, "name": "oauth", "status": "pending" },
    { "id": 5, "name": "ai", "status": "pending" },
    { "id": 6, "name": "finalize", "status": "pending" }
  ],
  "system": {
    "os": "almalinux",
    "osVersion": "9.3",
    "arch": "x86_64",
    "platform": "rhel",
    "isRoot": true,
    "ramMb": 4096,
    "diskGb": 50
  }
}
```

---

#### POST /api/system/check

Performs system requirement checks.

**Response**:
```json
{
  "checks": [
    { "name": "os_supported", "passed": true, "message": "AlmaLinux 9.3 detected" },
    { "name": "root_access", "passed": true, "message": "Running as root" },
    { "name": "port_80", "passed": true, "message": "Port 80 available" },
    { "name": "port_443", "passed": true, "message": "Port 443 available" },
    { "name": "port_8080", "passed": true, "message": "Port 8080 available" },
    { "name": "ram", "passed": true, "message": "4 GB RAM available" },
    { "name": "disk", "passed": true, "message": "50 GB disk space available" }
  ],
  "platform": "rhel",
  "canProceed": true
}
```

---

#### POST /api/system/install

Installs system dependencies (Nginx, Certbot).

**Response**:
```json
{
  "success": true,
  "installed": ["nginx", "certbot"],
  "message": "Dependencies installed successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Failed to install nginx",
  "details": "Package not found in repository"
}
```

---

#### POST /api/database/test

Tests database connection.

**Request**:
```json
{
  "mode": "external",
  "host": "db.example.com",
  "port": 5432,
  "database": "grengin",
  "username": "grengin",
  "password": "password"
}
```

**Response**:
```json
{
  "success": true,
  "version": "PostgreSQL 16.1",
  "message": "Connection successful"
}
```

---

#### POST /api/database/create

Creates a local PostgreSQL database.

**Request**:
```json
{
  "mode": "local"
}
```

**Response**:
```json
{
  "success": true,
  "connectionString": "postgres://grengin:generated-password@localhost:5432/grengin",
  "message": "PostgreSQL installed and configured"
}
```

---

#### POST /api/domain/validate

Validates domain DNS configuration.

**Request**:
```json
{
  "domain": "chat.example.com"
}
```

**Response**:
```json
{
  "valid": true,
  "domain": "chat.example.com",
  "resolvedIp": "203.0.113.42",
  "serverIp": "203.0.113.42",
  "match": true
}
```

---

#### POST /api/ssl/setup

Obtains SSL certificate.

**Request**:
```json
{
  "domain": "chat.example.com",
  "email": "admin@example.com",
  "mode": "letsencrypt"
}
```

**Modes**: `letsencrypt`, `selfsigned`, `none`

**Response**:
```json
{
  "success": true,
  "mode": "letsencrypt",
  "certificate": "/etc/letsencrypt/live/chat.example.com/fullchain.pem",
  "privateKey": "/etc/letsencrypt/live/chat.example.com/privkey.pem",
  "expiresAt": "2025-03-30T00:00:00Z"
}
```

---

#### POST /api/config/save

Saves OAuth and AI provider configuration.

**Request**:
```json
{
  "oauth": {
    "google": {
      "clientId": "xxx.apps.googleusercontent.com",
      "clientSecret": "GOCSPX-xxx"
    },
    "azure": {
      "tenantId": "common",
      "clientId": "xxx-xxx-xxx",
      "clientSecret": "xxx"
    }
  },
  "ai": {
    "openai": {
      "apiKey": "sk-xxx"
    },
    "anthropic": {
      "apiKey": "sk-ant-xxx"
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration saved"
}
```

---

#### POST /api/finalize

Performs final installation steps.

**Request**:
```json
{
  "domain": "chat.example.com",
  "sslMode": "letsencrypt"
}
```

**Response** (streamed via SSE):
```
event: progress
data: {"step": "secrets", "status": "completed", "message": "Generated secrets"}

event: progress
data: {"step": "download_api", "status": "in_progress", "message": "Downloading API binary..."}

event: progress
data: {"step": "download_api", "status": "completed", "message": "Downloaded grengin-api"}

event: progress
data: {"step": "download_webapp", "status": "completed", "message": "Downloaded webapp files"}

event: progress
data: {"step": "config", "status": "completed", "message": "Generated configuration files"}

event: progress
data: {"step": "deploy", "status": "completed", "message": "Deployed files to system"}

event: progress
data: {"step": "migrations", "status": "completed", "message": "Database migrations complete"}

event: progress
data: {"step": "services", "status": "completed", "message": "Services started"}

event: progress
data: {"step": "healthcheck", "status": "completed", "message": "Health check passed"}

event: complete
data: {"success": true, "url": "https://chat.example.com"}
```

---

#### GET /api/logs

Streams installation logs via Server-Sent Events.

**Response** (SSE stream):
```
event: log
data: {"level": "info", "message": "Installing nginx...", "timestamp": "2025-01-15T10:30:00Z"}

event: log
data: {"level": "info", "message": "nginx installed successfully", "timestamp": "2025-01-15T10:30:15Z"}

event: log
data: {"level": "info", "message": "Configuring certbot...", "timestamp": "2025-01-15T10:30:16Z"}
```

---

## Main Grengin API

After installation, the Grengin API runs on port 8080 (internal, proxied via Nginx).

### Base URL

```
https://your-domain.com/api
```

### Authentication

Most endpoints require JWT authentication:

```
Authorization: Bearer <jwt-token>
```

### Health Check

#### GET /api/health

**Response**:
```json
{
  "status": "healthy",
  "version": "0.1.91",
  "database": "connected"
}
```

---

### Authentication Endpoints

#### GET /api/auth/google

Initiates Google OAuth flow. Redirects to Google.

#### GET /api/auth/google/callback

Handles Google OAuth callback. Returns JWT token.

#### GET /api/auth/azure

Initiates Azure AD OAuth flow. Redirects to Microsoft.

#### GET /api/auth/azure/callback

Handles Azure AD OAuth callback. Returns JWT token.

#### GET /api/auth/me

Returns current user information.

**Response**:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "organizationId": "uuid",
  "isAdmin": true,
  "createdAt": "2025-01-15T10:00:00Z"
}
```

---

### Chat Endpoints

#### GET /api/chats

Lists user's conversations.

**Query Parameters**:
- `limit` - Number of results (default: 20)
- `offset` - Pagination offset

**Response**:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Chat about Rust",
      "model": "gpt-4o",
      "messageCount": 5,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T11:00:00Z"
    }
  ],
  "total": 42
}
```

---

#### POST /api/chats

Creates a new conversation.

**Request**:
```json
{
  "title": "New Chat",
  "model": "gpt-4o",
  "systemPrompt": "You are a helpful assistant."
}
```

**Response**:
```json
{
  "id": "uuid",
  "title": "New Chat",
  "model": "gpt-4o",
  "systemPrompt": "You are a helpful assistant.",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

---

#### GET /api/chats/:id

Gets conversation details with messages.

**Response**:
```json
{
  "id": "uuid",
  "title": "Chat about Rust",
  "model": "gpt-4o",
  "systemPrompt": "You are a helpful assistant.",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is Rust?",
      "createdAt": "2025-01-15T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Rust is a systems programming language...",
      "model": "gpt-4o",
      "tokens": 150,
      "createdAt": "2025-01-15T10:00:05Z"
    }
  ]
}
```

---

#### POST /api/chats/:id/messages

Sends a message and streams the response.

**Request**:
```json
{
  "content": "Explain async/await in Rust",
  "model": "gpt-4o"
}
```

**Response** (SSE stream):
```
event: message
data: {"type": "start", "messageId": "uuid"}

event: message
data: {"type": "delta", "content": "Async"}

event: message
data: {"type": "delta", "content": "/await"}

event: message
data: {"type": "delta", "content": " in Rust..."}

event: message
data: {"type": "end", "tokens": 250}
```

---

#### DELETE /api/chats/:id

Deletes a conversation.

**Response**:
```json
{
  "success": true
}
```

---

### File Endpoints

#### POST /api/files/upload

Uploads a file.

**Request**: `multipart/form-data`
- `file` - The file to upload
- `conversationId` - Associated conversation (optional)

**Response**:
```json
{
  "id": "uuid",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "size": 102400,
  "url": "/api/files/uuid",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

---

#### GET /api/files/:id

Downloads a file.

---

### Admin Endpoints

Requires admin role.

#### GET /api/admin/users

Lists all users.

**Response**:
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "organizationId": "uuid",
      "isAdmin": false,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 10
}
```

---

#### GET /api/admin/ai-engines

Lists configured AI engines.

**Response**:
```json
{
  "engines": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "displayName": "OpenAI",
      "engineKey": "openai",
      "isEnabled": true,
      "apiKeyStatus": "configured",
      "defaultModel": "gpt-4o",
      "whitelistModels": ["gpt-4o", "gpt-4o-mini"]
    }
  ]
}
```

---

#### POST /api/admin/ai-engines

Configures an AI engine.

**Request**:
```json
{
  "organizationId": "uuid",
  "displayName": "OpenAI Production",
  "engineKey": "openai",
  "apiKey": "sk-xxx",
  "defaultModel": "gpt-4o",
  "whitelistModels": ["gpt-4o", "gpt-4o-mini"]
}
```

**Response**:
```json
{
  "id": "uuid",
  "displayName": "OpenAI Production",
  "engineKey": "openai",
  "apiKeyStatus": "configured",
  "message": "AI engine configured successfully"
}
```

---

#### GET /api/admin/organizations

Lists organizations.

---

#### POST /api/admin/organizations

Creates an organization.

---

### Error Responses

All endpoints return errors in this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

**Common Error Codes**:
- `UNAUTHORIZED` - Missing or invalid authentication
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `INTERNAL_ERROR` - Server error

---

## Rate Limiting

The API implements rate limiting:

- **Authentication endpoints**: 10 requests/minute
- **Chat endpoints**: 60 requests/minute
- **File uploads**: 20 requests/minute
- **Admin endpoints**: 100 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705312800
```

---

## Related Documentation

- [Architecture](architecture.md) - System overview
- [Configuration](configuration.md) - Environment variables
- [Development](development.md) - Building and testing
