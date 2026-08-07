// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

export const PERMISSIONS = {
  analytics: {
    view: "analytics:view",
  },
  departments: {
    view: "departments:view",
    manage: "departments:manage",
  },
  aiPlatform: {
    view: "ai_platform:view",
    manage: "ai_platform:manage",
  },
  ssoProviders: {
    view: "sso_providers:view",
    manage: "sso_providers:manage",
  },
  users: {
    view: "users:view",
    manage: "users:manage",
  },
  roles: {
    view: "roles:view",
    manage: "roles:manage",
    assign: "roles:assign",
  },
  budget: {
    view: "budget:view",
    allocate: "budget:allocate",
  },
  mcpServers: {
    view: "mcp_servers:view",
    manage: "mcp_servers:manage",
  },
  auditLogs: {
    view: "audit_logs:view",
  },
  system: {
    maintain: "system:maintain",
  },
} as const;

export type PermissionKey =
  | (typeof PERMISSIONS.analytics)[keyof typeof PERMISSIONS.analytics]
  | (typeof PERMISSIONS.departments)[keyof typeof PERMISSIONS.departments]
  | (typeof PERMISSIONS.aiPlatform)[keyof typeof PERMISSIONS.aiPlatform]
  | (typeof PERMISSIONS.ssoProviders)[keyof typeof PERMISSIONS.ssoProviders]
  | (typeof PERMISSIONS.users)[keyof typeof PERMISSIONS.users]
  | (typeof PERMISSIONS.roles)[keyof typeof PERMISSIONS.roles]
  | (typeof PERMISSIONS.budget)[keyof typeof PERMISSIONS.budget]
  | (typeof PERMISSIONS.mcpServers)[keyof typeof PERMISSIONS.mcpServers]
  | (typeof PERMISSIONS.auditLogs)[keyof typeof PERMISSIONS.auditLogs]
  | (typeof PERMISSIONS.system)[keyof typeof PERMISSIONS.system];
