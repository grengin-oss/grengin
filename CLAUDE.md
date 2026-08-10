# Claude Code Instructions

## Project Overview
This is a client-side Svelte 5 app using Vite + TypeScript. All package management uses **pnpm**.

## Hard Rules

### Package Management
- Always use **pnpm**. Never use npm, yarn, or bun.

### API Calls
- **Always use the `request()` helper for authenticated API calls.** Import from `src/lib/api/client.ts`.
- Never use raw `fetch()` for authenticated endpoints.
- The `request()` helper handles:
  - Authorization headers (Bearer token)
  - Token refresh on 401 responses
  - Redirect to login when auth fails
- Exception: Streaming endpoints may need custom `fetch()` with their own 401 handling (see `sendMessage()` in `chatApi.ts`).

### Svelte 5
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) instead of Svelte 4 patterns.
- Use `$props()` instead of `export let`.
- Use property handlers (`onclick`) instead of `on:click`.
- Use snippets instead of slots.

## Key Files
- `src/lib/api/client.ts` - HTTP client with auth handling
- `src/lib/api/chatApi.ts` - Chat API functions
- `src/lib/features/auth/state.svelte.ts` - Auth state management
- `src/App.svelte` - Main app with route guards

## Shared LLM Provider Strategy

Before implementing, reviewing, or planning LLM provider plugin work, read and
follow `docs/llm-provider-plugin-strategy.md`. It is the shared source of truth
for Claude Code, Codex, and human contributors.

Update the strategy document before making a scope or architecture change.
