// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Admin types - User management related types only

export interface User {
  id: string;
  sub: string;
  email: string;
  name?: string;
  role?: string;
  roles?: string[];
  status?: string;
  department?: string;
  department_id?: string;
  is_super_admin?: boolean;
  has_password?: boolean;
  mfa_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface PaginatedUsers {
  users: User[];
  total: number;
  limit: number;
  offset: number;
}

export interface SSOProvider {
  id: string;
  provider: string;
  name: string;
  client_id: string;
  client_secret_preview: string;
  issuer_url: string;
  redirect_url: string;
  allowed_domains: string[];
  is_enabled: boolean;
  tenant_id?: string;
  /** Fixed OIDC scopes the provider is asked for; the API defaults these. */
  scopes?: string[];
  created_at: string;
  updated_at: string;
}

export interface EditableField {
  editable: boolean;
  value: string;
}

export interface SSOProviderDetails {
  id: string;
  provider: EditableField;
  name: EditableField;
  client_id: EditableField;
  client_secret_preview?: EditableField;
  issuer_url: EditableField;
  redirect_url: EditableField;
  tenant_id?: EditableField;
  allowed_domains: string[];
  is_enabled: boolean;
  /** Fixed OIDC scopes the provider is asked for; the API defaults these. */
  scopes?: string[];
  /**
   * JIT account creation on first sign-in. Both the detail and update payloads
   * use `jit_provisioning`. Declared here so reading it back needs no cast.
   */
  jit_provisioning?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIEngine {
  engine_key: string;
  display_name: string;
  /**
   * Brand mark from the engine registry. Arrives either as raw inline SVG
   * markup or as a URL/data URI — render it through `providerIconSvg` /
   * `providerIconUrl` (src/lib/utils/providerIcon.ts), never straight into
   * an `<img src>`.
   */
  icon?: string;
  /** Variant for dark surfaces, when the registry ships one. */
  icon_dark?: string;
  is_enabled: boolean;
  api_key_configured: boolean;
  api_key_status?: 'valid' | 'in_valid' | 'not_validated' | 'not_configured';
  api_key_preview?: string | null;
  api_key_last_validated_at?: string | null;
  whitelisted_models?: string[];
  default_model?: string | null;
  updated_at?: string | null;
}

/**
 * Payload for creating a custom, OpenAI-compatible engine
 * (ai-engines.html "Add Custom Engine"). The API takes the parsed Plugin JSON as
 * `plugin_config.manifest` and the serving endpoint as `plugin_config.baseUrlOverride`;
 * it rejects a top-level `base_url`.
 */
export interface CustomAIEngineCreate {
  display_name: string;
  plugin_config: {
    manifest: Record<string, unknown>;
    baseUrlOverride: string;
  };
  api_key?: string;
}

export type McpAuthType = 'none' | 'api_key' | 'oauth2';
export type McpAuthMode = 'organization' | 'per_user';
export type McpOAuthProvider = 'atlassian' | 'google' | 'github' | 'slack' | 'custom';

export interface McpOrgConnection {
  connected: boolean;
  connected_as: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
  scopes: string[];
}

export interface MCPServer {
  id: string;
  name: string;
  description: string | null;
  /** Published icon URL (native connector plugins); null for custom servers. */
  icon: string | null;
  transport_type: string;
  connection_config: Record<string, unknown>;
  client_id: string | null;
  client_secret_configured: boolean;
  client_secret_preview: string;
  url: string | null;
  enabled: boolean;
  status: string;
  status_message: string | null;
  tool_count: number;
  default_access: string | null;
  last_connected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  auth_type: McpAuthType;
  auth_mode: McpAuthMode | null;
  oauth_provider: McpOAuthProvider | null;
  scopes: string[] | null;
  auth_url: string | null;
  token_url: string | null;
  org_connection: McpOrgConnection | null;
  connected_users_count: number | null;
}

export interface MCPServerListResponse {
  servers: MCPServer[];
  total: number;
}

export type McpAccessType = 'role' | 'department' | 'user';
export type McpPermission = 'full' | 'read_only' | 'denied';
export type McpDefaultAccess = 'all_users' | 'admin_only' | 'explicit_only';

export interface McpAccessRule {
  id: string;
  access_type: McpAccessType;
  permission: McpPermission;
  role_id: string | null;
  role_name: string | null;
  department_id: string | null;
  department_name: string | null;
  user_id: string | null;
  user_email: string | null;
  inherit_departments: boolean;
  priority: number;
}

export interface McpServerAccessResponse {
  server_id: string;
  default_access: McpDefaultAccess | null;
  rules: McpAccessRule[];
}

export interface McpAccessRuleCreatePayload {
  access_type: McpAccessType;
  permission: McpPermission;
  role_id?: string;
  role_name?: string;
  department_id?: string;
  user_id?: string;
  inherit_departments?: boolean;
}

export interface McpServerAccessUpdatePayload {
  default_access: McpDefaultAccess | null;
  rules: McpAccessRuleCreatePayload[];
}

export interface McpToolAccess {
  tool_id: string;
  tool_name: string;
  server_id: string;
  inherit_from_server: boolean;
  rules: McpAccessRule[];
}

export interface McpToolAccessUpdatePayload {
  inherit_from_server: boolean;
  rules: McpAccessRuleCreatePayload[];
}

export interface McpBulkToolAccessUpdatePayload {
  tools: Array<{
    tool_id: string;
    inherit_from_server: boolean;
    rules: McpAccessRuleCreatePayload[];
  }>;
}

export interface McpBulkToolAccessResponse {
  tools: McpToolAccess[];
  updated_count: number;
}

// ---------------------------------------------------------------------------
// Connector / MCP-server detail overview (native connector-plugin contract).
// Shapes mirror the grengin-api Swagger for:
//   GET /admin/mcp-servers/{server_id}/overview
//   GET /admin/mcp-servers/{server_id}/people
//   GET /admin/mcp-servers/{server_id}/executions
//   PUT /admin/mcp-servers/{server_id}/tools/{tool_id}
// ---------------------------------------------------------------------------

/** Per-user connection state against a connector. */
export type McpConnectionState =
  | 'connected'
  | 'not_connected'
  | 'needs_reconnect'
  | 'unavailable';

/** Per-user authentication method a connector exposes. */
export type McpAuthenticationMethod =
  | 'oauth2'
  | 'api_token'
  | 'grengin_broker'
  | 'server_managed'
  | 'unavailable';

/** State of a tool topic/capability group. */
export type McpTopicGroupState = 'enabled' | 'disabled' | 'partial';

/**
 * A single tool as returned inside the server overview. Matches
 * `McpToolDetail` (src/lib/types/integrations.ts) field-for-field.
 */
export interface McpOverviewTool {
  description: string;
  enabled: boolean;
  id: string;
  inherit_access_from_server: boolean;
  input_schema: Record<string, unknown>;
  is_read_only: boolean;
  last_synced_at: string;
  name: string;
  original_name: string;
  parameters: Record<string, unknown>;
  server_id: string;
  server_name: string;
}

/** Grouping of tools by topic/capability. */
export interface McpTopicGroup {
  id: string;
  name: string;
  description: string;
  state: McpTopicGroupState;
  tool_ids: string[];
}

/** Catalog/plugin identity + per-user auth metadata for the connector. */
export interface McpServerIntegration {
  authentication: McpAuthenticationMethod;
  per_user_credentials: boolean;
  plugin_id: string;
  plugin_version: string;
  suggested_prompts: string[];
  supported_authentication: McpAuthenticationMethod[];
}

/** Seven-day usage summary from recorded tool executions. */
export interface McpUsageSummary {
  tool_calls: number;
  successful_tool_calls: number;
  failed_tool_calls: number;
  period_start: string;
  period_end: string;
}

/** Access block embedded in the overview (adds server_name over McpServerAccessResponse). */
export interface McpOverviewAccess {
  server_id: string;
  server_name: string;
  default_access: McpDefaultAccess;
  rules: McpAccessRule[];
}

export interface McpServerOverview {
  server_id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  default_access: McpDefaultAccess;
  my_connection_state: McpConnectionState;
  active_user_count: number;
  connected_user_count: number;
  reminders_supported: boolean;
  write_confirmation_supported: boolean;
  integration: McpServerIntegration;
  access: McpOverviewAccess;
  tools: McpOverviewTool[];
  topic_groups: McpTopicGroup[];
  usage: McpUsageSummary;
}

/**
 * A workspace member row on the connector People panel.
 *
 * NOTE: the /people response body was not included in the supplied Swagger
 * samples, so these fields are inferred from the doc ("connected/reconnect
 * states and profile data") and the overview's connection-state vocabulary.
 * Verify against the real GET /admin/mcp-servers/{id}/people schema.
 */
export interface McpServerPerson {
  user_id: string;
  user_email: string;
  name: string | null;
  avatar_url: string | null;
  connection_state: McpConnectionState;
  connected_at: string | null;
  last_active_at: string | null;
}

export interface McpServerPeopleResponse {
  people: McpServerPerson[];
  limit: number;
  offset: number;
  total: number;
}

/** One audit-log row: a single tool execution. */
export interface McpExecution {
  id: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  user_id: string;
  user_email: string;
  conversation_id: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  is_error: boolean;
  duration_ms: number;
  executed_at: string;
}

export interface McpExecutionListResponse {
  executions: McpExecution[];
  limit: number;
  offset: number;
  total: number;
}

/** PUT /admin/mcp-servers/{server_id}/tools/{tool_id} body. */
export interface McpToolUpdatePayload {
  enabled: boolean;
}

/** Pagination query for the people / executions lists. */
export interface McpPaginationParams {
  limit?: number;
  offset?: number;
}

export interface AIEngineModel {
  model_id: string;
  display_name: string;
  is_whitelisted: boolean;
  /**
   * Registry model type when the backend exposes it on the engine models
   * endpoint (extended /models feature). May be absent on older responses;
   * callers fall back to a name-based heuristic. See `isImageEngineModel`.
   */
  model_type?: 'text_generator' | 'image_generator' | 'text_embedder';
  capabilities?: {
    vision?: boolean;
    function_calling?: boolean;
    streaming?: boolean;
  };
}

export interface AIEngineModels {
  models: AIEngineModel[];
}

export interface BrandingSettings {
  sso_providers?: string[];
  default_engine?: string;
  default_model?: string;
  data_retention_days?: number;
  require_mfa?: boolean;
}

export interface Branding {
  id?: string;
  name: string;
  domain: string;
  allowed_domains?: string[];
  logo_url?: string;
  settings: BrandingSettings;
  created_at?: string;
  updated_at?: string;
}

// Type for PUT request body (requires all fields except id, created_at, updated_at)
export interface UpdateBrandingRequest {
  name: string;
  domain: string;
  allowed_domains?: string[];
  logo_url?: string;
  settings: BrandingSettings;
}

export interface TopModel {
  model_name: string;
  model_provider: string;
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  /** Optional: only sent by backends that aggregate per-model latency. */
  average_latency?: number;
}

export interface AnalyticsOverview {
  active_users: number;
  average_requests_per_user: number;
  cost_growth_rate: number;
  request_growth_rate: number;
  token_growth_rate: number;
  top_models: TopModel[];
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  total_users: number;
}

export interface TimeseriesDataPoint {
  average_latency: number;
  error_count: number;
  success_count: number;
  timestamp: string;
  total_cost: number;
  total_requests: number;
  total_tokens: number;
}

export interface AnalyticsTimeseries {
  data: TimeseriesDataPoint[];
  granularity: string;
}

export interface UserAnalyticsItem {
  user_id: string;
  user_name: string;
  user_email: string;
  department: string;
  total_requests: number;
  success_count: number;
  error_count: number;
  total_tokens: number;
  total_cost: number;
  average_latency: number;
  last_activity: string;
}

export interface UserAnalyticsResponse {
  users: UserAnalyticsItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type ActionOnExceed = 'warn' | 'block';

export interface AllowedModel {
  model: string;
  provider: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  admin_ids: string[];
  path: string;
  depth: number;
  child_count: number;
  member_count: number;
  total_member_count: number;
  budget_allocated: number;
  budget_distributed: number;
  budget_available: number;
  budget_used: number;
  budget_period: BudgetPeriod;
  action_on_exceed?: ActionOnExceed;
  allowed_models?: AllowedModel[] | null;
  created_at: string;
  updated_at: string;
  children?: Department[];
}

export interface DepartmentListResponse {
  departments: Department[];
  total: number;
}

export interface DepartmentTreeResponse {
  tree: Department[];
}

export interface CreateDepartmentRequest {
  name: string;
  description: string;
  parent_id?: string | null;
  admin_ids?: string[];
}

export interface UpdateDepartmentRequest {
  name?: string;
  description?: string;
  parent_id?: string | null;
  admin_ids?: string[];
}

export interface SetBudgetRequest {
  budget_allocated: number;
  budget_period: BudgetPeriod;
  action_on_exceed: ActionOnExceed;
  allowed_models?: AllowedModel[] | null;
}

export interface DepartmentMember {
  user_id: string;
  user_name: string;
  user_email: string;
  role: string;
  joined_at: string;
}

export interface DepartmentMembersResponse {
  members: User[];
  total: number;
}

export interface DepartmentAnalyticsItem {
  department: string;
  total_users: number;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  average_latency: number;
  success_count: number;
  error_count: number;
}

export interface DepartmentAnalyticsResponse {
  departments: DepartmentAnalyticsItem[];
  total: number;
  limit: number;
  offset: number;
  total_pages: number;
}

export interface SubDepartmentBudget {
  allocated: number;
  department_id: string;
  name: string;
  used: number;
}

export interface BudgetOverview {
  budget_allocated: number;
  budget_available: number;
  budget_distributed: number;
  budget_used: number;
  budget_used_total: number;
  department_id: string;
  period: BudgetPeriod;
  period_end: string;
  period_start: string;
  sub_department_budgets: SubDepartmentBudget[];
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: AuditLogDetails;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface AuditLogDetails {
  after: any;
  before: any;
  changed_fields: string[];
  method: string;
  path: string;
  query: any;
  route: string;
  status_code: number;
  success: boolean;
}

export interface RoleUserAssignment {
  id: string;
  role_id: string;
  scope_department_id?: string | null;
}

export interface PaginatedAuditLogs {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface SystemMetricsDisk {
  availableSpaceBytes: number;
  mountPoint: string;
  totalSpaceBytes: number;
}

export interface SystemMetricsContainer {
  cgroupVersion: string;
  cpuQuotaCores: number;
  cpuUsageSeconds: number;
  insideContainer: boolean;
  memoryAvailableBytes: number;
  memoryLimitBytes: number;
  memoryUsageBytes: number;
}

export interface SystemMetricsDatabase {
  activeConnections: number;
  blksHit: number;
  blksRead: number;
  databaseSizeBytes: number;
  idleConnections: number;
  numbackends: number;
  roundtripLatencyMs: number;
  totalConnections: number;
  tupDeleted: number;
  tupFetched: number;
  tupInserted: number;
  tupReturned: number;
  tupUpdated: number;
  xactCommit: number;
  xactRollback: number;
}

export interface SystemMetricsMachine {
  cpuUsagePercent: number;
  disks: SystemMetricsDisk[];
  freeMemoryBytes: number;
  loadAverage15m: number;
  loadAverage1m: number;
  loadAverage5m: number;
  totalMemoryBytes: number;
  totalSwapBytes: number;
  uptimeSeconds: number;
  usedMemoryBytes: number;
  usedSwapBytes: number;
}

export interface SystemMetrics {
  container: SystemMetricsContainer;
  database: SystemMetricsDatabase;
  generatedAt: string;
  machine: SystemMetricsMachine;
}