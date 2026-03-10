import type { PermissionScope } from '../../api/permissions.js';
import { getMyPermissions } from '../../api/permissions.js';
import { getAuthState } from './state.svelte.js';
import { PERMISSIONS } from './permissions.js';

export interface PermissionsState {
  permissions: Record<string, PermissionScope>;
  isLoading: boolean;
  error: unknown | null;
  hasFetched: boolean;
}

function createPermissionsStore() {
  const authState = getAuthState();

  let permissions = $state<Record<string, PermissionScope>>({});
  let isLoading = $state(false);
  let error = $state<unknown | null>(null);
  let hasFetched = $state(false);
  let initialized = $state(false);

  function clear() {
    permissions = {};
    isLoading = false;
    error = null;
    hasFetched = false;
  }

  async function fetchPermissions() {
    if (isLoading || !authState.isAuthenticated) return;
    isLoading = true;
    error = null;
    try {
      const response = await getMyPermissions();
      permissions = response.permissions ?? {};
      hasFetched = true;
    } catch (err) {
      error = err;
      permissions = {};
      hasFetched = false;
      throw err;
    } finally {
      isLoading = false;
    }
  }

  function hasPermission(permission: string, resourceId?: string): boolean {
    const scope = permissions[permission];
    if (!scope) return false;
    if (scope === '*') return true;
    if (!Array.isArray(scope)) return false;
    if (!resourceId) return scope.length > 0;
    return scope.includes(resourceId);
  }

  function hasAnyPermission(required: string[]): boolean {
    if (required.length === 0) return true;
    return required.some((permission) => hasPermission(permission));
  }

  function hasAnyPermissions(): boolean {
    return Object.keys(permissions).length > 0;
  }

  function hasPermissionScope(permission: string): boolean {
    const scope = permissions[permission];
    if (!scope) return false;
    if (scope === '*') return true;
    return Array.isArray(scope) && scope.length > 0;
  }

  function isPermissionGlobal(permission: string): boolean {
    return permissions[permission] === '*';
  }

  function canViewAiEngines(): boolean {
    return hasPermission(PERMISSIONS.aiPlatform.view);
  }

  function canManageAiEngines(): boolean {
    return hasPermission(PERMISSIONS.aiPlatform.manage);
  }

  function canViewSsoProviders(): boolean {
    return hasPermission(PERMISSIONS.ssoProviders.view);
  }

  function canManageSsoProviders(): boolean {
    return hasPermission(PERMISSIONS.ssoProviders.manage);
  }

  function canViewUsers(): boolean {
    return hasPermission(PERMISSIONS.users.view);
  }

  function canManageUsers(): boolean {
    return hasPermission(PERMISSIONS.users.manage);
  }

  function canManageDepartments(): boolean {
    return hasPermission(PERMISSIONS.departments.manage);
  }

  function hasScopedUsersView(): boolean {
    const viewScope = permissions[PERMISSIONS.users.view];
    const manageScope = permissions[PERMISSIONS.users.manage];

    const hasViewScope =
      Array.isArray(viewScope) && viewScope.length > 0;
    const hasManageScope =
      Array.isArray(manageScope) && manageScope.length > 0;

    return hasViewScope || hasManageScope;
  }

  function canViewRoles(): boolean {
    return hasPermission(PERMISSIONS.roles.view);
  }

  function canManageRoles(): boolean {
    return hasPermission(PERMISSIONS.roles.manage);
  }

  function canAssignRoles(): boolean {
    return hasPermission(PERMISSIONS.roles.assign);
  }

  function canViewBudgetForDepartment(_departmentId: string): boolean {
    return hasPermission(PERMISSIONS.budget.view);
  }

  function canAllocateBudgetForDepartment(_departmentId: string): boolean {
    return hasPermission(PERMISSIONS.budget.allocate);
  }

  function getAdminLandingPath(): string {
    if (isPermissionGlobal(PERMISSIONS.analytics.view)) {
      return '/admin/overview';
    }
    if (canViewUsers()) {
      return '/admin/users';
    }
    if (hasPermission(PERMISSIONS.departments.view)) {
      return '/admin/departments';
    }
    if (canViewAiEngines()) {
      return '/admin/ai-engines';
    }
    if (hasPermission(PERMISSIONS.analytics.view)) {
      return '/admin/analytics';
    }
    if (canViewRoles()) {
      return '/admin/access-control';
    }
    if (canViewSsoProviders()) {
      return '/admin/settings';
    }
    return '/forbidden';
  }

  function init() {
    if (initialized) return;
    initialized = true;

    $effect(() => {
      if (!authState.isAuthenticated) {
        clear();
        return;
      }
      if (!hasFetched) {
        void fetchPermissions();
      }
    });
  }

  return {
    get permissions() {
      return permissions;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get hasFetched() {
      return hasFetched;
    },
    fetchPermissions,
    hasPermission,
    hasAnyPermission,
    hasAnyPermissions,
    hasPermissionScope,
    isPermissionGlobal,
    canViewAiEngines,
    canManageAiEngines,
    canViewSsoProviders,
    canManageSsoProviders,
    canViewUsers,
    canManageUsers,
    canManageDepartments,
    hasScopedUsersView,
    canViewRoles,
    canManageRoles,
    canAssignRoles,
    canViewBudgetForDepartment,
    canAllocateBudgetForDepartment,
    getAdminLandingPath,
    clear,
    init,
  };
}

export const permissionsStore = createPermissionsStore();
