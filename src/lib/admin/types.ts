// Admin types - User management related types only

export interface User {
  id: string;
  sub: string;
  email: string;
  name?: string;
  roles?: string[];
  status?: string;
  department?: string;
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

export interface RoleUserAssignment {
  id: string;
  role_id: string;
  role_name: string;
  scope_department_id?: string;
  assigned_by: string;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface AIEngine {
  engine_key: string;
  display_name: string;
  icon?: string;
  is_enabled: boolean;
  api_key_configured: boolean;
  api_key_status?: 'valid' | 'in_valid' | 'not_validated' | 'not_configured';
  api_key_preview?: string | null;
  api_key_last_validated_at?: string | null;
  whitelisted_models?: string[];
  default_model?: string | null;
  updated_at?: string | null;
}

export interface AIEngineModel {
  model_id: string;
  display_name: string;
  is_whitelisted: boolean;
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
  leader_ids?: string[];
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

export interface AdministeredDepartmentsResponse {
  departments: Department[];
}