<p align="center">
  <a href="https://grengin.com" target="_blank">
    <img src="https://raw.githubusercontent.com/grengin-oss/grengin-api/main/swagger-overrides/grengin-logo.svg" height="75%" width="75%">
  </a>
</p>

<p align="center">
  <a href="https://www.rust-lang.org"><img alt="Rust" src="https://img.shields.io/badge/Rust-%23000000.svg"></a>
  <a href="https://github.com/tokio-rs/axum"><img alt="Axum" src="https://img.shields.io/badge/Axum-red"></a>
  <a href="https://svelte.dev"><img alt="Svelte 5" src="https://img.shields.io/badge/Svelte_5-FF3E00?"></a>
  <a href="https://tauri.app"><img alt="Tauri" src="https://img.shields.io/badge/Tauri-FFC131?"></a>
  <a href="https://www.postgresql.org"><img alt="PostgreSQL" src="https://img.shields.io/badge/Postgres-%23316192.svg"></a>
  <a href="https://www.docker.com"><img alt="Docker" src="https://img.shields.io/badge/Docker-0DB7ED?"></a>
  <a href="https://github.com/orgs/grengin-oss/packages"><img alt="GHCR" src="https://img.shields.io/badge/GHCR-arm64%20%7C%20x86__64-8957e5?logo=github"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-SUL-informational" alt="License"></a>
  <a href="LICENSE_FAQ.md"><img src="https://img.shields.io/badge/license-FAQ-blue" alt="License FAQ"></a>
  <a href="https://github.com/grengin-oss/grengin/blob/main/LICENSE_ENTERPRISE.md"><img src="https://img.shields.io/badge/license-ENTERPRISE-blue" alt="Enterprise License"></a>
  <a href="CONTRIBUTOR_LICENSE.md"><img src="https://img.shields.io/badge/license-CONTRIBUTOR-blue" alt="Contributor License"></a>
</p>

Grengin is an **AI-native business growth engine** — a self-hosted platform that gives teams governed, multi-provider access to LLMs with enterprise-grade controls: department budgets, role-based permissions, MCP tool integrations, semantic search over conversation history, and a full admin dashboard. Deploy in seconds from a cloud marketplace image with pre-wired OAuth/SSO and LLM proxying, or run it anywhere with a one-line installer.

---

## What is Grengin?

Grengin lets organisations deploy their own AI chat platform without handing data to third-party SaaS. Administrators control which AI providers are enabled, who can access which models, how much budget each department consumes, and which MCP tool servers are available. End users get a clean, real-time chat interface with tool call visibility, a personal prompt library, web search, and file uploads.

### Key Capabilities

- **Multi-provider LLM routing** — OpenAI, Anthropic, Mistral, Gemini; swap or combine providers without changing the frontend
- **Department-scoped budgets** — daily/weekly/monthly token spend limits per organisational unit, with tree-structured hierarchy
- **Granular RBAC** — custom roles and permissions (e.g. `analytics:view`, `mcp:admin`, `ai-platform:manage`), assignable at org or department scope
- **MCP (Model Context Protocol)** — connect external tool servers over HTTP or stdio; per-tool access policies, OAuth flow for per-user authentication
- **RAG & semantic search** — embedding-based semantic search over conversation history using configurable providers and dimensions
- **Audit logs** — tamper-evident log of every administrative action, exportable for compliance
- **Analytics** — token usage over time by user, department, and model with Vega-Lite charts
- **SSO** — Google and Azure AD OAuth2/OIDC; domain allow-listing per provider
- **Branding** — custom logo, primary/accent colours, and font family settable from the admin panel
- **Desktop & mobile app** — Tauri-powered native app for Windows, macOS, and Linux; Android and iOS apps coming soon (minSdkVersion 24 / iOS 14+)
- **Multi-cloud marketplace** — pre-built AMIs and cloud images for AWS, GCP, Azure, and DigitalOcean with everything pre-installed

---

## Quick Start

### Option 1: Cloud Marketplace Image (Fastest)

Launch a pre-built image on your cloud of choice — PostgreSQL, Nginx, Certbot, and Grengin are already installed and configured. Just open your browser on first boot.

| Cloud | How to launch |
|-------|--------------|
| **AWS** | Find *Grengin* in [AWS Marketplace](https://aws.amazon.com/marketplace) — available for x86_64 and arm64 |
| **GCP** | Use image family `grengin` from project `almalinux-cloud` |
| **Azure** | Available in Azure Marketplace via `grenginMarketplaceGallery` |
| **DigitalOcean** | Coming soon on DigitalOcean Marketplace |

On first boot the installer wizard launches automatically at `http://your-ip`. Complete the 6-step wizard to configure your domain, SSL, OAuth, and AI providers — then the application goes live on the same URL.

> **Free custom subdomain**: Every Grengin instance qualifies for a free `*.grengin.io` subdomain. Claim yours during the wizard setup.

### Option 2: One-Line Installer (Any Linux)

```bash
curl -sSL https://get.grengin.io | sudo bash
```

Opens the web-based wizard on port 80. After SSL is issued mid-wizard, the application transitions seamlessly to HTTPS on the same domain.

### Option 3: Docker / Docker Compose

Images are published to **GitHub Container Registry** and support both **`linux/amd64`** and **`linux/arm64`**:

```bash
docker pull ghcr.io/grengin-oss/grengin-api:latest
docker pull ghcr.io/grengin-oss/webapp:latest
```

Or use Compose:

```bash
curl -sSL https://raw.githubusercontent.com/grengin-oss/grengin/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

### Option 4: Railway *(coming soon)*

One-click Railway template with pre-wired environment variables and managed PostgreSQL. No server management required.

---

## Container Images

All images are published to [GitHub Container Registry](https://github.com/orgs/grengin-oss/packages) with multi-arch manifests covering **`linux/amd64`** and **`linux/arm64`**.

| Image | Registry | Architectures |
|-------|----------|--------------|
| Backend API | `ghcr.io/grengin-oss/grengin-api` | amd64, arm64 |
| Frontend (nginx + static) | `ghcr.io/grengin-oss/webapp` | amd64, arm64 |
| Installer bundle | `ghcr.io/perter-tech/grengin-image` | amd64, arm64 |

Tags: `latest`, `v0.2.0`, `main-<sha>`, etc.

```bash
# Pin to a specific release
docker pull ghcr.io/grengin-oss/grengin-api:v0.2.0
```

---

## Cloud Marketplace Images

Grengin publishes pre-built machine images for every major cloud using [HashiCorp Packer](https://www.packer.io/). Every image is built on **AlmaLinux 9** and ships with all dependencies pre-installed so the installation wizard completes in under 2 minutes.

### What's included in every image

| Component | Details |
|-----------|---------|
| **OS** | AlmaLinux 9 (RHEL-compatible) |
| **PostgreSQL 16** | Installed with `pgvector` extension for semantic search |
| **Nginx** | Pre-configured to proxy port 80 → installer on first boot |
| **Certbot** | Python3 Nginx plugin for Let's Encrypt SSL |
| **Grengin API** | Binary extracted from `ghcr.io/grengin-oss/grengin-api` |
| **Installer + Webapp** | Pre-placed from `ghcr.io/perter-tech/grengin-image` |
| **Firewall** | `firewalld` open on SSH (22), HTTP (80), HTTPS (443) only |
| **SELinux** | Enforcing; `httpd_can_network_connect` enabled for Nginx proxy |
| **SSH hardening** | Password auth disabled, root login disabled |
| **First-boot service** | `grengin-installer.service` auto-starts the wizard on boot |

### AWS AMI

- Based on AlmaLinux OS 9 (official AMI owner `764336703387`)
- Backed by **gp3 EBS**, IMDSv2-only
- Built for both **`x86_64`** and **`arm64`** (Graviton)
- Available on **AWS Marketplace** and can be copied to additional regions

```
# t3.small (x86_64) or t4g.small (arm64) recommended minimum
# Launch → open http://<public-ip> → wizard auto-starts
```

### GCP Compute Image

- Source family: `almalinux-9` from `almalinux-cloud`
- Published to image family **`grengin`** in your GCP project
- Default zone: `us-central1-a` (configurable)

```bash
gcloud compute instances create grengin \
  --image-family=grengin \
  --machine-type=e2-small \
  --tags=http-server,https-server
```

### Azure Managed Image

- Base: `almalinux-x86_64` / `9-gen2` SKU
- Published to **Shared Image Gallery** `grenginMarketplaceGallery` under resource group `grengin-marketplace`
- Auto-replicated to `eastus`, `westus2`, `westeurope`
- SemVer-versioned image definitions (`grengin-almalinux9`)

### DigitalOcean Snapshot *(coming soon)*

- AlmaLinux 9 x64 base snapshot
- Default region: `nyc3`

### Building Images with Packer

The Packer source lives in [`grengin-image`](https://github.com/grengin-oss/grengin-image). Images can be built for a single cloud or all four in one run.

```bash
# Clone
git clone https://github.com/grengin-oss/grengin-image
cd grengin-image/packer

# Build all clouds at once (requires cloud credentials in env)
packer build \
  -var "grengin_version=v0.2.0" \
  -var "aws_region=us-east-1" \
  -var "gcp_project_id=my-project" \
  -var "azure_subscription_id=<uuid>" \
  grengin.pkr.hcl

# Build AWS only (x86_64 or arm64)
packer build \
  -var "grengin_version=v0.2.0" \
  -var "target_arch=arm64" \
  -only=amazon-ebs.grengin \
  grengin.pkr.hcl

# Build for AWS Marketplace submission
packer build \
  -var "grengin_version=v0.2.0" \
  aws-marketplace.pkr.hcl
```

**Artifact source strategies** (`artifact_source` variable):

| Strategy | Description |
|----------|-------------|
| `ghcr_bundle` *(default)* | Pull installer + webapp from `ghcr.io/perter-tech/grengin-image`, API from `ghcr.io/grengin-oss/grengin-api` |
| `releases` | Download signed binaries from a release URL |
| `ghcr_github` | Pull API from GHCR, build webapp from source (GitHub) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Target Server                       │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │          Nginx (:443 / :80)                 │    │
│  │  • SSL termination (Let's Encrypt)          │    │
│  │  • /api/* → grengin-api :8080               │    │
│  │  • /*     → /var/www/grengin (SPA)          │    │
│  └───────────────────┬─────────────────────────┘    │
│                      │                              │
│          ┌───────────┴──────────┐                  │
│          ▼                      ▼                  │
│  ┌──────────────┐     ┌──────────────────────┐     │
│  │ grengin-api  │     │   Webapp (SPA / App) │     │
│  │ Rust · Axum  │     │   Svelte 5 · Tauri   │     │
│  │  Port 8080   │     │   Static files       │     │
│  └──────┬───────┘     └──────────────────────┘     │
│         │                                           │
│         ▼                                           │
│  ┌──────────────┐                                   │
│  │  PostgreSQL  │ ← pgvector for RAG/semantic search│
│  │  Port 5432   │                                   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### Data Flows

**Authentication**: Browser → Google/Azure OIDC → `/api/auth/*` → JWT issued → stored in client → sent as `Authorization: Bearer` on every request.

**Chat message**: User sends → `POST /api/chat/{id}/messages` → JWT validated → department budget checked → API key AES-256-GCM decrypted → LLM provider streamed → SSE response → message persisted.

**MCP tool call**: LLM decides to call a tool → API resolves MCP server for user → OAuth token refreshed if needed → tool executed → result injected into next LLM turn → timeline event emitted to frontend.

---

## Project Structure

```
grengin/                          # This repository
├── service/                      # Backend API (Rust/Axum) — git submodule
│   └── → github.com/grengin-oss/grengin-api
├── webapp/                       # Frontend (Svelte 5 + Tauri) — git submodule
│   └── → github.com/grengin-oss/webapp
├── installer/                    # Web-based setup wizard (Rust/Axum)
├── .github/workflows/            # CI/CD (GitHub Actions)
├── deploy/                       # Deployment scripts and configs
│   ├── install.sh                # Bootstrap script (get.grengin.io)
│   └── nginx/                    # Nginx configuration snippets
├── Dockerfile.*                  # Docker images for API, installer, webapp
└── docs/                         # Documentation
```

---

## Submodules

### `service` — Backend API (`grengin-api`)

> **Version**: 0.2.61 &nbsp;|&nbsp; **Language**: Rust (Edition 2024) &nbsp;|&nbsp; **Framework**: Axum 0.8 &nbsp;|&nbsp; **ORM**: SeaORM + PostgreSQL

The API server exposes a fully documented REST/SSE interface (Swagger UI at `/api/docs`). All LLM calls are streamed to the client using Server-Sent Events.

#### Feature Areas

| Area | Details |
|------|---------|
| **Chat** | Conversations, streamed messages, web-search toggle, semantic conversation search |
| **LLM Providers** | OpenAI, Anthropic (Claude), Mistral, Gemini — runtime-switchable, API keys AES-256-GCM encrypted |
| **MCP Integration** | Connect tool servers over stdio or HTTP, sync available tools, OAuth per-user auth flow, per-tool access policies |
| **RAG / Embeddings** | Configurable embedding provider + model + dimensions; pgvector-backed semantic search over message history |
| **Departments** | Tree-structured org units, budget periods (daily/weekly/monthly), allowed-model lists per department |
| **RBAC** | Custom roles, granular permissions, department-scoped assignments, permission delegation |
| **Auth** | JWT (RS256), Google OAuth2/OIDC, Azure AD OIDC, domain allow-lists, SSO credential validation |
| **Analytics** | Overview, per-user, per-department usage metrics with time-series and token spend |
| **Audit Logs** | Immutable audit trail of admin actions, CSV/JSON export, redaction support |
| **Notifications** | Real-time SSE notification stream per user |
| **Branding** | Customisable name, logo URL, primary colour, accent colour, font family |
| **System Metrics** | CPU, RAM, disk, DB stats endpoint for admin monitoring |
| **Files** | Multi-part file upload attached to conversations |

#### Source Layout

```
service/src/
├── handlers/          # One file per route group (chat, auth, admin_*, mcp, …)
├── routes/            # Axum router definitions
├── services/          # Business logic (authorization, budget_allocation, mcp_client, rag, …)
├── llm/               # Provider adapters (openai, anthropic, mistral, gemini, tooling)
├── models/            # SeaORM entity definitions
├── dto/               # Request/response structs (serde + utoipa)
├── auth/              # JWT, encryption, OIDC, permissions
├── config/            # Runtime settings & provider cache
└── state.rs           # Shared app state (Arc<RwLock<…>>)
```

#### Recent Changes

- ARM64 Docker image builds in CI (`ghcr.io/grengin-oss/grengin-api` — multi-arch)
- Extensive `sqlx-mcp` tool integration (in-repo stdio MCP server)
- AMI domain and certificate reconfiguration APIs
- SSO credentials validation API
- Department prompt management and budget allocation APIs

---

### `webapp` — Frontend (`webapp`)

> **Version**: 0.2.0 &nbsp;|&nbsp; **Framework**: Svelte 5 &nbsp;|&nbsp; **Language**: TypeScript &nbsp;|&nbsp; **Desktop + Mobile**: Tauri 2 &nbsp;|&nbsp; **Charts**: Vega-Lite

A responsive single-page application compiled as static files for web deployment, and bundled into a native desktop app via Tauri. Uses Svelte 5's fine-grained reactivity (`$state`, `$derived`).

#### User-Facing Features

| Feature | Details |
|---------|---------|
| **AI Chat** | Streaming messages, markdown + code highlighting, file attachments |
| **Tool Call Timeline** | Visual step-by-step trace of MCP tool executions inside a conversation |
| **Web Search** | Toggle web search per message; search results surfaced inline |
| **Prompt Library** | Personal saved prompts, admin-managed org-wide prompts |
| **Notifications** | Real-time notification centre with SSE subscription |
| **User Settings** | Profile, language (i18n), theme (dark/light) |
| **Deep Linking** | Tauri deep-link plugin for `grengin://` and `msauth://` schemes on desktop, Android, and iOS |
| **Mobile App** *(coming soon)* | Android (API 24+) and iOS (14+) builds via Tauri; OAuth redirect flows pre-wired |

#### Admin Dashboard

| Panel | Capabilities |
|-------|-------------|
| **Overview** | Organisation-wide stats at a glance |
| **AI Engines** | Add/edit/validate OpenAI, Anthropic, Mistral, Gemini API keys; enable/disable models |
| **Departments** | Tree view, create/move/budget departments, allowed-models per department |
| **Users** | Invite, deactivate, role assignment |
| **Access Control** | Manage roles and permissions; assign permissions at org or department scope |
| **MCP Servers** | Register servers (HTTP/stdio), sync tools, configure OAuth, set per-tool policies |
| **Analytics** | Overview tab, per-user tab, per-department tab — all with Vega-Lite time-series charts |
| **Audit Logs** | Filterable log of admin events, pagination, export |
| **Prompt Library** | Create and manage org-wide prompts by role |
| **Prompt Effectiveness** | Tabbed dashboard: usage, adoption by department, quality metrics |
| **Settings** | Branding (logo, colours, font), SSO provider config |

#### Source Layout

```
webapp/src/lib/
├── admin/
│   ├── pages/         # Admin page components (AIEngines, Departments, Analytics, …)
│   ├── components/    # Shared admin UI (modals, tables, charts, mcp/*, analytics/*, …)
│   ├── stores/        # Admin state stores
│   └── types.ts       # Admin domain types
├── features/
│   ├── auth/          # Auth state, permissions store, deep-link handler
│   ├── chat/          # Chat components (Chat, ChatMessage, ToolCallTimeline, …)
│   └── notifications/ # Notification components
├── api/               # Typed API client (chatApi, fileApi, admin/*, …)
├── components/        # App-wide components (Toaster, PermissionGuard, …)
├── i18n/              # svelte-i18n locale files
└── platform/          # Tauri-specific platform adapters
```

#### Recent Changes

- Audit logs page with full i18n support
- Pagination on department adoption table
- Department Prompts integrated as a tab inside Department Details panel
- Prompt Effectiveness dashboard with tabbed UI
- Tool Execution Timeline for visualising MCP tool call chains
- MCP OAuth callback page and per-user connection panels
- Bump to Svelte 5 and rolldown-vite

---

## Installation Wizard

The installer runs on **the same URL** as the final application. After SSL is obtained mid-wizard, the user is redirected to HTTPS on the same domain — and after finalisation nginx is reconfigured so the app is immediately live.

```
http://your-ip → Step 1-3 (HTTP) → https://your-domain → Step 4-6 (HTTPS) → Application
```

| Step | What happens |
|------|-------------|
| 1. **System Check** | Validates OS, open ports, root access |
| 2. **Database** | Initialises local PostgreSQL or connects to external |
| 3. **Domain & SSL** | Obtains Let's Encrypt certificate via Certbot; nginx gains HTTPS |
| 4. **OAuth** *(optional)* | Configures Google and/or Azure AD SSO |
| 5. **AI Providers** *(optional)* | Sets OpenAI, Anthropic, Mistral, and/or Gemini API keys |
| 6. **Finalize** | Writes `/etc/grengin/.env`, deploys binaries, enables systemd unit |

---

## System Requirements

| | Minimum | Recommended |
|--|---------|-------------|
| **RAM** | 2 GB | 4 GB+ |
| **Disk** | 10 GB | 20 GB+ |
| **CPU** | Any x86_64 / ARM64 | 2+ cores |
| **OS** | Linux | See below |

**Supported platforms (one-line installer)**:
- RHEL-based: AlmaLinux 9, Rocky Linux 9, RHEL 9, Fedora 39+
- Debian-based: Ubuntu 22.04+, Debian 12+
- Docker: Any Linux with Docker 24+ and Docker Compose v2

---

## Post-Installation

| Service | Port | Description |
|---------|------|-------------|
| Nginx | 80, 443 | Reverse proxy + SSL termination |
| grengin-api | 8080 (internal) | REST/SSE API |
| PostgreSQL | 5432 (internal) | Database |

### Default File Paths (Native Install)

```
/opt/grengin/grengin-api             # API binary
/opt/grengin/scripts/                # Reconfigure scripts
/var/www/grengin/                    # Frontend static files
/etc/grengin/.env                    # Environment configuration
/etc/nginx/sites-available/grengin
/etc/systemd/system/grengin.service
```

### Management Commands

```bash
systemctl status grengin             # Service status
systemctl restart grengin            # Restart API
journalctl -u grengin -f             # Follow logs
tail -f /var/log/nginx/access.log    # Nginx access log

# Re-run domain/SSL reconfiguration
sudo /opt/grengin/scripts/reconfigure-domain.sh

# Update binaries in place
sudo /opt/grengin/scripts/update-app-binaries.sh
```

---

## Security

- API keys encrypted at rest with **AES-256-GCM** (unique nonce per key)
- All secrets generated using cryptographically secure random
- SSL/TLS via **Let's Encrypt** with automatic renewal
- Firewall configured to expose only ports **22, 80, 443**
- OAuth credentials validated against provider before storage
- Granular permission system prevents privilege escalation
- Audit log records every sensitive admin action
- AMI images: SSH password auth disabled, root login disabled, SELinux enforcing

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, data flows, scaling |
| [Wizard Steps](docs/wizard-steps.md) | Installation wizard walkthrough |
| [Deployment Modes](docs/deployment-modes.md) | Native (systemd) vs Docker |
| [Configuration](docs/configuration.md) | Environment variables reference |
| [API Reference](docs/api-reference.md) | REST endpoints |
| [Development](docs/development.md) | Building from source, CI/CD, contributing |

---

## License

This project uses a **dual-license model** designed to keep the software free for individuals, small businesses, and non-commercial use, while requiring larger commercial entities to obtain a paid license.

### Community Edition (Free)

**You can use Grengin for free if:**
- Your organisation has less than **$5M USD** in annual revenue, OR
- You are using it for **non-commercial purposes** (personal, educational, research), OR
- You are using it for **internal tools** that do not directly generate revenue, OR
- You are an **individual**, **non-profit**, or **educational institution**

### Commercial License Required

**You need a commercial license if:**
- Your organisation has **$5M+ annual revenue**, AND
- You are using Grengin for commercial purposes

📄 **[Read the full license](LICENSE.md)** | 💬 **[License FAQ](LICENSE_FAQ.md)** | 💼 **[Commercial licensing](https://github.com/grengin-oss/grengin/blob/main/LICENSE_ENTERPRISE.md)**

**Questions?** Contact licensing@grengin.com

---

## Contributing

We welcome contributions from the community! By contributing to Grengin, you agree to license your contributions under our dual-license model.

- **Small contributions** (bug fixes, typos, minor improvements) — submit directly via pull request
- **Significant contributions** (new features, major changes) — require signing our [Contributor License Agreement](CONTRIBUTOR_LICENSE.md)

You retain full ownership of your contributions. The CLA simply grants us the rights to include them in both Community and Enterprise editions.

**[Read the full CLA](CONTRIBUTOR_LICENSE.md)**

---

## Links

- [GitHub — grengin (this repo)](https://github.com/grengin-oss/grengin)
- [GitHub — grengin-api](https://github.com/grengin-oss/grengin-api)
- [GitHub — webapp](https://github.com/grengin-oss/webapp)
- [GitHub — grengin-image (Packer)](https://github.com/grengin-oss/grengin-image)
- [Container Registry (GHCR)](https://github.com/orgs/grengin-oss/packages)
- [Issue Tracker](https://github.com/grengin-oss/grengin/issues)
