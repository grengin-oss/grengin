// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { Role } from '../api/admin/roles.js';
import type { RoleUserAssignment } from './types.js';

export function requiresDepartmentScope(role: Role): boolean {
  // The API exposes no scope requirement or stable key for built-in roles.
  return role.is_system && role.name.trim().toLowerCase() === 'department admin';
}

export function canAddGlobalRole(role: Role, assignments: RoleUserAssignment[]): boolean {
  return !requiresDepartmentScope(role) && !assignments.some(
    (assignment) => assignment.role_id === role.id && !assignment.scope_department_id,
  );
}
