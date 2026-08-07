// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { Permission } from "../../../api/admin/permissions.js";

export type PermissionGroups = {
  permissionsByDomain: Record<string, Permission[]>;
  domainOrder: string[];
};

export function groupPermissionsByDomain(permissions: Permission[]): PermissionGroups {
  const permissionsByDomain: Record<string, Permission[]> = {};

  for (const permission of permissions) {
    if (!permissionsByDomain[permission.domain]) permissionsByDomain[permission.domain] = [];
    permissionsByDomain[permission.domain].push(permission);
  }

  const domainOrder = Object.keys(permissionsByDomain).sort((a, b) => a.localeCompare(b));

  return { permissionsByDomain, domainOrder };
}

export function formatDomain(domain: string): string {
  return domain
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatAction(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
}

export function getPermissionDescription(
  permission: Permission,
  translate: (key: string) => string,
): string | null {
  if (!permission.description_key) return null;

  try {
    const message = translate(permission.description_key);
    return message && message !== permission.description_key ? message : null;
  } catch {
    return null;
  }
}
