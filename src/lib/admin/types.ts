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

