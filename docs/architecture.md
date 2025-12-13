# Grengin Webapp Architecture

> **Community Edition** - AI-native business growth engine providing governed access to AI tools

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Application Architecture](#application-architecture)
5. [State Management](#state-management)
6. [Routing](#routing)
7. [API Architecture](#api-architecture)
8. [Mock Server](#mock-server)
9. [Design System](#design-system)
10. [Development Workflow](#development-workflow)

---

## Overview

Grengin Webapp is a modern Single Page Application (SPA) built with Svelte 5, designed to provide an AI-powered interface for business growth tools. The application follows a component-based architecture with local state management using Svelte 5's runes system.

### Key Characteristics

- **Framework**: Svelte 5 with TypeScript
- **Build Tool**: Vite (Rolldown)
- **API Contract**: OpenAPI 3.2.0 specification (git submodule)
- **Development API**: Express mock server
- **Design Language**: Apple Liquid Glass aesthetic

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Svelte | 5.43.12 | Reactive UI framework |
| TypeScript | ~5.9.3 | Type safety |
| Vite (Rolldown) | 7.2.5 | Build tool & dev server |

### Development & Mocking

| Technology | Version | Purpose |
|------------|---------|---------|
| Express.js | 5.1.0 | Mock API server |
| Faker.js | 9.8.0 | Realistic test data |
| tsx | 4.20.6 | TypeScript execution |
| openapi-typescript | 7.10.1 | Type generation from OpenAPI |

### Code Quality

| Technology | Purpose |
|------------|---------|
| svelte-check | Svelte component type checking |
| TypeScript strict mode | Comprehensive type safety |

---

## Project Structure

```
webapp/
├── src/                        # Application source code
│   ├── main.ts                 # App entry point
│   ├── App.svelte              # Root component with layout
│   ├── app.css                 # Global styles & design tokens
│   ├── assets/                 # Static assets (logos, icons)
│   └── lib/
│       ├── Sidebar.svelte      # Navigation sidebar
│       ├── Chat.svelte         # Chat interface (placeholder)
│       ├── components/         # Reusable UI components
│       │   └── Toaster.svelte  # Toast notification system
│       ├── features/           # Feature modules
│       │   └── chat/           # Chat feature logic
│       └── utils/              # Utility functions
│
├── mock/                       # Mock API server
│   ├── server.ts               # Express server entry point
│   ├── routes/                 # Route handlers by domain
│   │   ├── admin.ts            # Admin endpoints
│   │   ├── auth.ts             # Authentication endpoints
│   │   ├── chat.ts             # Chat/conversation endpoints
│   │   ├── files.ts            # File management endpoints
│   │   ├── health.ts           # Health check endpoint
│   │   ├── models.ts           # AI model endpoints
│   │   ├── settings.ts         # User settings endpoints
│   │   └── user.ts             # User profile endpoints
│   ├── lib/                    # Shared utilities
│   │   ├── middleware.ts       # Auth middleware
│   │   └── store.ts            # In-memory stores & seed data
│   ├── examples/               # Mock response data (JSON)
│   └── types/
│       └── api.ts              # Generated API types
│
├── api/                        # Git submodule - OpenAPI specs
│   ├── openapi.yaml            # Main specification
│   ├── paths/                  # Endpoint definitions
│   └── schemas/                # Data model definitions
│
├── docs/                       # Documentation
├── public/                     # Static assets
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration
├── svelte.config.js            # Svelte configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies & scripts
```

---

## Application Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  App.svelte (Root Layout)                           │    │
│  │  ├── Sidebar.svelte (Navigation)                    │    │
│  │  └── [Page Components]                              │    │
│  │      └── Chat.svelte                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Component Layer                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  lib/components/                                    │    │
│  │  └── Toaster.svelte (Notifications)                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Feature Layer                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  lib/features/                                      │    │
│  │  └── chat/ (Chat feature module)                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  API Client (TBD)                                   │    │
│  │  └── Fetch API                                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Architecture

#### Root Component (`App.svelte`)

- Manages global layout (sidebar + main content)
- Controls sidebar collapse state
- Handles page routing via conditional rendering
- Responsive behavior for mobile/desktop

#### Sidebar (`Sidebar.svelte`)

- Fixed position navigation panel
- Collapsible (80px collapsed / 280px expanded)
- User menu with dropdown
- Mobile-responsive drawer mode

#### Feature Components

Components are organized by feature domain:
- **Chat**: Conversation interface (in development)
- **Components**: Shared UI components (Toaster, etc.)

---

## State Management

### Svelte 5 Runes System

The application uses Svelte 5's runes for reactive state management:

```typescript
// Component-level state
let sidebarCollapsed = $state(false);
let currentPage = $state('chat');

// Props with types
interface Props {
  isCollapsed?: boolean;
  onsidebarToggle?: (collapsed: boolean) => void;
}
let { isCollapsed = $bindable(false) }: Props = $props();
```

### State Patterns

| Pattern | Usage |
|---------|-------|
| `$state` | Local component state |
| `$props` | Type-safe prop declarations |
| `$bindable` | Two-way binding for parent-child communication |
| Module-level state | Shared state (e.g., Toaster) |

### Global State (Toaster Example)

```typescript
// Module-level reactive state
let toasts = $state<Toast[]>([]);

// Exported API
export const toast = {
  success: (message: string) => addToast({ type: 'success', message }),
  error: (message: string) => addToast({ type: 'error', message }),
  // ...
};
```

---

## Routing

### Current Implementation

Simple page-based routing using conditional rendering:

```svelte
<script>
  let currentPage = $state('chat');
</script>

{#if currentPage === 'chat'}
  <Chat />
{/if}
```

### Menu Structure

```typescript
const menuItems = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  // Additional pages to be added
];
```

> **Note**: No routing library currently used. Consider SvelteKit for complex routing needs.

---

## API Architecture

### OpenAPI Specification

The API contract is defined in a separate git submodule (`api/`) using OpenAPI 3.2.0:

```
api/
├── openapi.yaml          # Main entry point
├── paths/                # Endpoint definitions
│   ├── admin.yaml        # Organization & user management
│   ├── analytics.yaml    # Usage metrics & audit logs
│   ├── auth.yaml         # Authentication & onboarding
│   ├── chat.yaml         # Conversations & streaming
│   ├── common.yaml       # Health, models, files, settings
│   └── user.yaml         # Current user endpoints
└── schemas/              # Data model definitions
    ├── admin.yaml
    ├── analytics.yaml
    ├── auth.yaml
    ├── chat.yaml
    ├── common.yaml
    └── user.yaml
```

### API Domains

| Domain | Description | Auth Required |
|--------|-------------|---------------|
| Health | Service status | No |
| Auth | Login, SSO, MFA, onboarding | Varies |
| Chat | Conversations, streaming | Yes |
| User | Profile, usage, rate limits | Yes |
| Files | Upload, list, manage | Yes |
| Settings | User preferences | Yes |
| Models | Available AI models | No |
| Admin | User/org management | Yes (Admin) |
| Analytics | Cost & usage metrics | Yes (Admin) |

### Type Generation

Generate TypeScript types from OpenAPI spec:

```bash
pnpm mock:generate-types
# Output: mock/types/api.ts
```

Usage in code:

```typescript
import type { components } from '../types/api.js';

type Conversation = components['schemas']['Conversation'];
type Message = components['schemas']['Message'];
```

---

## Mock Server

### Overview

The mock server provides a fully functional API for development:

- **Framework**: Express.js 5.1.0
- **Port**: 3000 (configurable via `PORT` env var)
- **State**: In-memory (resets on restart)
- **Streaming**: Server-Sent Events (SSE) support

### Running the Mock Server

```bash
pnpm mock:dev
```

### Key Features

| Feature | Description |
|---------|-------------|
| Stateful | In-memory storage for conversations, files |
| CRUD | Full create/read/update/delete operations |
| Streaming | SSE for real-time chat responses |
| Auth | Bearer token middleware (accepts any token) |
| Example Data | Pre-seeded from `mock/examples/` |

### SSE Streaming Format

```
event: chunk
data: {"content":"Hello ","conversation_id":"..."}

event: done
data: {"conversation_id":"..."}
```

---

## Design System

### Apple Liquid Glass Theme

The application implements Apple's **Liquid Glass** design language with translucent UI elements.

### Core Principle: Strict Layering Hierarchy

Glass effects are reserved for the navigation layer only. Content uses solid surfaces for clarity.

```
Layer 1 (Background):   Base background (dark or light)
Layer 2 (Navigation):   GLASS - Header, Footer, Dropdowns
Layer 3 (Buttons):      GLASS - Interactive CTAs
Layer 4 (Content):      SOLID - Sections, Cards
Layer 5 (Labels):       PLAIN - Badges, Tags
```

### Glass Component Classes

| Class | Usage |
|-------|-------|
| `.glass` | Base glass effect |
| `.glass--clear` | Lighter glass |
| `.glass--elev1/2/3` | Shadow elevations |

### Typography

| Element | Font |
|---------|------|
| Headings | Montserrat |
| Body | Coustard (serif) |
| Code | SF Mono |

### Accessibility Features

```css
@media (prefers-reduced-motion: reduce) { animation: none; }
@media (prefers-reduced-transparency: reduce) { backdrop-filter: none; }
@media (prefers-contrast: high) { border: 2px solid; }
```

### Responsive Breakpoints

| Breakpoint | Width |
|------------|-------|
| Desktop | 1024px+ |
| Tablet | 768px - 1023px |
| Mobile | 480px - 767px |
| Small phone | < 480px |

---

## Development Workflow

### Available Scripts

```bash
# Development
pnpm dev              # Start Vite dev server
pnpm mock:dev         # Start mock API server

# Build
pnpm build            # Production build
pnpm preview          # Preview production build

# Type Checking
pnpm check            # Svelte check + TypeScript

# API Types
pnpm mock:generate-types  # Generate types from OpenAPI
```

### Typical Development Setup

1. **Terminal 1**: Frontend dev server
   ```bash
   pnpm dev
   ```

2. **Terminal 2**: Mock API server
   ```bash
   pnpm mock:dev
   ```

### API Submodule Update

When the API contract changes:

```bash
git submodule update --remote api
git add api
git commit -m "chore: update API contract"
pnpm mock:generate-types
```

---

## Architecture Decisions

### Why Svelte 5?

- Minimal runtime overhead
- Fine-grained reactivity with runes
- Excellent TypeScript support
- Simpler than React/Vue for this scale

### Why No Routing Library?

- Simple page structure currently
- Conditional rendering sufficient
- Can migrate to SvelteKit if needed

### Why Separate API Submodule?

- Single source of truth for API contract
- Enables multiple consumers (frontend, backend, SDKs)
- Version-controlled API changes
- Automated type generation

### Why Express Mock Server?

- Standalone testing, curl-friendly
- Realistic API simulation with in-memory state
- Modular route handlers in `mock/routes/`

---

*Last updated: December 2024*
