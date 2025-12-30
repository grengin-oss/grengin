# Development Guide

This guide covers building Grengin from source, setting up a development environment, and contributing to the project.

## Repository Structure

```
grengin/
├── service/              # Backend API (git submodule)
│   ├── src/              # Rust source code
│   ├── migration/        # Database migrations
│   └── Cargo.toml        # Rust dependencies
├── webapp/               # Frontend (git submodule)
│   ├── src/              # Svelte/TypeScript source
│   └── package.json      # Node dependencies
├── installer/            # Setup wizard
│   ├── src/              # Rust source code
│   ├── static/           # Web UI assets
│   ├── templates/        # Config templates
│   └── Cargo.toml        # Rust dependencies
├── deploy/               # Deployment scripts
│   ├── install.sh        # Bootstrap script
│   └── nginx/            # Nginx configs
└── docs/                 # Documentation
```

## Prerequisites

### For Backend (service + installer)

- **Rust**: 1.75+ (recommend latest stable)
- **PostgreSQL**: 16+ (for local development)
- **OpenSSL**: Development headers

**macOS**:
```bash
brew install rust postgresql@16 openssl
```

**Ubuntu/Debian**:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt install postgresql-16 libssl-dev pkg-config
```

**RHEL/AlmaLinux**:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo dnf install postgresql16-server openssl-devel
```

### For Frontend (webapp)

- **Node.js**: 20+
- **pnpm**: 8+ (required, npm/yarn not supported)

```bash
# Install pnpm
npm install -g pnpm

# Or via corepack
corepack enable
corepack prepare pnpm@latest --activate
```

---

## Initial Setup

### Clone Repository

```bash
git clone https://github.com/grengin-oss/grengin.git
cd grengin

# Initialize submodules
git submodule update --init --recursive
```

### Database Setup

```bash
# Start PostgreSQL (macOS with Homebrew)
brew services start postgresql@16

# Create database and user
psql postgres -c "CREATE USER grengin WITH PASSWORD 'grengin';"
psql postgres -c "CREATE DATABASE grengin OWNER grengin;"

# Or use Docker
docker run -d --name grengin-db \
    -e POSTGRES_USER=grengin \
    -e POSTGRES_PASSWORD=grengin \
    -e POSTGRES_DB=grengin \
    -p 5432:5432 \
    postgres:16-alpine
```

---

## Building Components

### Backend (service)

```bash
cd service

# Development build
cargo build

# Release build
cargo build --release

# Run tests
cargo test

# Run with auto-reload (requires cargo-watch)
cargo install cargo-watch
cargo watch -x run
```

**Environment Variables** (create `.env`):
```bash
DATABASE_URL=postgres://grengin:grengin@localhost:5432/grengin
JWT_SECRET=dev-jwt-secret-for-testing-only
APP_KEY=ZGV2LWFwcC1rZXktZm9yLXRlc3Rpbmctb25seQ==
REDIRECT_URL=http://localhost:3000
HOST=127.0.0.1
PORT=8080
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
```

**Run Migrations**:
```bash
# Install sea-orm-cli
cargo install sea-orm-cli

# Run migrations
sea-orm-cli migrate up

# Create new migration
sea-orm-cli migrate generate create_new_table
```

### Frontend (webapp)

```bash
cd webapp

# Install dependencies
pnpm install

# Development server (hot reload)
pnpm dev

# Production build
pnpm build

# Type checking
pnpm check

# Run with mock API
pnpm mock:dev
```

**Environment Variables** (create `.env`):
```bash
# API base URL (optional, defaults to proxy)
VITE_API_BASE=http://localhost:8080
```

### Installer

```bash
cd installer

# Development build
cargo build

# Release build (static binary)
cargo build --release --target x86_64-unknown-linux-musl

# Run locally
cargo run -- --port 9000
```

---

## Development Workflow

### Running Full Stack Locally

**Terminal 1 - Database**:
```bash
docker run -d --name grengin-db \
    -e POSTGRES_USER=grengin \
    -e POSTGRES_PASSWORD=grengin \
    -e POSTGRES_DB=grengin \
    -p 5432:5432 \
    postgres:16-alpine
```

**Terminal 2 - Backend**:
```bash
cd service
cargo watch -x run
# Running on http://127.0.0.1:8080
```

**Terminal 3 - Frontend**:
```bash
cd webapp
pnpm dev
# Running on http://localhost:5173
```

The frontend's Vite config proxies `/api/*` requests to the backend.

### Using Dev Containers

The service includes a VS Code dev container configuration:

1. Install VS Code and "Dev Containers" extension
2. Open `service/` folder in VS Code
3. Click "Reopen in Container" when prompted
4. Container includes Rust, PostgreSQL, and all tools

---

## Building Release Binaries

### Cross-Compilation Setup

For building Linux binaries on macOS:

```bash
# Install cross-compilation targets
rustup target add x86_64-unknown-linux-musl
rustup target add aarch64-unknown-linux-musl

# Install cross (easier cross-compilation)
cargo install cross

# Build for x86_64 Linux
cross build --release --target x86_64-unknown-linux-musl

# Build for ARM64 Linux
cross build --release --target aarch64-unknown-linux-musl
```

### Building Installer

```bash
cd installer

# Build static binary for x86_64
cargo build --release --target x86_64-unknown-linux-musl

# Build static binary for ARM64
cargo build --release --target aarch64-unknown-linux-musl

# Output location
ls -la target/x86_64-unknown-linux-musl/release/grengin-installer
```

### Building Service

```bash
cd service

# Set Swagger UI override path
export SWAGGER_UI_OVERWRITE_FOLDER="${PWD}/swagger-overrides"

# Build for x86_64
cross build --release --target x86_64-unknown-linux-musl

# Build for ARM64
cross build --release --target aarch64-unknown-linux-musl
```

### Building Webapp

```bash
cd webapp

# Production build
pnpm build

# Output in dist/
ls -la dist/

# Create tarball for distribution
tar czf webapp-dist.tar.gz -C dist .
```

---

## Testing

### Backend Tests

```bash
cd service

# Run all tests
cargo test

# Run specific test
cargo test test_auth

# Run with output
cargo test -- --nocapture

# Run integration tests (requires database)
cargo test --features integration
```

### Frontend Tests

```bash
cd webapp

# Type checking
pnpm check

# Lint
pnpm lint

# Format check
pnpm format --check
```

### Installer Tests

```bash
cd installer

# Unit tests
cargo test

# Integration tests (requires root on Linux)
sudo cargo test --features integration
```

---

## Code Style

### Rust

- Follow standard Rust formatting (`cargo fmt`)
- Use Clippy for linting (`cargo clippy`)
- Document public APIs with doc comments

```bash
# Format code
cargo fmt

# Run linter
cargo clippy -- -D warnings
```

### TypeScript/Svelte

- Use Prettier for formatting
- Follow ESLint rules

```bash
cd webapp

# Format
pnpm format

# Lint
pnpm lint
```

---

## Project Structure Details

### Service (Backend)

```
service/src/
├── main.rs              # Entry point
├── app.rs               # Axum app setup
├── state.rs             # AppState (DB, config)
├── error.rs             # Error types
├── config/
│   └── setting.rs       # Settings from env
├── routes/
│   ├── mod.rs           # Route registration
│   ├── admin.rs         # Admin routes
│   ├── chat.rs          # Chat routes
│   └── oidc.rs          # OAuth routes
├── handlers/
│   ├── admin_*.rs       # Admin handlers
│   ├── chat.rs          # Chat handlers
│   └── oidc.rs          # OAuth handlers
├── models/
│   └── *.rs             # SeaORM entities
├── dto/
│   └── *.rs             # Request/response types
├── llm/
│   ├── mod.rs           # LLM trait
│   ├── provider.rs      # Provider implementations
│   └── prompt.rs        # Prompt templates
└── auth/
    └── jwt.rs           # JWT handling
```

### Installer

```
installer/src/
├── main.rs              # Entry point, CLI
├── web.rs               # Axum routes
├── state.rs             # InstallerState
├── steps/
│   ├── mod.rs           # Step trait
│   ├── system.rs        # System checks
│   ├── database.rs      # DB setup
│   ├── domain.rs        # Domain/SSL
│   ├── oauth.rs         # OAuth config
│   ├── ai.rs            # AI provider config
│   └── finalize.rs      # Final installation
└── platform/
    ├── mod.rs           # Platform trait
    ├── rhel.rs          # RHEL/dnf commands
    ├── debian.rs        # Debian/apt commands
    └── docker.rs        # Docker Compose
```

---

## Adding New Features

### Adding a New API Endpoint

1. **Define DTO** in `service/src/dto/`:
   ```rust
   #[derive(Serialize, Deserialize)]
   pub struct NewFeatureRequest {
       pub field: String,
   }
   ```

2. **Create Handler** in `service/src/handlers/`:
   ```rust
   pub async fn handle_new_feature(
       State(state): State<AppState>,
       Json(req): Json<NewFeatureRequest>,
   ) -> Result<Json<Response>, AppError> {
       // Implementation
   }
   ```

3. **Register Route** in `service/src/routes/`:
   ```rust
   .route("/api/new-feature", post(handle_new_feature))
   ```

4. **Add Tests**:
   ```rust
   #[tokio::test]
   async fn test_new_feature() {
       // Test implementation
   }
   ```

### Adding a New Installer Step

1. **Create Step Module** in `installer/src/steps/`:
   ```rust
   pub async fn check_new_requirement(state: &InstallerState) -> Result<CheckResult> {
       // Implementation
   }
   ```

2. **Add API Endpoint** in `installer/src/web.rs`:
   ```rust
   .route("/api/new-step/check", post(handle_new_step))
   ```

3. **Update UI** in `installer/static/wizard.js`:
   ```javascript
   async function checkNewStep() {
       const response = await fetch('/api/new-step/check', { method: 'POST' });
       // Handle response
   }
   ```

---

## CI/CD Pipeline

Releases are fully automated via GitHub Actions. When you push a version tag, the pipeline builds everything and publishes to GitHub Releases and Docker Hub.

### GitHub Actions Workflow

**File**: `.github/workflows/release.yml`

The workflow triggers on version tags (`v*`) and performs:

1. **Build Binaries** (parallel matrix):
   - x86_64-unknown-linux-musl
   - aarch64-unknown-linux-musl
   - Builds both `grengin-installer` and `grengin-api`

2. **Build Webapp**:
   - Installs pnpm and Node 20
   - Sets `VITE_API_BASE=` (empty for relative paths)
   - Runs `pnpm build`
   - Creates `webapp-dist.tar.gz`

3. **Build & Push Docker Images**:
   - `grengin/api:latest` and `grengin/api:v0.x.x`
   - `grengin/installer:latest` and `grengin/installer:v0.x.x`
   - `grengin/webapp:latest` and `grengin/webapp:v0.x.x`
   - Multi-platform: linux/amd64 and linux/arm64

4. **Create GitHub Release**:
   - Uploads binary artifacts
   - Auto-generates release notes

### Docker Hub Setup

Required secrets in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

### Docker Images

| Image | Description | Dockerfile |
|-------|-------------|------------|
| `grengin/api` | Backend API server | `Dockerfile.api` |
| `grengin/installer` | Setup wizard | `Dockerfile.installer` |
| `grengin/webapp` | Frontend (nginx + static) | `Dockerfile.webapp` |

### Release Process

1. **Update Versions**:
   ```bash
   # Update installer/Cargo.toml
   # Update service/Cargo.toml (in submodule)
   # Update webapp/package.json (in submodule)
   # Update CHANGELOG.md
   ```

2. **Commit and Tag**:
   ```bash
   git add -A
   git commit -m "Release v0.2.0"
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin main --tags
   ```

3. **Automated Steps** (GitHub Actions):
   - Builds binaries for x86_64 and aarch64
   - Builds Docker images for amd64 and arm64
   - Pushes images to Docker Hub
   - Creates GitHub Release with artifacts
   - Uploads to releases.grengin.io

### Manual Release (if needed)

```bash
# Build all binaries locally
cross build --release --target x86_64-unknown-linux-musl -p grengin-installer
cross build --release --target aarch64-unknown-linux-musl -p grengin-installer
cd service && cross build --release --target x86_64-unknown-linux-musl
cd service && cross build --release --target aarch64-unknown-linux-musl

# Build webapp
cd webapp && echo "VITE_API_BASE=" > .env && pnpm build
tar czf webapp-dist.tar.gz -C dist .

# Build and push Docker images
docker buildx build --platform linux/amd64,linux/arm64 \
  -t grengin/api:v0.2.0 -t grengin/api:latest \
  -f Dockerfile.api --push .
```

---

## Troubleshooting

### Common Issues

**"OpenSSL not found"**:
```bash
# macOS
brew install openssl
export OPENSSL_DIR=$(brew --prefix openssl)

# Ubuntu
sudo apt install libssl-dev pkg-config
```

**"sea-orm-cli not found"**:
```bash
cargo install sea-orm-cli
```

**"pnpm command not found"**:
```bash
npm install -g pnpm
# Or
corepack enable && corepack prepare pnpm@latest --activate
```

**Database connection refused**:
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check connection string
psql postgres://grengin:grengin@localhost:5432/grengin
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`cargo test` and `pnpm check`)
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Pull Request Guidelines

- Follow existing code style
- Add tests for new functionality
- Update documentation as needed
- Keep PRs focused on single changes
- Reference related issues

---

## Related Documentation

- [Architecture](architecture.md) - System overview
- [API Reference](api-reference.md) - API endpoints
- [Configuration](configuration.md) - Environment variables
