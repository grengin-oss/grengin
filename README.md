# Grengin

A WordPress-style web installer for deploying Grengin - an AI-powered chat platform with multi-provider support.

## Quick Start

```bash
curl -sSL https://get.grengin.io | sudo bash
```

Then open `http://your-server-ip` (or `https://your-domain` after SSL setup) in your browser to complete the setup wizard.

> **Note**: The wizard runs on the same URL where your application will be hosted. After installation completes, you'll seamlessly transition to the main application on the same URL.

## What is Grengin?

Grengin is a self-hosted AI chat platform that supports multiple LLM providers (OpenAI, Anthropic) with:
- Multi-organization support
- OAuth authentication (Google, Azure)
- Encrypted API key storage
- Conversation history and file uploads
- Admin dashboard for configuration

## Project Structure

```
grengin/
├── service/              # Backend API (Rust/Axum) - git submodule
├── webapp/               # Frontend (Svelte 5) - git submodule
├── installer/            # Web-based setup wizard (Rust/Axum)
├── .github/workflows/    # CI/CD (GitHub Actions)
├── deploy/               # Deployment scripts and configs
│   ├── install.sh        # Bootstrap script (get.grengin.io)
│   └── nginx/            # Nginx configuration snippets
├── Dockerfile.*          # Docker images for API, installer, webapp
└── docs/                 # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System architecture and component overview |
| [Wizard Steps](docs/wizard-steps.md) | Detailed installation wizard walkthrough |
| [Deployment Modes](docs/deployment-modes.md) | Native (systemd) vs Docker deployment |
| [Configuration](docs/configuration.md) | Environment variables and settings |
| [API Reference](docs/api-reference.md) | Installer and main API endpoints |
| [Development](docs/development.md) | Building from source, CI/CD, and contributing |

## System Requirements

### Minimum
- 2 GB RAM
- 10 GB disk space
- Linux (x86_64 or ARM64)
- Root access (for package installation)

### Supported Platforms
- **RHEL-based**: AlmaLinux 9, Rocky Linux 9, RHEL 9, Fedora 39+
- **Debian-based**: Ubuntu 22.04+, Debian 12+
- **Docker**: Any Linux with Docker 24+ and Docker Compose v2

## Installation Options

### Option 1: One-Line Install (Recommended)

```bash
curl -sSL https://get.grengin.io | sudo bash
```

This downloads the installer and starts the web-based setup wizard on port 80. The wizard guides you through:
1. System requirements check
2. Database setup (local PostgreSQL or external)
3. Domain and SSL certificate configuration
4. OAuth provider setup (optional)
5. AI provider API keys (optional)
6. Final deployment

### Option 2: Manual Download

```bash
# Download installer for your architecture
curl -sSL https://releases.grengin.io/installer/latest/x86_64/grengin-installer -o grengin-installer
chmod +x grengin-installer
sudo ./grengin-installer --port 80
```

### Option 3: Docker Compose

```bash
# Pull and run the latest images
docker pull grengin/api:latest
docker pull grengin/webapp:latest

# Or use docker-compose
curl -sSL https://raw.githubusercontent.com/grengin-oss/grengin/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

## Docker Images

Official Docker images are published to Docker Hub on each release:

| Image | Description |
|-------|-------------|
| `grengin/api` | Backend API server |
| `grengin/webapp` | Frontend (nginx + static files) |
| `grengin/installer` | Setup wizard |

Tags: `latest`, `v0.1.0`, etc.

## Wizard Overview

The installer guides you through 6 steps, all on the same URL:

```
http://your-ip → Setup Wizard → https://your-domain → Application
```

1. **System Check** - Validates OS, ports, and permissions
2. **Database** - Install PostgreSQL locally OR connect to existing
3. **Domain & SSL** - Configure domain and obtain SSL certificate
4. **OAuth** (optional) - Set up Google/Azure authentication
5. **AI Providers** (optional) - Configure OpenAI/Anthropic API keys
6. **Finalize** - Deploy and start all services

After finalization, nginx takes over and serves the application on the same URL.

See [Wizard Steps](docs/wizard-steps.md) for detailed information.

## Post-Installation

After installation completes:

| Service | Port | Description |
|---------|------|-------------|
| Nginx | 80, 443 | Reverse proxy with SSL |
| grengin-api | 8080 | Backend API (internal) |
| PostgreSQL | 5432 | Database (internal/external) |

### Default Paths (Native Install)

```
/opt/grengin/grengin-api     # API binary
/var/www/grengin/            # Frontend files
/etc/grengin/.env            # Backend configuration
/etc/nginx/sites-available/grengin
/etc/systemd/system/grengin.service
```

### Management Commands

```bash
# View service status
systemctl status grengin

# View logs
journalctl -u grengin -f

# Restart service
systemctl restart grengin

# View nginx logs
tail -f /var/log/nginx/access.log
```

## Releases

Releases are automated via GitHub Actions when a version tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers:
1. Binary builds for x86_64 and aarch64
2. Docker image builds and push to Docker Hub
3. GitHub Release creation with artifacts
4. Upload to releases.grengin.io

See [Development](docs/development.md) for CI/CD details.

## Security

- All secrets generated locally using cryptographically secure random
- API keys encrypted at rest using AES-256-GCM
- SSL/TLS via Let's Encrypt (automatic renewal)
- Firewall configured to expose only ports 22, 80, 443
- OAuth credentials validated before storage

## Configuration

The installer generates proper environment files:

**Backend** (`/etc/grengin/.env`):
- Database connection string
- JWT signing secret
- Encryption key (APP_KEY)
- OAuth credentials
- AI provider API keys

**Frontend**: Built with `VITE_API_BASE=` (empty) so it uses relative `/api/*` paths, proxied by nginx.

See [Configuration](docs/configuration.md) for all options.

## License

[Grengin Sustainable Use License (SUL)](LICENSE.md)

## Links

- [GitHub Repository](https://github.com/grengin-oss/grengin)
- [Docker Hub](https://hub.docker.com/u/grengin)
- [Documentation](docs/)
- [Issue Tracker](https://github.com/grengin-oss/grengin/issues)
