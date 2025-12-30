# Architecture

This document describes the system architecture of Grengin and how components interact.

## Overview

Grengin consists of three main components:

```
┌──────────────────────────────────────────────────────────────────┐
│                         Target Server                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      Nginx (:443/:80)                      │ │
│  │  ├── SSL termination (Let's Encrypt)                       │ │
│  │  ├── /api/* → grengin-api:8080                             │ │
│  │  └── /* → /var/www/grengin (static files)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│              ┌───────────────┴───────────────┐                  │
│              ▼                               ▼                  │
│  ┌─────────────────────┐       ┌─────────────────────────────┐ │
│  │   grengin-api       │       │        Webapp               │ │
│  │   (Rust/Axum)       │       │     (Svelte 5 SPA)          │ │
│  │   Port: 8080        │       │     Static files            │ │
│  └──────────┬──────────┘       └─────────────────────────────┘ │
│             │                                                   │
│             ▼                                                   │
│  ┌─────────────────────┐                                       │
│  │    PostgreSQL       │                                       │
│  │    Port: 5432       │                                       │
│  └─────────────────────┘                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Nginx (Reverse Proxy)

**Purpose**: SSL termination, static file serving, and reverse proxy

**Responsibilities**:
- Terminates SSL/TLS connections
- Serves webapp static files directly
- Proxies `/api/*` requests to grengin-api
- Handles HTTP to HTTPS redirects
- Manages Let's Encrypt certificate renewal

**Configuration Location**: `/etc/nginx/sites-available/grengin`

### 2. grengin-api (Backend)

**Purpose**: REST API server for all business logic

**Technology Stack**:
- **Language**: Rust (Edition 2024)
- **Framework**: Axum 0.8
- **ORM**: SeaORM with PostgreSQL
- **Auth**: JWT tokens, OAuth2/OIDC (Google, Azure)

**Key Features**:
- Multi-organization support
- User management with SSO
- Chat/conversation management
- File upload and storage
- LLM provider integration (OpenAI, Anthropic)
- API key encryption (AES-256-GCM)
- Swagger/OpenAPI documentation

**API Endpoints** (partial list):
```
POST /api/auth/google          # Google OAuth
POST /api/auth/azure           # Azure OAuth
GET  /api/chats                # List conversations
POST /api/chats                # Create conversation
POST /api/chats/:id/messages   # Send message (streaming)
GET  /api/admin/users          # Admin: list users
GET  /api/admin/ai-engines     # Admin: list AI providers
POST /api/admin/ai-engines     # Admin: configure AI provider
```

**Directory Structure**:
```
service/
├── src/
│   ├── main.rs           # Entry point
│   ├── app.rs            # Axum app setup
│   ├── config/           # Configuration loading
│   ├── routes/           # API route definitions
│   ├── handlers/         # Request handlers
│   ├── models/           # Database models (SeaORM)
│   ├── dto/              # Data transfer objects
│   ├── llm/              # LLM provider integrations
│   └── auth/             # Authentication logic
└── migration/            # Database migrations
```

### 3. Webapp (Frontend)

**Purpose**: Single-page application for user interface

**Technology Stack**:
- **Framework**: Svelte 5
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: CSS (with Tailwind-like utilities)

**Key Features**:
- Real-time chat interface with streaming
- Markdown rendering with syntax highlighting
- File upload support
- Multi-language support (i18n)
- Admin dashboard
- Responsive design

**Directory Structure**:
```
webapp/
├── src/
│   ├── main.ts           # Entry point
│   ├── App.svelte        # Root component
│   ├── lib/
│   │   ├── api/          # API client
│   │   ├── components/   # Reusable components
│   │   ├── features/     # Feature modules
│   │   ├── routes/       # Page components
│   │   └── i18n/         # Translations
│   └── assets/           # Static assets
└── public/               # Public files
```

### 4. PostgreSQL (Database)

**Purpose**: Persistent data storage

**Version**: PostgreSQL 16+

**Key Tables**:
- `organizations` - Multi-tenant organization data
- `users` - User accounts with OAuth IDs
- `ai_engines` - AI provider configurations (encrypted)
- `conversations` - Chat sessions
- `messages` - Individual messages
- `files` - Uploaded file metadata
- `prompt_templates` - Reusable prompts

**Data Encryption**:
- API keys in `ai_engines` table encrypted with AES-256-GCM
- Encryption key stored in `APP_KEY` environment variable
- Nonce + ciphertext stored as Base64

## Installer Architecture

The installer is a separate Rust binary that runs during initial setup. It serves on the **same ports (80/443)** where the final application will run, enabling a seamless transition.

### Same-URL Installation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Installation Timeline                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: HTTP Installer                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  grengin-installer on :80 (via nginx proxy to :9000)       │ │
│  │  User accesses: http://server-ip or http://domain          │ │
│  │                                                            │ │
│  │  Steps: System Check → Database → Domain/SSL               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  Phase 2: HTTPS Installer (after SSL obtained)                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Nginx updated with SSL certs, still proxies to installer  │ │
│  │  User redirected to: https://domain                        │ │
│  │                                                            │ │
│  │  Steps: OAuth (optional) → AI Keys (optional) → Finalize   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  Phase 3: Production (installer exits, nginx reconfigured)      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Nginx config swapped: now serves webapp + proxies API     │ │
│  │  Same URL: https://domain → Application                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Nginx Configuration Swap

The key to seamless transition is swapping nginx configuration:

**During Installation**:
```nginx
# Proxy all traffic to installer backend
location / {
    proxy_pass http://127.0.0.1:9000;
}
```

**After Installation**:
```nginx
# Serve webapp static files
location / {
    root /var/www/grengin;
    try_files $uri $uri/ /index.html;
}

# Proxy API requests to backend
location /api/ {
    proxy_pass http://127.0.0.1:8080;
}
```

The SSL certificate configuration remains unchanged during the swap.

**Installer Features**:
- Web-based wizard UI (embedded static files)
- Platform detection (RHEL, Debian, Docker)
- Package manager integration (dnf, apt)
- PostgreSQL setup (local or external)
- SSL certificate acquisition (Certbot)
- Configuration file generation (Tera templates)
- Binary download and deployment
- Systemd service creation
- Health checks and validation

See [Wizard Steps](wizard-steps.md) for detailed installation flow.

## Data Flow

### Authentication Flow

```
1. User clicks "Sign in with Google"
2. Frontend redirects to /api/auth/google
3. Backend generates OAuth state, redirects to Google
4. User authenticates with Google
5. Google redirects back with code
6. Backend exchanges code for tokens
7. Backend creates/updates user, generates JWT
8. Frontend receives JWT, stores in localStorage
9. Subsequent requests include JWT in Authorization header
```

### Chat Message Flow

```
1. User types message in frontend
2. Frontend POSTs to /api/chats/:id/messages
3. Backend validates JWT, checks organization
4. Backend looks up AI engine configuration
5. Backend decrypts API key from database
6. Backend streams request to LLM provider
7. LLM response streamed back via SSE
8. Frontend renders markdown in real-time
9. Message saved to database when complete
```

### AI Provider Configuration Flow

```
1. Admin enters API key in admin dashboard
2. Frontend POSTs to /api/admin/ai-engines
3. Backend generates random nonce (12 bytes)
4. Backend encrypts key with AES-256-GCM using APP_KEY
5. Nonce + ciphertext stored as Base64 in database
6. On use: decrypt with same APP_KEY
```

## Security Architecture

### Network Security

```
Internet ──► Firewall ──► Nginx (:443) ──► Internal Services
                │
                └─► Only ports 22, 80, 443 exposed
```

### Encryption at Rest

- **Database**: Standard PostgreSQL encryption options
- **API Keys**: AES-256-GCM with unique nonce per key
- **Secrets**: Generated using cryptographically secure random

### Authentication

- **JWT Tokens**: RS256 signed, configurable expiration
- **OAuth2/OIDC**: Google and Azure AD support
- **Session Management**: Stateless JWT-based

## Scaling Considerations

### Horizontal Scaling

The architecture supports horizontal scaling:

```
                    Load Balancer
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ api-1    │  │ api-2    │  │ api-3    │
      └────┬─────┘  └────┬─────┘  └────┬─────┘
           │             │             │
           └─────────────┼─────────────┘
                         ▼
                   ┌──────────┐
                   │PostgreSQL│
                   │ (Primary)│
                   └──────────┘
```

**Requirements for scaling**:
- Shared PostgreSQL database
- Shared file storage (NFS, S3, etc.)
- Same `APP_KEY` and `JWT_SECRET` across instances
- Sticky sessions not required (stateless JWT)

### Vertical Scaling

Single-server deployments can scale vertically:
- Increase RAM for database caching
- More CPU cores for concurrent requests
- SSD storage for database performance

## Related Documentation

- [Deployment Modes](deployment-modes.md) - Native vs Docker deployment
- [Configuration](configuration.md) - Environment variables
- [Development](development.md) - Building from source
