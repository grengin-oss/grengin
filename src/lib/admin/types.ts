// Admin Dashboard Types
// These types match the API responses from the mock server

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

export interface Organization {
  id: string;
  name: string;
  domain: string;
  allowed_domains: string[];
  settings: {
    default_model: string;
    default_provider: string;
    require_mfa: boolean;
    data_retention_days: number;
  };
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  provider: 'openai' | 'anthropic' | 'groq';
  name: string;
  key_preview: string;
  is_valid: boolean;
  last_used_at?: string;
  created_at: string;
  created_by: string;
}

export interface SsoProvider {
  id: string;
  provider: string;
  name: string;
  client_id: string;
  issuer_url: string;
  scopes: string[];
  allowed_domains: string[];
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface RateLimit {
  id: string;
  scope: string;
  scope_id?: string;
  requests_per_minute: number;
  requests_per_hour: number;
  requests_per_day: number;
  tokens_per_day?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  scope: string;
  scope_id?: string;
  limit_amount: number;
  period: string;
  current_spend: number;
  alert_thresholds: number[];
  action_on_exceed: string;
  is_active: boolean;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

export interface CostSummary {
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  period_start: string;
  period_end: string;
}

export interface AdminDashboard {
  users: {
    total: number;
    active: number;
    new_this_month: number;
  };
  usage: {
    active_users: number;
    total_users: number;
    total_conversations: number;
    total_messages: number;
    avg_messages_per_conversation: number;
    avg_requests_per_user: number;
    most_used_models: Array<{
      model: string;
      requests: number;
      percentage: number;
    }>;
  };
  costs: CostSummary;
  cost_trend: Array<{
    date: string;
    cost: number;
    requests: number;
    tokens: number;
  }>;
  system_health: {
    status: string;
    timestamp: string;
    services: {
      database: string;
      redis: string;
      llm_providers: Record<string, string>;
    };
    version: string;
  };
}

export interface UserBulkImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{
    email: string;
    error: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  admin_id: string;
  admin_email: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
}
