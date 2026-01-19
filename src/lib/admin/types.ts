// Admin types - User management related types only

export interface User {
  id: string;
  sub: string;
  email: string;
  name?: string;
  role?: string;
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
