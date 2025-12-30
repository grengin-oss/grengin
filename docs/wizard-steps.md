# Installation Wizard Steps

The Grengin installer provides a web-based wizard that guides you through the complete setup process. This document details each step.

## Overview

The wizard runs on the **same URL** where your application will be hosted:

```
http://your-server-ip → Setup Wizard → https://your-domain → Application
```

This means:
- Initial access: `http://server-ip` (port 80)
- After SSL setup: `https://your-domain` (port 443)
- After installation: Same URL serves the application

The wizard consists of 6 steps:

1. [System Check](#step-1-system-check)
2. [Database Configuration](#step-2-database-configuration)
3. [Domain & SSL](#step-3-domain--ssl) ← SSL obtained, redirect to HTTPS
4. [OAuth Setup](#step-4-oauth-setup-optional)
5. [AI Providers](#step-5-ai-providers-optional)
6. [Finalize](#step-6-finalize) ← Nginx reconfigured, app takes over

---

## Step 1: System Check

The installer validates your system meets the requirements.

### Checks Performed

| Check | Requirement | Notes |
|-------|-------------|-------|
| Operating System | Linux (x86_64 or ARM64) | Detects RHEL, Debian, or Docker |
| Root Access | root or sudo | Required for package installation |
| Port 80 | Available | HTTP traffic |
| Port 443 | Available | HTTPS traffic |
| Port 8080 | Available | API server (internal) |
| RAM | 2+ GB recommended | Minimum 1 GB |
| Disk Space | 10+ GB | For binaries, database, files |

### Platform Detection

The installer detects your platform to determine the installation method:

**RHEL-based** (uses `dnf`):
- AlmaLinux 9
- Rocky Linux 9
- RHEL 9
- Fedora 39+
- CentOS Stream 9

**Debian-based** (uses `apt`):
- Ubuntu 22.04+
- Debian 12+
- Linux Mint 21+

**Docker** (fallback):
- Any Linux with Docker 24+ and Docker Compose v2
- Used when native package manager is unavailable

### UI Preview

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ● System     ○ Database     ○ Domain     ○ Done          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  System Requirements                                       │
│  ──────────────────                                        │
│  ✓ AlmaLinux 9.3 detected                                 │
│  ✓ Running as root                                         │
│  ✓ 4 GB RAM available                                      │
│  ✓ Port 80 available                                       │
│  ✓ Port 443 available                                      │
│  ✓ Port 8080 available                                     │
│                                                            │
│  Platform: RHEL-based (dnf)                               │
│                                                            │
│                                        [Continue →]       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Troubleshooting

**Port in use**:
```bash
# Find what's using port 80
sudo lsof -i :80
# or
sudo ss -tlnp | grep :80
```

**Not running as root**:
```bash
# Re-run installer with sudo
sudo ./grengin-installer
```

---

## Step 2: Database Configuration

Configure PostgreSQL for Grengin. You have two options:

### Option A: Install PostgreSQL Locally

The installer will:
1. Install PostgreSQL 16 via package manager
2. Start and enable the PostgreSQL service
3. Create a dedicated `grengin` user
4. Create the `grengin` database
5. Generate a secure random password
6. Configure `pg_hba.conf` for local connections

**Generated Configuration**:
```
DATABASE_URL=postgres://grengin:GENERATED_PASSWORD@localhost:5432/grengin
```

### Option B: Connect to Existing Database

Provide connection details for an existing PostgreSQL instance:

| Field | Description | Example |
|-------|-------------|---------|
| Host | Database server hostname or IP | `db.example.com` |
| Port | PostgreSQL port | `5432` |
| Database | Database name | `grengin` |
| Username | Database user | `grengin` |
| Password | User password | `your-password` |

The installer will:
1. Test the connection
2. Verify PostgreSQL version (16+ recommended)
3. Check the user has required permissions

**Requirements for existing database**:
- PostgreSQL 14+ (16+ recommended)
- User must have CREATE TABLE, INSERT, UPDATE, DELETE permissions
- Database should be empty or have existing Grengin schema

### UI Preview

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ● Database     ○ Domain     ○ Done          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Database Configuration                                    │
│  ──────────────────────                                    │
│                                                            │
│  ○ Install PostgreSQL locally (recommended)               │
│    PostgreSQL 16 will be installed and configured         │
│                                                            │
│  ○ Connect to existing PostgreSQL                         │
│    Use an external database server                        │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Connection Details (for existing database):              │
│                                                            │
│  Host:     [db.example.com                    ]           │
│  Port:     [5432                              ]           │
│  Database: [grengin                           ]           │
│  Username: [grengin                           ]           │
│  Password: [••••••••••••                      ]           │
│                                                            │
│            [Test Connection]                              │
│            ✓ Connected successfully (PostgreSQL 16.1)     │
│                                                            │
│                              [← Back]    [Continue →]     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Step 3: Domain & SSL

Configure your domain name and SSL certificate.

### Domain Configuration

| Field | Description | Example |
|-------|-------------|---------|
| Domain | Your Grengin domain | `chat.example.com` |
| Email | For Let's Encrypt notifications | `admin@example.com` |

**Prerequisites**:
- DNS A record pointing to your server's IP
- Port 80 accessible from internet (for Let's Encrypt validation)

### SSL Options

**Option 1: Let's Encrypt (Recommended)**
- Automatic certificate acquisition via Certbot
- Auto-renewal configured via systemd timer
- Requires valid DNS and port 80 access

**Option 2: Self-Signed Certificate**
- For testing or internal use
- Browser will show security warning
- No external dependencies

**Option 3: HTTP Only (Not Recommended)**
- No SSL/TLS encryption
- Only for local development
- Not suitable for production

### DNS Validation

The installer validates that your domain resolves to the current server:

```
Domain: chat.example.com
Server IP: 203.0.113.42
DNS resolves to: 203.0.113.42
✓ DNS is correctly configured
```

### UI Preview

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ✓ Database     ● Domain     ○ Done          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Domain & SSL Configuration                                │
│  ──────────────────────────                                │
│                                                            │
│  Domain Name                                               │
│  [chat.example.com                                      ]  │
│  ✓ DNS resolves to this server (203.0.113.42)             │
│                                                            │
│  Email (for Let's Encrypt)                                │
│  [admin@example.com                                     ]  │
│                                                            │
│  SSL Certificate                                          │
│  ● Let's Encrypt (recommended)                            │
│    Free, automatic renewal                                │
│                                                            │
│  ○ Self-signed certificate                                │
│    For testing only, browser will show warning            │
│                                                            │
│  ○ HTTP only (not recommended)                            │
│    No encryption, development only                        │
│                                                            │
│                              [← Back]    [Continue →]     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Step 4: OAuth Setup (Optional)

Configure OAuth providers for user authentication. **This step can be skipped** and configured later via the admin panel.

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URI:
   ```
   https://your-domain.com/auth/google/callback
   ```
7. Copy the Client ID and Client Secret

### Azure AD OAuth

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - Name: `Grengin`
   - Supported account types: Choose based on your needs
   - Redirect URI: `https://your-domain.com/auth/azure/callback`
5. After creation, note the **Application (client) ID** and **Directory (tenant) ID**
6. Under **Certificates & secrets**, create a new client secret

### Configuration Fields

| Provider | Field | Description |
|----------|-------|-------------|
| Google | Client ID | OAuth 2.0 client ID |
| Google | Client Secret | OAuth 2.0 client secret |
| Azure | Tenant ID | Directory (tenant) ID or `common` |
| Azure | Client ID | Application (client) ID |
| Azure | Client Secret | Client secret value |

### UI Preview

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ✓ Database     ✓ Domain     ○ Done          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  OAuth Configuration (Optional)                            │
│  ──────────────────────────────                            │
│                                                            │
│  You can skip this step and configure OAuth later via     │
│  the admin panel.                                         │
│                                                            │
│  Google OAuth                                             │
│  Client ID:     [                                      ]  │
│  Client Secret: [                                      ]  │
│  Callback URL:  https://chat.example.com/auth/google/callback │
│                                                            │
│  Azure AD OAuth                                           │
│  Tenant ID:     [                                      ]  │
│  Client ID:     [                                      ]  │
│  Client Secret: [                                      ]  │
│  Callback URL:  https://chat.example.com/auth/azure/callback │
│                                                            │
│                              [Skip]      [Continue →]     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Step 5: AI Providers (Optional)

Configure AI/LLM provider API keys. **This step can be skipped** and configured per-organization via the admin panel.

### Supported Providers

**OpenAI**
- Models: GPT-4o, GPT-4o-mini, o1, o1-mini, etc.
- Get API key: [platform.openai.com](https://platform.openai.com/api-keys)

**Anthropic**
- Models: Claude 3.5 Sonnet, Claude 3 Opus, Haiku, etc.
- Get API key: [console.anthropic.com](https://console.anthropic.com/)

### Configuration

| Provider | Field | Description |
|----------|-------|-------------|
| OpenAI | API Key | Starts with `sk-` |
| Anthropic | API Key | Starts with `sk-ant-` |

### Security Note

API keys are encrypted before storage:
- AES-256-GCM encryption
- Unique nonce per key
- Encryption key is `APP_KEY` (generated during install)
- Keys never stored in plaintext

### UI Preview

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ✓ Database     ✓ Domain     ○ Done          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  AI Provider Configuration (Optional)                      │
│  ────────────────────────────────────                      │
│                                                            │
│  You can skip this step and configure AI providers per    │
│  organization via the admin panel.                        │
│                                                            │
│  OpenAI                                                   │
│  API Key: [sk-...                                      ]  │
│                                                            │
│  Anthropic                                                │
│  API Key: [sk-ant-...                                  ]  │
│                                                            │
│  Note: API keys are encrypted at rest using AES-256-GCM  │
│                                                            │
│                              [Skip]      [Continue →]     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Step 6: Finalize

The final step performs the actual installation.

### Installation Process

1. **Generate Secrets**
   - `JWT_SECRET`: 64-character hex string for JWT signing
   - `APP_KEY`: 32-byte Base64 encoded for encryption

2. **Download Binaries**
   - `grengin-api` binary for your architecture
   - `webapp` static files (dist.tar.gz)

3. **Generate Configuration**
   - `/etc/grengin/.env` - Environment configuration
   - `/etc/nginx/sites-available/grengin` - Nginx config
   - `/etc/systemd/system/grengin.service` - Systemd unit

4. **Deploy Files**
   - Extract webapp to `/var/www/grengin/`
   - Install binary to `/opt/grengin/grengin-api`
   - Set proper ownership and permissions

5. **Configure SSL** (if Let's Encrypt selected)
   - Run Certbot for certificate
   - Configure auto-renewal

6. **Run Migrations**
   - Execute database migrations
   - Create initial schema

7. **Start Services**
   - Enable and start `grengin.service`
   - Reload Nginx configuration

8. **Health Check**
   - Verify API responds at `/api/health`
   - Verify frontend loads

### Progress Display

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ✓ Database     ✓ Domain     ● Installing    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Installation Progress                                     │
│  ────────────────────                                      │
│                                                            │
│  ✓ Generated secrets                                      │
│  ✓ Downloaded grengin-api binary                          │
│  ✓ Downloaded webapp files                                │
│  ✓ Generated configuration files                          │
│  ✓ Deployed files to system                               │
│  ✓ Obtained SSL certificate                               │
│  ✓ Running database migrations                            │
│  ● Starting services...                                   │
│  ○ Health check                                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ > systemctl start grengin                            │ │
│  │ > Waiting for health check...                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Completion

```
┌────────────────────────────────────────────────────────────┐
│                    Grengin Setup                           │
│                                                            │
│  ✓ System     ✓ Database     ✓ Domain     ✓ Complete      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                    Installation Complete!                  │
│                                                            │
│  Grengin is now running at:                               │
│  https://chat.example.com                                 │
│                                                            │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Next Steps:                                              │
│  1. Sign in with your configured OAuth provider           │
│  2. The first user becomes the admin                      │
│  3. Configure organizations and AI providers in admin     │
│                                                            │
│  Service Management:                                       │
│  • Status: systemctl status grengin                       │
│  • Logs:   journalctl -u grengin -f                       │
│  • Config: /etc/grengin/.env                              │
│                                                            │
│                    [Open Grengin →]                       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Post-Installation

After the wizard completes, the installer terminates and your Grengin instance is ready.

### First Login

1. Navigate to your domain (e.g., `https://chat.example.com`)
2. Sign in with configured OAuth provider
3. First user automatically becomes admin
4. Access admin panel to configure additional settings

### Admin Tasks

- **Organizations**: Create and manage organizations
- **Users**: Manage user access and roles
- **AI Engines**: Configure AI provider API keys per organization
- **Settings**: Adjust system-wide settings

### File Locations

| Path | Description |
|------|-------------|
| `/opt/grengin/grengin-api` | API binary |
| `/var/www/grengin/` | Frontend files |
| `/etc/grengin/.env` | Configuration |
| `/etc/nginx/sites-available/grengin` | Nginx config |
| `/etc/systemd/system/grengin.service` | Systemd unit |
| `/var/log/grengin/` | Application logs |

---

## Related Documentation

- [Architecture](architecture.md) - System architecture
- [Configuration](configuration.md) - Environment variables
- [Deployment Modes](deployment-modes.md) - Native vs Docker
