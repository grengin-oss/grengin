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
} as const;

export type PermissionKey =
  | (typeof PERMISSIONS.analytics)[keyof typeof PERMISSIONS.analytics]
  | (typeof PERMISSIONS.departments)[keyof typeof PERMISSIONS.departments]
  | (typeof PERMISSIONS.aiPlatform)[keyof typeof PERMISSIONS.aiPlatform]
  | (typeof PERMISSIONS.ssoProviders)[keyof typeof PERMISSIONS.ssoProviders]
  | (typeof PERMISSIONS.users)[keyof typeof PERMISSIONS.users]
  | (typeof PERMISSIONS.roles)[keyof typeof PERMISSIONS.roles]
  | (typeof PERMISSIONS.budget)[keyof typeof PERMISSIONS.budget];
