# LLM Provider Plugin Strategy

## Document Status

This document is the shared source of truth for Codex, Claude Code, and human
contributors working on the Grengin LLM provider plugin system.

Before changing provider architecture, schema, persistence, or runtime
behaviour, update this document first. Implementation decisions that conflict
with this document require an explicit design change here.

## Implementation Status

The `feat/llm-plugin` branches contain the first end-to-end implementation
slice:

- The root-level internal `llm-plugin` crate, v1 manifest schema, bounded mapping
  AST, restricted HTTP executor, SSE decoder, typed capability traits, and
  hot-swappable registry.
- Declarative chat streaming and tool continuation, embeddings, image
  generation, and model discovery integrated with the existing application
  policy, storage, and frontend SSE boundaries.
- A single provider persistence and administration model based on the existing
  `ai_engines` table and API. Custom engines store their declarative manifest
  and runtime options in nullable `pluginConfig`; API keys remain encrypted in
  the existing `apiKey` column. Built-in engines use embedded manifests and a
  null `pluginConfig`.
- Reference OpenAI-compatible and Anthropic manifests, deterministic HTTP/SSE
  tests, ignored credential-aware live smoke tests, and local mock UI coverage.
- Protocol-specific role placement in request mappings. In particular, the
  Anthropic reference manifest extracts canonical system messages into its
  top-level `system` content blocks and omits them from the user/assistant
  `messages` array.
- Declarative provider-native web search events, citation mapping, and mixed
  provider-executed search plus Grengin-executed MCP tool streams.
- Embedded provider-specific manifests for OpenAI, Anthropic, Mistral, and
  Gemini behind the same `ProviderPlugin`/`ChatSession` contract. Each built-in
  owns its native request payload, SSE mapping, web-search tools, and tool-result
  continuation declaratively; `chat_stream.rs` has one typed provider-neutral
  request, parser, MCP-result, continuation, and title-generation path.
- Database-backed lazy registry hydration for enabled declarative providers.
  A replica that did not process an AI-engine create or update request can
  compile and cache the provider from `ai_engines.pluginConfig` on its first
  request, while disabled, invalid, or undecryptable records fail closed.
- Basic provider release tracking through the manifest `version`, exposed as
  `plugin_version` in AI-engine responses. All currently tested built-in and
  reference plugins start at `1.0`.

This slice is suitable for review and controlled local testing. The following
items remain before calling the plugin contract stable or publishing a public
plugin catalogue:

- ZIP package ingestion with path/size limits, icons, licenses, fixtures,
  package signatures, and provider-author documentation.
- Versioned update history, atomic update failure records, and rollback APIs/UI.
- Additional captured parity fixtures for every built-in provider and the
  remaining embedding and image response variants. Built-in wire protocols are
  represented by embedded manifests behind `llm-plugin` capability traits
  while application orchestration stays provider-neutral.
- A DNS resolver that pins validated addresses for the actual connection,
  additional timeout/cancellation coverage, property/fuzz targets, and the
  remaining matrix of malformed tool, embedding, image, and status responses.
- Production migration rehearsal and opt-in live compatibility tests. Live
tests are never part of the default deterministic suite.

The internal crate lives at `llm-plugin/` in `grengin-api` and its Cargo
package is named `llm-plugin` (`llm_plugin` in Rust imports). Keeping it at the
repository root makes the implementation and its examples discoverable without
implying a larger nested crate hierarchy.

## Objective

Allow administrators and third-party provider authors to add hosted or
self-hosted LLM providers without modifying or recompiling Grengin. A provider
plugin is a declarative package that describes:

- Provider identity, configuration, credentials, models, and capabilities.
- HTTP endpoints and methods.
- Request headers, query parameters, content types, body encodings, and payload
  shapes for chat, image generation, and embeddings.
- Chat SSE event parsing and normalized stream events.
- Tool definitions, streamed tool calls, and tool-result continuation.
- Embedding request and response mappings.
- Image-generation request and response mappings.
- Error, token-usage, request-ID, and rate-limit extraction.

Inside Grengin, all provider operations remain type-safe and object-oriented
through Rust traits and canonical domain types. Dynamic JSON is confined to the
manifest compiler and wire-format boundary.

## Fixed Scope Decisions

The first stable plugin contract has deliberately limited transport scope.

- Plugins are JSON-based declarative data packages, not executable native or
  WASM code. "JSON-based" describes the plugin manifest, not the provider's
  request or response content type.
- Provider communication uses HTTP or HTTPS only.
- Chat streaming uses Server-Sent Events (SSE) only.
- HTTP `POST` is the default method, but a manifest may select another approved
  method when a provider requires it.
- Every operation independently configures headers, query parameters, URL path
  variables, content type, body encoding, and complete payload shape.
- Chat, image-generation, and embedding payloads are all produced by the same
  manifest mapping system; none has a hard-coded provider payload.
- Chat responses remain SSE. Embedding and image-generation response decoding
  is declared by the plugin and is not restricted to JSON-only responses.
- Provider responses are normalized into Grengin-owned typed events and
  results before reaching application code.
- Response rules may match both JSON values and their JSON types, and may
  JSON-encode selected response values when a provider emits structured tool
  arguments instead of string fragments. These are bounded mapping features,
  not arbitrary expression evaluation.
- Existing frontend SSE event names and payloads remain unchanged.

## Explicit Non-Goals

The initial system will not support:

- WebSockets, gRPC, raw TCP, provider-specific binary protocols, or NDJSON chat
  streaming.
- Arbitrary JavaScript, shell commands, JQ programs, or expression evaluation.
- Native shared libraries, WASM modules, or any other third-party executable
  plugin code.
- Direct plugin access to the database, filesystem, environment, or Grengin
  application state.
- Automatically installing or updating remote plugins without administrator
  approval.
- Allowing manifests to contain plaintext credential values.

If a future provider cannot be represented by HTTP, JSON, and SSE, support for
another transport must be proposed as a versioned host capability. It must not
be smuggled into the payload-mapping language.

## Current Architecture Problem

Provider behaviour is currently distributed across settings, chat request
construction, stream parsing, tool continuation, image generation, embeddings,
model discovery, and large provider-specific branches in the chat handler.

The migration must not begin by replacing those branches with untyped JSON.
First introduce typed internal contracts and wrap existing provider behaviour.
Only then add the declarative manifest compiler.

## Target Architecture

Start with one internal workspace crate to keep ownership clear:

```text
llm-plugin/
├── src/
│   ├── domain.rs       Canonical typed requests, events, results, and IDs
│   ├── error.rs        Typed configuration, transport, and provider errors
│   ├── traits.rs       Object-safe provider capability interfaces
│   ├── manifest.rs     Versioned Serde manifest types
│   ├── validation.rs   Schema and semantic validation
│   ├── mapping.rs      Bounded payload and response mapping language
│   ├── http.rs         Restricted HTTP executor
│   ├── sse.rs          Incremental SSE decoder
│   ├── runtime.rs      Declarative provider implementation
│   ├── registry.rs     Immutable provider registry and hot replacement
│   └── fixtures.rs     Contract-test support
├── schema/
│   └── provider-plugin-v1.schema.json
└── tests/
    ├── manifests.rs
    ├── chat_stream.rs
    ├── tool_calling.rs
    ├── embeddings.rs
    ├── image_generation.rs
    └── security.rs
```

Do not split this into several crates until the API has stabilized and a real
ownership or compile-time boundary requires it.

## Type-Safe Object Model

Use interface segregation. A provider without image support must not implement
fake image methods or return generic "unsupported" values from every call.

```rust
pub trait ProviderPlugin: Send + Sync {
    fn descriptor(&self) -> &ProviderDescriptor;
    fn chat(&self) -> Option<&dyn ChatProvider>;
    fn embeddings(&self) -> Option<&dyn EmbeddingProvider>;
    fn images(&self) -> Option<&dyn ImageProvider>;
    fn models(&self) -> Option<&dyn ModelProvider>;
}

#[async_trait]
pub trait ChatProvider: Send + Sync {
    async fn start(
        &self,
        request: ChatRequest,
    ) -> Result<Box<dyn ChatSession>, ProviderError>;
}

#[async_trait]
pub trait ChatSession: Send {
    async fn stream(&mut self) -> Result<ProviderEventStream, ProviderError>;

    async fn continue_with_tools(
        &mut self,
        results: Vec<ToolResult>,
    ) -> Result<ProviderEventStream, ProviderError>;
}
```

Use newtypes such as `ProviderId`, `ModelId`, `RequestId`, `ToolCallId`, and
`CredentialSlot` instead of passing interchangeable strings throughout the
application.

Canonical chat events should include at least:

```rust
pub enum ProviderEvent {
    MessageStart { request_id: Option<RequestId> },
    TextDelta { text: String },
    ReasoningDelta { text: String },
    ToolCallStart { id: ToolCallId, name: String, index: u32 },
    ToolArgumentsDelta { id: ToolCallId, fragment: String },
    ToolCallEnd { id: ToolCallId },
    Usage(TokenUsage),
    ProviderEvent { kind: String, data: serde_json::Value },
    Completed { finish_reason: Option<FinishReason> },
}
```

Application handlers consume only these types. They must not inspect provider
JSON paths or provider names.

Provider-native tools follow the same boundary. The application supplies a
typed capability request such as `web_search: true`; the provider manifest owns
the provider-specific tool type, version, and payload. Browser-supplied generic
configuration must not inject raw provider-native tool definitions. Providers
that omit tool-call IDs are normalized to stable stream-local IDs before events
reach the application lifecycle code.

## Provider Package

A plugin is a directory during development and a ZIP archive for distribution:

```text
my-provider.grengin-provider/
├── provider.json
├── config.schema.json
├── icon.svg
├── LICENSE
└── fixtures/
    ├── chat-request.json
    ├── chat-stream.sse
    ├── tool-stream.sse
    ├── embedding-response.json
    ├── image-response.json
    └── image-response.bin
```

`provider.json` follows JSON Schema 2020-12 and includes a mandatory
`manifestVersion`. Unknown major versions fail closed. Unknown fields fail
validation unless the schema explicitly marks them as forward-compatible
metadata.

## Manifest Outline

The following is an outline, not the final complete schema:

```json
{
  "$schema": "https://grengin.com/schemas/provider-plugin-v1.json",
  "manifestVersion": "1.0",
  "id": "example-self-hosted",
  "version": "1.0",
  "name": "Example Self-hosted Provider",
  "baseUrl": "https://llm.example.com",
  "credentials": [
    { "id": "api_key", "type": "secret", "required": true }
  ],
  "capabilities": {
    "chat": { "streaming": true, "tools": true, "vision": false },
    "embeddings": true,
    "imageGeneration": true
  },
  "operations": {
    "chatStream": {
      "method": "POST",
      "path": "/v1/chat/completions",
      "headers": {
        "Authorization": { "secret": "api_key", "prefix": "Bearer " },
        "Content-Type": { "literal": "application/json" }
      },
      "body": {
        "model": { "$get": "request.model" },
        "messages": { "$map": "request.messages", "using": "message" },
        "tools": { "$map": "request.tools", "using": "tool" },
        "stream": { "$literal": true }
      },
      "response": {
        "transport": "sse",
        "doneData": "[DONE]",
        "rules": [
          {
            "emit": "textDelta",
            "value": "/choices/0/delta/content"
          }
        ]
      }
    },
    "embeddings": {
      "method": "POST",
      "path": "/v1/embeddings",
      "bodyEncoding": "json",
      "body": {
        "model": { "$get": "request.model" },
        "input": { "$get": "request.inputs" }
      },
      "response": {
        "bodyEncoding": "json",
        "vectors": "/data"
      }
    },
    "imageGeneration": {
      "method": "PUT",
      "path": "/v1/images",
      "bodyEncoding": "multipart",
      "body": {
        "prompt": { "$get": "request.prompt" },
        "images": { "$map": "request.inputImages", "using": "imagePart" }
      },
      "response": {
        "bodyEncoding": "binary"
      }
    }
  }
}
```

`manifestVersion` and `version` are intentionally different. The former
selects the Grengin manifest schema and host contract. The latter identifies a
provider plugin release and uses the basic `MAJOR.MINOR` format. The v1 parser
also accepts an optional numeric patch component for existing custom manifests.
Tested reference and built-in plugins begin at `1.0`; authors increment the
minor number for compatible payload, endpoint, model, or mapping updates and
the major number for behaviour changes requiring administrator review. The
current AI-engine API exposes the active release as `plugin_version`. Full
version history, rollback, and automatic update policy remain future lifecycle
work.

The final schema must separately define provider metadata, administrator
configuration, secrets, model catalogues, operation request mappings, body
encodings, and response rules. Do not place all fields in one unstructured
object.

## Per-Operation Wire Contract

The manifest is JSON, but each operation owns its complete HTTP wire contract.
Chat, image generation, and embeddings may therefore use different methods,
headers, query parameters, content types, and payload structures within the
same plugin.

Initial request body encodings should include:

- `json`: construct any JSON object, array, scalar, or nested provider payload.
- `form`: construct `application/x-www-form-urlencoded` fields.
- `multipart`: construct text, JSON, and approved attachment parts.
- `text`: construct a UTF-8 request body.
- `binary`: pass through an explicitly selected attachment for an operation
  that accepts a raw binary body.

Initial response body decoders should include:

- `sse`: mandatory for chat streaming, with each event decoded as JSON or text
  according to the operation mapping.
- `json`: extract structured values through validated selectors.
- `text`: extract or transform a bounded UTF-8 body.
- `binary`: accept direct image bytes after content-type and size validation.

This is payload flexibility over a fixed HTTP transport. It does not introduce
arbitrary network protocols or executable plugin logic.

## Request Mapping Language

The mapping language is a small JSON abstract syntax tree, not string-based
code. It can emit the operation's configured body encoding, so using a JSON
manifest does not force the resulting provider payload to be JSON. Initially
support only reviewed operators:

- `$literal`: emit a constant JSON value.
- `$get`: read a value from a documented canonical request path.
- `$map`: map a canonical array through a named mapping definition.
- `$object`: construct an object from child mappings.
- `$array`: construct an array from child mappings.
- `$if`: choose between mappings using a typed boolean condition.
- `$switch`: map canonical enum values such as message roles.
- `$merge`: merge explicitly mapped objects.
- `$omitIfNull`: omit an optional provider field.
- `$jsonEncode`: encode a mapped JSON value as a string for providers that
  stream tool arguments as JSON text.
- `$base64`: encode approved binary input such as an image attachment.

A named `$map` definition may deliberately omit an entry through a conditional
mapping with no selected output. This is the bounded filtering mechanism for
protocol differences such as providers that place system instructions outside
their conversation-message array; provider-specific role handling must remain
in the manifest rather than re-entering application handlers.

Every operator must have a strongly typed Rust enum representation. Avoid a
generic interpreter built from arbitrary string operations.

URL and header templates may reference only declared variables and credential
slots. They may not read environment variables or arbitrary application state.

## Response and SSE Mapping

The host owns SSE framing. The plugin only maps each decoded `data` value.

The SSE decoder must correctly support comments, keepalive events, CRLF, blank
line delimiters, multiple `data:` lines, events split across network chunks,
UTF-8 split across chunks, and a configurable completion sentinel.

For JSON event data, response rules use RFC 6901 JSON Pointers and typed
conditions to produce canonical events. Text event data uses bounded typed
extractors rather than arbitrary regular-expression programs. Supported rules
must cover:

- Request and response IDs.
- Text and reasoning deltas.
- Tool-call ID, name, index, and argument fragments.
- Input, output, cached-input, and cache-creation token usage.
- Finish reasons.
- Provider errors delivered inside an HTTP 200 SSE stream.
- Rate-limit and quota classifications.

Canonical `inputTokens` always means total billed input tokens, including any
cache-read and cache-creation buckets. Providers differ here: OpenAI reports
cached tokens as a subset of input tokens, while Anthropic reports regular,
cache-read, and cache-creation input as separate buckets. A usage mapping must
therefore be able to declare independently whether its source `inputTokens`
already includes `cachedInputTokens` and `cacheCreationTokens`. Both declarations
default to included for backward compatibility. The runtime normalizes excluded
buckets into canonical input and total token counts before emitting usage; cost
calculation operates only on those canonical counters and must never infer a
provider from its name.

Tests must cover inclusive and exclusive cache accounting, independent cache
read/write rates, missing-rate fallback, multiple tool rounds, and overflow or
malformed counters. Reference manifests must map every cache counter exposed by
their provider protocol.

Missing optional pointers produce no event. Missing required pointers produce
a typed mapping error containing the plugin ID and rule ID, never credentials
or full prompt content.

## Tool Calling and Continuation

Grengin remains responsible for tool authorization, MCP execution, result
storage, maximum rounds, cancellation, and frontend events. Plugins only map
between canonical tool types and provider wire formats.

The manifest must define:

- How canonical tool definitions become provider request objects.
- How tool choice and parallel-tool settings are represented.
- How streamed tool calls are identified and accumulated.
- Whether tool arguments arrive as objects or JSON-string fragments.
- How assistant tool calls and tool results are represented in continuation
  messages.
- Which response values must be captured for the next request, such as a
  response ID or conversation ID.

The default continuation mode replays canonical conversation history. Optional
captured state may be referenced through declared `session.*` paths. Provider
state remains encapsulated in `ChatSession`.

The host rejects duplicate completed tool-call IDs, malformed final arguments,
unknown tools, and continuation beyond the configured maximum round count.

## Embedding Contract

`EmbeddingProvider` accepts a typed model, ordered input list, and optional
target dimensions. The manifest maps these values into one or more configured
HTTP payloads and maps the declared response format back to indexed vectors.

The runtime must validate:

- Exactly one output per input unless the provider operation explicitly uses
  per-input requests.
- Stable ordering by returned index.
- Finite floating-point values only.
- Consistent dimensions across the batch.
- Configured dimension compatibility.
- Maximum batch size and payload size.

Embedding generation in RAG and semantic search must share this one provider
path rather than retaining duplicate provider branches.

## Image-Generation Contract

`ImageProvider` accepts a typed prompt, model, input images, output count, size,
quality, and supported provider options. The manifest controls the complete
request payload and can extract base64 image data or approved HTTPS image URLs
from a structured response, or accept validated image bytes directly.

The host validates content type, decoded size, image count, download URL, and
maximum response size before saving a file. Downloads use the same SSRF rules
as provider endpoints and do not forward provider credentials to another host.

## Models and Capabilities

A plugin can supply models through either:

- An inline model catalogue in `provider.json`.
- A configurable HTTP model-list operation with request and response mappings.

Model capabilities are data, not assumptions inferred from provider names.
They include streaming, tools, vision, PDF input, image generation, embeddings,
dimensions, context limits, and optional pricing metadata.

Pricing metadata uses USD per million tokens for regular input, output,
cache-read input, and cache-creation input. A missing cache rate falls back to
the regular input rate so accounting does not silently underestimate spend. A
provider may enable protocol-native caching through its ordinary declarative
request payload, but the matching cache rates and usage pointers must be tested
together. Reference pricing is versioned data and must be reviewed when a
provider changes its published rates.

Admin model whitelists and department policies continue to operate on the
canonical `(provider_id, model_id)` pair.

## Registry and Lifecycle

The provider registry stores immutable `Arc<dyn ProviderPlugin>` instances.

Installation follows this order:

1. Read the package with strict archive size and path limits.
2. Validate the JSON Schema version.
3. Deserialize into `ProviderManifestV1` using `deny_unknown_fields` where
   appropriate.
4. Run semantic validation across capabilities and operations.
5. Compile mappings and JSON Pointers before the plugin can be enabled.
6. Validate endpoint and credential policy.
7. Run fixture and administrator-requested connection tests.
8. Atomically add or replace the immutable provider instance.

In-flight requests retain their existing `Arc`. New requests use the new
version. A failed update leaves the previous provider active and records the
validation failure.

The registry is process-local, while provider definitions and encrypted
credentials are durable in `ai_engines`. On a registry miss, a request may
load only an enabled engine from persistence. A custom engine is compiled from
its `pluginConfig`; a built-in engine is compiled from its embedded manifest.
The resulting immutable provider is atomically cached in that process.
Missing, disabled, invalid, or undecryptable records fail closed. This lazy
hydration is required for multi-replica deployments where an AI-engine create
or update request is handled by only one replica; startup loading remains the
eager fast path.

## Persistence and Secrets

Use the existing `ai_engines` row as the single persisted provider installation
and policy record. Do not create a parallel provider-plugin CRUD resource.

- `engineKey`, `displayName`, `isEnabled`, model whitelist, default models,
  validation status, and timestamps keep their existing meanings.
- `apiKey` stores the provider's single v1 secret encrypted with the existing
  application key. Self-hosted plugins may declare no credential. A future
  manifest version may add a dedicated encrypted credential map if a real
  provider requires multiple independent secrets; plaintext credentials must
  never be placed in `pluginConfig`.
- Nullable `pluginConfig` is a typed JSON object containing the custom provider
  manifest plus administrator runtime settings: `configuration`, optional base
  URL override, and explicit local/private-network allowances.
- A null `pluginConfig` identifies an embedded built-in provider. The runtime
  resolves its manifest by `engineKey`, while all product policy still comes
  from the same AI-engine row.
- The active provider release is read from `manifest.version`: custom releases
  remain durable inside `pluginConfig`, while built-in releases come from their
  embedded manifests. `plugin_version` is therefore exposed without a redundant
  database column.
- The custom manifest ID must exactly equal `engineKey`. Custom engine keys may
  not replace reserved built-in keys.

The existing `/admin/ai-engines` API owns list, create, read, update, validate,
connection test, enable/disable, API-key removal, and custom-engine deletion.
Schema retrieval and manifest preflight validation may remain action endpoints
under `/admin/ai-engines`, but there is no separate `/admin/provider-plugins`
CRUD surface.

Both development migration identities, `create_provider_plugins` and
`add_plugin_config_to_ai_engines`, reached databases and are therefore immutable
history. Keep both migration files registered so SeaORM accepts either history,
then use a later reconciliation migration to remove the obsolete provider tables
only when they are empty. Never repair this divergence by editing
`seaql_migrations` directly. If either legacy table contains installation data,
the reconciliation migration must fail without dropping anything; migrate the
data forward explicitly rather than silently discarding encrypted key material
or an unsupported multi-secret installation.

Credential values remain encrypted with the existing application key. APIs
return only configured status and a safe preview. Logs, errors, fixtures, audit
records, and exported plugin packages must never contain decrypted secrets.

Messages persist normalized cache-read and cache-creation counters alongside
the canonical input/output totals and calculated cost. Conversation APIs expose
those counters so billing can be audited without retaining provider payloads.

## Security Requirements

- Only administrators with AI-platform management permission can install,
  configure, test, enable, disable, update, or remove plugins.
- HTTPS is required by default. HTTP is allowed only for explicit local or
  private self-hosted configuration acknowledged by an administrator.
- Resolve and validate destination addresses to prevent SSRF and DNS rebinding.
- Block cloud metadata, loopback, link-local, multicast, and private ranges by
  default.
- Preserve the existing no-redirect HTTP policy.
- Reject `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Cookie`,
  forwarding headers, and other hop-by-hop or authority-changing headers.
- Credential slots can be used only in fields explicitly permitted by the
  manifest schema.
- Enforce request, response, header, event, image, and decoded-body size limits.
- Enforce connect, first-byte, idle-stream, and total-operation timeouts.
- Never automatically retry a streaming request after response bytes arrive;
  doing so can duplicate billing or tool execution.
- Redact credentials and prompt content from normal telemetry.
- Show administrators the final provider hostnames and data destination before
  enabling a plugin.

## Error Model and Observability

Use a typed `ProviderError` hierarchy covering manifest validation,
configuration, authentication, HTTP status, timeout, cancellation, SSE framing,
response mapping, quota, malformed tool calls, and unsupported capabilities.

Map these errors into existing Grengin API and SSE error contracts at the
application boundary. Provider manifests must not define arbitrary frontend
error event names.

Record provider ID, plugin version, operation, model, duration, HTTP status,
retry count, token usage, and normalized error class. Do not record secrets,
full headers, prompts, model responses, embeddings, or generated images by
default.

## Migration Plan

### Phase 1: Characterize Existing Behaviour

- Add fixture-based tests for OpenAI, Anthropic, Gemini, and Mistral chat
  streams, tool calls, usage, errors, embeddings, and image generation.
- Freeze the existing Grengin frontend SSE contract with integration tests.
- Document provider-specific continuation behaviour currently embedded in the
  chat handler.

### Phase 2: Introduce Typed Core and Registry

- Add the root-level internal `llm-plugin` crate.
- Add canonical requests, events, results, errors, and capability traits.
- Wrap current provider implementations as native internal adapters.
- Route provider lookup through `ProviderRegistry` without changing wire
  behaviour.

### Phase 3: Extract Orchestration

- Move request construction and SSE normalization out of the chat handler.
- Keep tool authorization and execution in the application layer.
- Move provider continuation state behind `ChatSession`.
- Route title generation through the same canonical chat interface.
- Complete this phase provider by provider with parity fixtures. Do not replace
  native OpenAI Responses, Anthropic Messages, Mistral Conversations, or Gemini
  streaming behaviour with a lowest-common-denominator endpoint merely to make
  the handler generic.

### Phase 4: Unify Embeddings and Images

- Replace duplicated RAG and search embedding branches with
  `EmbeddingProvider`.
- Route image generation through `ImageProvider`.
- Preserve existing file storage, accounting, and policy behaviour.

### Phase 5: Declarative Manifest Runtime

- Finalize and publish the v1 JSON Schema.
- Implement the bounded mapping language and manifest compiler.
- Implement generic HTTP payload encoding, response decoding, and SSE
  execution.
- Convert one OpenAI-compatible provider into a manifest as the reference
  implementation.
- Convert remaining built-in providers only after parity tests pass.

### Phase 6: Administration and Distribution

- Extend the existing AI-engine create/update/read/delete actions with manifest
  upload, preflight validation, connection test, enable/disable, and removal.
  Do not expose a second provider-plugin CRUD API or admin concept.
- Add the corresponding controls to the existing AI-engine admin UI.
- Publish a provider-authoring guide, schema documentation, fixture harness,
  and reference self-hosted plugin.
- Add package digests and optional signatures before introducing any public
  plugin catalogue.

## Cargo Test Strategy

All Rust builds and tests use at most two jobs:

```bash
cargo test -p llm-plugin -j 2
cargo test --workspace --all-features -j 2
```

### Local Live-Provider Credentials

The development machine keeps optional provider credentials in:

```text
/home/anurag/work/secrets/grengin.sh
```

It currently defines these credential variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `MISTRAL_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPEN_ROUTER_API_KEY`
- `CEREBRAS_API_KEY`
- `DEEPSEEK_API_KEY`

This file is local-only test infrastructure. It must never be copied into the
repository, Docker image, release archive, test fixture, log, or CI artifact.
Agents must never print its values, run shell tracing while it is sourced, or
include environment dumps in test output.

Normal unit, integration, parser, mapping, security, and edge-case tests remain
fully deterministic and use local mock HTTP/SSE servers. Invalid payloads,
fragmented streams, 429 responses, timeouts, malformed tool calls, and similar
edge cases must not be produced by deliberately abusing or exhausting live
provider APIs.

Live provider tests are opt-in smoke and compatibility checks. Mark them
ignored by default and require `GRENGIN_LIVE_PROVIDER_TESTS=1`. Run them with
one test thread to control cost and provider rate limits:

```bash
set +x
set -a
source /home/anurag/work/secrets/grengin.sh
set +a
GRENGIN_LIVE_PROVIDER_TESTS=1 \
  cargo test -p llm-plugin --test live_providers -j 2 -- \
  --ignored --test-threads=1
```

The live test harness must:

- Discover configured providers by known variable name without logging the
  value.
- Skip a provider with a clear non-secret reason when its key is absent.
- Use minimal prompts, token limits, embedding inputs, and tool schemas.
- Disable image-generation smoke tests unless
  `GRENGIN_LIVE_IMAGE_TESTS=1` is also set because image calls can incur
  materially higher cost.
- Apply strict connect, first-byte, idle, and total timeouts.
- Avoid automatic retries after any response bytes are received.
- Redact authorization headers, query credentials, provider response bodies,
  and prompt content from failure messages.
- Write generated outputs only to temporary directories and remove them after
  the test.
- Assert canonical Grengin events and results rather than provider-specific
  implementation details.

CI must obtain equivalent variables from its secret manager. CI must not
depend on the local absolute path or upload live-test request/response bodies as
artifacts.

Required unit and integration coverage includes:

- Valid, invalid, incomplete, duplicate, and unknown-version manifests.
- Unknown fields, invalid capability combinations, missing operations, and
  references to undeclared credentials or variables.
- Invalid URLs, blocked address ranges, redirects, dangerous headers, and
  secret redaction.
- Every mapping operator, type mismatch, missing required path, null handling,
  array mapping, role conversion, and deterministic output.
- Provider-specific role placement, including multiple canonical system
  messages, exclusion from the normal message array, and preservation across
  tool-result continuation requests.
- SSE comments, keepalives, CRLF, multiline data, fragmented frames, fragmented
  UTF-8, blank events, completion sentinels, abrupt EOF, and oversized events.
- HTTP 200 provider-error events and 400, 401, 403, 404, 408, 429, and 5xx
  responses.
- `Retry-After`, timeout, cancellation, disconnect-before-first-byte, and
  disconnect-after-partial-output behaviour.
- One, multiple, parallel, interleaved, duplicated, and malformed tool calls.
- Tool argument fragments split at every possible byte boundary.
- Unknown tool names, missing IDs, repeated indices, invalid final JSON, tool
  failures, and maximum continuation rounds.
- Usage sent at start, during deltas, at completion, duplicated, partial, or
  missing.
- Ordered and out-of-order embeddings, empty batches, dimension mismatches,
  missing vectors, extra vectors, `NaN`, infinity, and oversized batches.
- Base64 image responses, direct binary image responses, HTTPS image URLs,
  wrong MIME type, invalid base64, oversized images, partial multi-image
  responses, and cross-host credential stripping.
- Registry replacement during active streams, failed updates, rollback, and
  concurrent lookup.
- Parity fixtures for every built-in provider.
- End-to-end confirmation that the frontend receives unchanged Grengin SSE
  events regardless of provider plugin.

Parser and mapping modules should additionally receive property tests or fuzz
targets. Fuzz failures must become deterministic regression tests.

No default test may require a real provider credential or public network
access. Live provider smoke tests belong only in the explicitly invoked local
command above or a secret-aware CI job.

## Acceptance Criteria

- A third party can add an HTTP/SSE provider without changing Grengin source.
- A self-hosted OpenAI-compatible provider can be configured with a private
  base URL after explicit administrator approval.
- Provider-specific methods, headers, content types, payload encodings, payload
  shapes, stream paths, tool calls, usage, errors, embeddings, and image
  responses are defined declaratively for each operation.
- Application code contains no provider-name branches for chat, embeddings, or
  image generation after migration is complete.
- Unsupported capabilities are rejected before a request is sent.
- Existing model policy, budget accounting, RAG, MCP tools, cancellation,
  audit, and frontend SSE behaviour continue to work.
- Invalid or malicious plugins fail closed without disrupting enabled
  providers.
- Plugin updates are atomic and reversible.
- Secrets never appear in manifests, logs, fixtures, API responses, or errors.
- All required Cargo tests pass with two jobs.

## Agent Coordination Rules

- Both Codex and Claude Code must read this document before provider-plugin
  implementation or review.
- Treat this document as architecture, not as optional background material.
- Record scope changes and accepted design decisions here before coding them.
- Keep implementation phases independently reviewable and avoid mixing schema,
  persistence, runtime, admin UI, and provider migration in one change.
- Preserve characterization fixtures while refactoring; do not rewrite fixtures
  merely to make a regression pass.
- Do not add executable plugin support or another transport without explicit
  approval and a versioned strategy update.
