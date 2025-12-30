# Configuration

This document describes all configuration options for Grengin, including environment variables, file locations, and runtime settings.

## Overview

Grengin uses environment variables for configuration. The installer automatically generates these files with proper values.

### Backend vs Frontend Configuration

| Component | Config File | When Applied |
|-----------|-------------|--------------|
| Backend (grengin-api) | `/etc/grengin/.env` | Runtime (read on startup) |
| Frontend (webapp) | `.env` during build | Build-time (embedded in dist) |

**Important**: The frontend's `VITE_API_BASE` is set to empty (`""`) so it uses relative `/api/*` paths. Nginx proxies these to the backend. This means:
- No hardcoded URLs in the frontend
- No CORS configuration needed
- Works seamlessly with any domain

## Environment Variables

All backend configuration is done via environment variables, stored in `/etc/grengin/.env` (native) or `.env` file (Docker).

### Required Variables

These variables must be set for Grengin to start:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for signing JWT tokens | 64-character hex string |
| `APP_KEY` | Encryption key for API keys at rest | Base64-encoded 32 bytes |
| `REDIRECT_URL` | Frontend URL for OAuth callbacks | `https://chat.example.com` |

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | Listen port | `8080` |

### OAuth Providers

At least one OAuth provider should be configured for users to sign in.

#### Google OAuth

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret | Yes |

**Callback URL**: `{REDIRECT_URL}/auth/google/callback`

#### Azure AD OAuth

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_TENANT_ID` | Directory (tenant) ID | Yes |
| `AZURE_CLIENT_ID` | Application (client) ID | Yes |
| `AZURE_CLIENT_SECRET` | Client secret value | Yes |

**Tenant ID Options**:
- Specific tenant: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Any Azure AD: `common`
- Work/school accounts: `organizations`
- Personal accounts: `consumers`

**Callback URL**: `{REDIRECT_URL}/auth/azure/callback`

### AI Providers

AI provider keys can be set globally via environment variables or per-organization via the admin panel.

#### OpenAI

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key (starts with `sk-`) | - |
| `OPENAI_ORG_ID` | Organization ID | - |
| `OPENAI_PROJECT_ID` | Project ID | - |
| `OPENAI_TIMEOUT_MS` | Request timeout | `60000` |
| `OPENAI_MAX_TRIES` | Max retry attempts | `1` |

#### Anthropic

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key (starts with `sk-ant-`) | - |

---

## Secret Generation

The installer automatically generates required secrets. If you need to generate them manually:

### JWT_SECRET

64-character hexadecimal string:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using /dev/urandom
head -c 32 /dev/urandom | xxd -p -c 64
```

### APP_KEY

Base64-encoded 32-byte key for AES-256-GCM:

```bash
# Using OpenSSL
openssl rand -base64 32

# Using /dev/urandom
head -c 32 /dev/urandom | base64
```

**Important**: The decoded key must be exactly 32 bytes. Some Base64 strings decode to more due to padding.

### Database Password

Secure random password:

```bash
openssl rand -base64 24
```

---

## Configuration File Template

**Complete `.env` file**:

```bash
# =============================================================================
# GRENGIN CONFIGURATION
# =============================================================================

# -----------------------------------------------------------------------------
# Core Settings (Required)
# -----------------------------------------------------------------------------

# PostgreSQL connection string
# Format: postgres://user:password@host:port/database
DATABASE_URL=postgres://grengin:your-secure-password@localhost:5432/grengin

# JWT signing secret (64 hex characters)
# Generate: openssl rand -hex 32
JWT_SECRET=your-64-character-hex-string-here

# Encryption key for API keys at rest (Base64, decodes to 32 bytes)
# Generate: openssl rand -base64 32
APP_KEY=your-base64-encoded-32-byte-key

# Frontend URL (used for OAuth callbacks)
REDIRECT_URL=https://chat.example.com

# -----------------------------------------------------------------------------
# Server Settings (Optional)
# -----------------------------------------------------------------------------

# Bind address (default: 0.0.0.0)
HOST=0.0.0.0

# Listen port (default: 8080)
PORT=8080

# -----------------------------------------------------------------------------
# Google OAuth (Optional)
# -----------------------------------------------------------------------------

# OAuth 2.0 credentials from Google Cloud Console
# Callback URL: {REDIRECT_URL}/auth/google/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# -----------------------------------------------------------------------------
# Azure AD OAuth (Optional)
# -----------------------------------------------------------------------------

# App registration from Azure Portal
# Callback URL: {REDIRECT_URL}/auth/azure/callback
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# -----------------------------------------------------------------------------
# AI Providers (Optional - can be configured per-org in admin)
# -----------------------------------------------------------------------------

# OpenAI
OPENAI_API_KEY=
OPENAI_ORG_ID=
OPENAI_PROJECT_ID=
OPENAI_TIMEOUT_MS=60000
OPENAI_MAX_TRIES=1

# Anthropic
ANTHROPIC_API_KEY=
```

---

## Database Configuration

### Connection String Format

```
postgres://username:password@hostname:port/database?options
```

**Examples**:

```bash
# Local PostgreSQL
DATABASE_URL=postgres://grengin:password@localhost:5432/grengin

# Remote PostgreSQL
DATABASE_URL=postgres://grengin:password@db.example.com:5432/grengin

# With SSL
DATABASE_URL=postgres://grengin:password@db.example.com:5432/grengin?sslmode=require

# AWS RDS
DATABASE_URL=postgres://grengin:password@instance.region.rds.amazonaws.com:5432/grengin?sslmode=require
```

### SSL Modes

| Mode | Description |
|------|-------------|
| `disable` | No SSL |
| `allow` | Try SSL, fall back to non-SSL |
| `prefer` | Try SSL, fall back to non-SSL (default) |
| `require` | Require SSL, no verification |
| `verify-ca` | Require SSL, verify CA |
| `verify-full` | Require SSL, verify CA and hostname |

### Connection Pool Settings

SeaORM uses connection pooling by default. Configure via connection string:

```bash
# Max connections
DATABASE_URL=postgres://...?max_connections=10

# Connection timeout
DATABASE_URL=postgres://...?connect_timeout=30
```

---

## Nginx Configuration

### SSL Parameters

**File**: `/etc/nginx/snippets/ssl-params.conf`

```nginx
# Modern TLS configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

# SSL session settings
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;

# HSTS (optional, uncomment if you're sure)
# add_header Strict-Transport-Security "max-age=63072000" always;
```

### Proxy Parameters

**File**: `/etc/nginx/snippets/proxy-params.conf`

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_cache_bypass $http_upgrade;
```

---

## Systemd Service Configuration

**File**: `/etc/systemd/system/grengin.service`

```ini
[Unit]
Description=Grengin API Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=grengin
Group=grengin
WorkingDirectory=/opt/grengin
EnvironmentFile=/etc/grengin/.env
ExecStart=/opt/grengin/grengin-api
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Resource limits
LimitNOFILE=65535
MemoryMax=2G

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/grengin /var/log/grengin
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

[Install]
WantedBy=multi-user.target
```

### Adjusting Resource Limits

```ini
# Increase file descriptors
LimitNOFILE=65535

# Limit memory usage
MemoryMax=2G
MemoryHigh=1.5G

# Limit CPU
CPUQuota=200%  # 2 cores max
```

---

## Runtime Configuration

Some settings can be changed without restarting the service.

### Per-Organization AI Configuration

Configure AI providers per organization via the admin panel:

1. Navigate to Admin → AI Engines
2. Add new engine for organization
3. Enter API key (encrypted automatically)
4. Select enabled models

### User Management

- First user to sign in becomes admin
- Admins can promote other users
- Organization membership managed via admin panel

---

## Environment-Specific Configuration

### Development

```bash
# .env.development
DATABASE_URL=postgres://grengin:grengin@localhost:5432/grengin_dev
JWT_SECRET=dev-jwt-secret-not-for-production
APP_KEY=dev-app-key-not-for-production-use
REDIRECT_URL=http://localhost:3000
HOST=127.0.0.1
PORT=8080
```

### Staging

```bash
# .env.staging
DATABASE_URL=postgres://grengin:password@staging-db:5432/grengin
JWT_SECRET=staging-secret-change-for-production
APP_KEY=staging-key-change-for-production
REDIRECT_URL=https://staging.grengin.example.com
```

### Production

```bash
# .env.production
DATABASE_URL=postgres://grengin:strong-password@prod-db:5432/grengin?sslmode=require
JWT_SECRET=cryptographically-secure-64-hex-chars
APP_KEY=cryptographically-secure-base64-key
REDIRECT_URL=https://chat.example.com
```

---

## Troubleshooting Configuration

### Validate Environment

```bash
# Check required variables are set
grep -E '^(DATABASE_URL|JWT_SECRET|APP_KEY|REDIRECT_URL)=' /etc/grengin/.env

# Test database connection
psql "$DATABASE_URL" -c "SELECT 1"

# Verify APP_KEY length (should be ~44 chars for 32 bytes Base64)
grep APP_KEY /etc/grengin/.env | cut -d= -f2 | wc -c
```

### Common Issues

**"Invalid APP_KEY"**:
- Ensure APP_KEY is valid Base64
- Decoded length must be exactly 32 bytes
- Regenerate: `openssl rand -base64 32`

**"Database connection failed"**:
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Test connection with psql
- Check firewall allows connection

**"OAuth callback failed"**:
- Verify REDIRECT_URL matches OAuth provider config
- Ensure callback URL is correctly registered
- Check for trailing slashes

---

## Related Documentation

- [Architecture](architecture.md) - System overview
- [Deployment Modes](deployment-modes.md) - Native vs Docker
- [Wizard Steps](wizard-steps.md) - Installation process
