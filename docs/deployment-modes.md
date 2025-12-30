# Deployment Modes

Grengin supports two deployment modes: **Native Install** (using systemd) and **Docker Compose**. This document details both approaches.

## Overview

| Feature | Native Install | Docker Compose |
|---------|---------------|----------------|
| Platforms | RHEL, Debian | Any Linux |
| Service Manager | systemd | Docker |
| Updates | Manual binary replacement | `docker compose pull` |
| Resource Isolation | Shared system | Containerized |
| Complexity | Lower | Higher |
| Recommended For | Production servers | Development, testing |

## Docker Images

Official images are published to Docker Hub on each release:

| Image | Description | Size |
|-------|-------------|------|
| `grengin/api` | Backend API server | ~50MB |
| `grengin/webapp` | Frontend (nginx + static) | ~30MB |
| `grengin/installer` | Setup wizard | ~60MB |

Tags available:
- `latest` - Most recent release
- `v0.1.0`, `v0.2.0`, etc. - Specific versions

```bash
# Pull latest images
docker pull grengin/api:latest
docker pull grengin/webapp:latest
```

---

## Mode 1: Native Install

Native installation uses system packages and systemd for service management. This is the default for RHEL and Debian-based systems.

### Supported Platforms

**RHEL-based** (dnf package manager):
- AlmaLinux 9
- Rocky Linux 9
- RHEL 9
- Fedora 39+
- CentOS Stream 9

**Debian-based** (apt package manager):
- Ubuntu 22.04 LTS, 24.04 LTS
- Debian 12 (Bookworm)
- Linux Mint 21+

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Native Install                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  systemd                                                    │
│  ├── nginx.service          (reverse proxy, SSL)           │
│  ├── grengin.service        (API server)                   │
│  └── postgresql.service     (database, if local)           │
│                                                             │
│  Files                                                      │
│  ├── /opt/grengin/grengin-api                              │
│  ├── /var/www/grengin/      (frontend)                     │
│  ├── /etc/grengin/.env      (config)                       │
│  └── /etc/nginx/sites-available/grengin                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### File Locations

| Path | Description | Permissions |
|------|-------------|-------------|
| `/opt/grengin/grengin-api` | API binary | `root:root 755` |
| `/var/www/grengin/` | Frontend static files | `www-data:www-data 755` |
| `/etc/grengin/.env` | Environment configuration | `root:grengin 640` |
| `/etc/nginx/sites-available/grengin` | Nginx site config | `root:root 644` |
| `/etc/systemd/system/grengin.service` | Systemd unit | `root:root 644` |
| `/var/log/grengin/` | Application logs | `grengin:grengin 755` |
| `/var/lib/grengin/files/` | Uploaded files | `grengin:grengin 755` |

### Systemd Service

**Service Unit** (`/etc/systemd/system/grengin.service`):

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

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/grengin /var/log/grengin
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

### Management Commands

```bash
# Service status
sudo systemctl status grengin

# Start/stop/restart
sudo systemctl start grengin
sudo systemctl stop grengin
sudo systemctl restart grengin

# Enable/disable at boot
sudo systemctl enable grengin
sudo systemctl disable grengin

# View logs
sudo journalctl -u grengin -f           # Follow logs
sudo journalctl -u grengin --since today # Today's logs
sudo journalctl -u grengin -n 100       # Last 100 lines

# Reload after config change
sudo systemctl daemon-reload
sudo systemctl restart grengin
```

### Nginx Configuration

**Site Configuration** (`/etc/nginx/sites-available/grengin`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name chat.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name chat.example.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;
    include /etc/nginx/snippets/ssl-params.conf;

    # Frontend static files
    root /var/www/grengin;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        include /etc/nginx/snippets/proxy-params.conf;

        # SSE support for streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### Updating

```bash
# 1. Download new binary
curl -sSL https://releases.grengin.io/api/latest/x86_64/grengin-api \
    -o /tmp/grengin-api

# 2. Stop service
sudo systemctl stop grengin

# 3. Replace binary
sudo mv /tmp/grengin-api /opt/grengin/grengin-api
sudo chmod +x /opt/grengin/grengin-api

# 4. Run migrations (if needed)
cd /opt/grengin && sudo -u grengin ./grengin-api migrate

# 5. Start service
sudo systemctl start grengin

# 6. Verify
sudo systemctl status grengin
curl -s https://chat.example.com/api/health
```

---

## Mode 2: Docker Compose

Docker Compose deployment runs all services in containers. This is the fallback for unsupported platforms or when containerization is preferred.

### Requirements

- Docker 24+
- Docker Compose v2 (plugin or standalone)
- At least 4 GB RAM
- 20 GB disk space

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  docker compose                                             │
│  ├── nginx         (reverse proxy, SSL)                    │
│  ├── grengin-api   (API server)                            │
│  └── postgres      (database)                              │
│                                                             │
│  Volumes                                                    │
│  ├── grengin_data      (uploaded files)                    │
│  ├── grengin_postgres  (database)                          │
│  └── grengin_certs     (SSL certificates)                  │
│                                                             │
│  Network                                                    │
│  └── grengin_network   (internal communication)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Generated Files

The installer generates these files in `/opt/grengin/`:

```
/opt/grengin/
├── docker-compose.yml
├── .env
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       └── grengin.conf
└── webapp/
    └── (static files)
```

### Docker Compose Configuration

**docker-compose.yml**:

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: grengin-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: grengin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: grengin
    volumes:
      - grengin_postgres:/var/lib/postgresql/data
    networks:
      - grengin_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U grengin"]
      interval: 10s
      timeout: 5s
      retries: 5

  grengin-api:
    image: grengin/api:latest
    container_name: grengin-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://grengin:${DB_PASSWORD}@postgres:5432/grengin
      JWT_SECRET: ${JWT_SECRET}
      APP_KEY: ${APP_KEY}
      REDIRECT_URL: ${REDIRECT_URL}
      HOST: 0.0.0.0
      PORT: 8080
      # OAuth (optional)
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      AZURE_TENANT_ID: ${AZURE_TENANT_ID:-}
      AZURE_CLIENT_ID: ${AZURE_CLIENT_ID:-}
      AZURE_CLIENT_SECRET: ${AZURE_CLIENT_SECRET:-}
      # AI providers (optional)
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    volumes:
      - grengin_data:/app/files
    networks:
      - grengin_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    container_name: grengin-nginx
    restart: unless-stopped
    depends_on:
      - grengin-api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./webapp:/var/www/grengin:ro
      - grengin_certs:/etc/letsencrypt:ro
    networks:
      - grengin_network

volumes:
  grengin_postgres:
  grengin_data:
  grengin_certs:

networks:
  grengin_network:
    driver: bridge
```

### Management Commands

```bash
cd /opt/grengin

# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f              # All services
docker compose logs -f grengin-api  # Specific service

# Restart a service
docker compose restart grengin-api

# Update images
docker compose pull
docker compose up -d

# View status
docker compose ps

# Execute command in container
docker compose exec grengin-api sh
docker compose exec postgres psql -U grengin

# View resource usage
docker stats
```

### SSL with Docker

**Option 1: Let's Encrypt with Certbot**

```bash
# Initial certificate
docker run --rm -v grengin_certs:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot certonly --webroot \
    -w /var/www/certbot \
    -d chat.example.com \
    --email admin@example.com \
    --agree-tos --no-eff-email

# Renewal (add to crontab)
0 0 * * * docker run --rm -v grengin_certs:/etc/letsencrypt certbot/certbot renew --quiet
```

**Option 2: Use Traefik** (alternative to nginx)

```yaml
# docker-compose.override.yml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - grengin_certs:/letsencrypt
```

### Updating with Docker

```bash
cd /opt/grengin

# Pull latest images
docker compose pull

# Recreate containers with new images
docker compose up -d

# Clean up old images
docker image prune -f
```

### Backup and Restore

**Backup**:
```bash
# Database
docker compose exec -T postgres pg_dump -U grengin grengin > backup.sql

# Files
docker run --rm -v grengin_data:/data -v $(pwd):/backup alpine \
    tar czf /backup/files.tar.gz -C /data .
```

**Restore**:
```bash
# Database
docker compose exec -T postgres psql -U grengin grengin < backup.sql

# Files
docker run --rm -v grengin_data:/data -v $(pwd):/backup alpine \
    tar xzf /backup/files.tar.gz -C /data
```

---

## Choosing a Deployment Mode

### Use Native Install When:

- Running on supported RHEL or Debian-based system
- Want simpler operations and debugging
- Need direct access to logs via journalctl
- Prefer system-level security controls
- Running on dedicated server

### Use Docker Compose When:

- Running on unsupported Linux distribution
- Want consistent environment across dev/staging/prod
- Need easy rollback (just change image tag)
- Running multiple services on same server
- Prefer container isolation

---

## Migration Between Modes

### Native to Docker

1. Export database:
   ```bash
   pg_dump -U grengin grengin > backup.sql
   ```

2. Copy uploaded files:
   ```bash
   tar czf files.tar.gz /var/lib/grengin/files/
   ```

3. Stop native services:
   ```bash
   sudo systemctl stop grengin nginx postgresql
   ```

4. Deploy Docker Compose setup

5. Import data:
   ```bash
   docker compose exec -T postgres psql -U grengin grengin < backup.sql
   docker run --rm -v grengin_data:/data -v $(pwd):/backup alpine \
       tar xzf /backup/files.tar.gz -C /data
   ```

### Docker to Native

1. Export from Docker containers
2. Install native packages
3. Import database and files
4. Configure systemd services

---

## Related Documentation

- [Architecture](architecture.md) - System components
- [Configuration](configuration.md) - Environment variables
- [Wizard Steps](wizard-steps.md) - Installation process
