<p align="center">
  <a href="https://grengin.com">
    <img src="src/assets/grengin-logo.svg" width="520" alt="Grengin">
  </a>
</p>

<h1 align="center">Grengin</h1>

<p align="center">
  An open-source, self-hosted AI platform for secure multi-provider chat,
  team governance, MCP tools, projects, analytics, and enterprise SSO.
</p>

<p align="center">
  <a href="https://grengin.com">Website</a> |
  <a href="https://grengin.com/docs">Documentation</a> |
  <a href="https://grengin.com/aws">Deploy on AWS</a> |
  <a href="https://github.com/grengin-oss/grengin/releases">Releases</a> |
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <a href="LICENSE_FAQ.md"><img alt="License FAQ" src="https://img.shields.io/badge/license-FAQ-blue"></a>
  <img alt="Svelte 5" src="https://img.shields.io/badge/Svelte_5-FF3E00?logo=svelte&amp;logoColor=white">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&amp;logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-000000?logo=rust&amp;logoColor=white">
  <img alt="Android" src="https://img.shields.io/badge/Android_7%2B-3DDC84?logo=android&amp;logoColor=white">
  <img alt="iOS" src="https://img.shields.io/badge/iOS_14%2B-000000?logo=apple&amp;logoColor=white">
  <img alt="Axum" src="https://img.shields.io/badge/Axum-1f2937">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&amp;logoColor=white">
  <img alt="Linux amd64 and arm64" src="https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-FCC624?logo=linux&amp;logoColor=black">
</p>

Grengin gives teams governed access to leading AI models without sending their
workspace, policies, and operational data to a third-party AI SaaS. It combines
a responsive chat experience with organization controls, model routing, project
workspaces, semantic search, MCP integrations, budgets, analytics, and audit
logs.

## Key Features

- **Multi-provider AI**: configure OpenAI, Anthropic, Mistral, and Gemini models
- **Projects and artifacts**: organize conversations, sources, instructions, MCP servers, and generated content
- **MCP integrations**: connect HTTP and stdio tool servers with per-tool access policies
- **Organization governance**: manage users, departments, roles, permissions, and delegated access
- **Budgets and analytics**: control model access and monitor token usage across teams
- **RAG and semantic search**: search conversation history with configurable embeddings and PostgreSQL pgvector
- **Enterprise authentication**: Google and Microsoft Entra ID OAuth/OIDC with domain controls
- **Security and auditability**: encrypted provider credentials, scoped authorization, and administrative audit logs
- **Internationalization**: English, Arabic, Spanish, French, Japanese, Korean, and Portuguese interfaces
- **Native applications**: Tauri 2 shell for desktop, Android 7.0+, and iOS 14+ with native deep links, notifications, camera access, and mobile SSO handoff
- **Self-hosted deployment**: run Grengin in your own cloud account and retain control of infrastructure and data

## Technology Stack

| Area | Technologies |
|---|---|
| Web interface | Svelte 5, TypeScript, Vite |
| Native application shell | Tauri 2 and Rust |
| Android | Android WebView, Kotlin native bridges, minimum API 24 (Android 7.0) |
| iOS | WKWebView through Tauri, minimum iOS 14.0 |
| API | Rust, Axum, SeaORM, Server-Sent Events |
| Data and search | PostgreSQL, pgvector, PostgreSQL full-text search |
| AI and tools | OpenAI, Anthropic, Mistral, Gemini, MCP |

Android builds are supported from Linux, macOS, and Windows with the Android
SDK and NDK installed. Apple requires iOS applications to be compiled and
simulator-tested on macOS with Xcode; the iOS target cannot be built on Linux or
Windows.

## Deploy Grengin

The fastest production path is the Grengin AWS image, which supports both
x86_64 and AWS Graviton instances:

**[Deploy Grengin on AWS](https://grengin.com/aws)**

Stable releases are available from the
[GitHub Releases page](https://github.com/grengin-oss/grengin/releases). Every
release records the exact frontend and backend commits used to build it.

## Release Assets

Grengin uses one public product version across its release assets:

| Asset | Contents |
|---|---|
| `grengin-<version>-source.tar.gz` | Frontend source/build and pinned backend source |
| `grengin-<version>-source.zip` | Same complete source bundle in ZIP format |
| `grengin-<version>-linux-amd64.tar.gz` | Frontend build plus static amd64 `grengin-api` and `sqlx-mcp` binaries |
| `grengin-<version>-linux-arm64.tar.gz` | Frontend build plus static arm64 `grengin-api` and `sqlx-mcp` binaries |
| `grengin-<version>-SHA256SUMS.txt` | SHA-256 checksums for every custom release asset |

Each archive contains a `RELEASE-MANIFEST.json` with the exact repositories,
component versions, commit SHAs, platform, and architecture. The backend commit
is pinned in [`release/backend-commit.txt`](release/backend-commit.txt), so a
release never depends on a moving branch. Source and Linux archives also carry
the applicable Apache 2.0 license and attribution notices.

## Architecture

```text
Browser        Tauri desktop        Android        iOS
   |                 |                 |             |
   +-----------------+-----------------+-------------+
                             |
                             v
                Grengin interface (Svelte 5)
                             |
                  REST + Server-Sent Events
                             |
                             v
                   Grengin API (Rust + Axum)
                             |
          +------------------+------------------+
          |                  |                  |
  PostgreSQL + pgvector   AI providers     MCP tool servers
```

The frontend in this repository is compiled to static assets. The backend is
maintained in [`grengin-oss/grengin-api`](https://github.com/grengin-oss/grengin-api)
and is included at a pinned commit in every complete release bundle.

## Product Areas

### AI Workspace

- Streaming conversations with Markdown and syntax highlighting
- File attachments, web search, and server-driven artifacts
- Personal prompts, project instructions, and reusable organization prompts
- Tool-call timelines for MCP execution visibility
- Conversation projects with members, sources, and dedicated tools

### Administration

- AI provider and model configuration
- Organization, user, department, role, and permission management
- Department budgets and allowed-model policies
- Usage analytics and system metrics
- MCP server registration, tool synchronization, OAuth, and access policies
- Audit log filtering and export
- Branding and authentication settings

### Security

- Self-hosted infrastructure and database
- Encrypted AI provider credentials
- Role- and department-scoped authorization
- Google and Microsoft Entra ID authentication
- Domain restrictions and controlled user provisioning
- Administrative audit history

## Local Development

### Frontend

Requirements: Node.js 22 and pnpm 9 or newer.

```bash
git clone https://github.com/grengin-oss/grengin.git
cd grengin
pnpm install
pnpm dev
```

The development server uses `/api` by default. Set `VITE_API_BASE` in a local
environment file when connecting to a backend at another origin.

Useful commands:

```bash
pnpm check
pnpm test
pnpm build
```

### Native Applications

The Tauri application source and platform configuration live in `src-tauri/`.
Install Rust and the Tauri prerequisites before building a native application.

For Android, install the Android SDK, NDK, Java, and an ARM64 Rust Android
target. Run on an emulator or connected ADB device with:

```bash
pnpm android:dev
```

Create and install an optimized ARM64 APK on a connected device with:

```bash
./install_android_adb.sh
```

For iOS, use macOS with Xcode and its command-line tools. Initialize the Xcode
project on the first build, then run it on a simulator:

```bash
pnpm tauri ios init
pnpm tauri ios dev
```

Create an iOS release build with:

```bash
pnpm tauri ios build
```

### Backend

The backend is developed separately:

```bash
git clone https://github.com/grengin-oss/grengin-api.git
cd grengin-api
cargo build --release --locked --workspace --jobs 2
```

See the [backend repository](https://github.com/grengin-oss/grengin-api) for
database, environment, and API documentation.

## Repository Structure

```text
grengin/
|-- src/
|   |-- lib/admin/          # Administration pages and components
|   |-- lib/api/            # Typed API client
|   |-- lib/components/     # Shared application components
|   |-- lib/features/       # Authentication, chat, and notifications
|   |-- lib/i18n/           # Locale modules
|   `-- lib/routes/         # Application routes
|-- src-tauri/              # Rust shell and Android/iOS configuration
|-- mock/                   # Local mock API
|-- scripts/                # Build and release utilities
|-- release/                # Backend pin and release build definition
`-- .github/workflows/      # CI and release automation
```

## Contributing

Issues and small pull requests are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md). There is no contributor agreement
to sign, since Apache 2.0 Section 5 already covers submissions.

## License

Grengin is free and open source software under the
[Apache License 2.0](LICENSE).

Use it, modify it, self-host it, embed it, resell it, or run it as a
managed service, commercially or not, at any company size. No usage
caps, no commercial license, nothing to sign. Releases published
before this one remain under the Grengin Sustainable Use License they
shipped with.

The Grengin name and logo are trademarks of Perter Technology
Solutions Private Limited and are not covered by the Apache license.
Forks and third-party distributions need their own name; see
[TRADEMARKS.md](TRADEMARKS.md).

Questions: [LICENSE_FAQ.md](LICENSE_FAQ.md) or licensing@grengin.com
