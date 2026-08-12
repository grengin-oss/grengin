/**
 * Interactive Demo — MUTABLE runtime state.
 *
 * `demoSeed.ts` holds the immutable canonical dataset (the initial values).
 * This module holds the LIVE, mutable collections that the routes read AND
 * write, all seeded from demoSeed at startup. Every create / edit / delete /
 * status change mutates these arrays, so the change persists and the app
 * reflects it on the next fetch — the demo behaves like a real backend for the
 * session (reset on server restart).
 */

import {
  DEMO_USERS,
  DEMO_ROLES,
  DEMO_ROLE_PROMPTS,
  DEMO_DEPARTMENT_PROMPTS,
  getVisitorUser,
  type DemoUser,
  type DemoRole,
  type DemoRolePrompt,
  type DemoDepartmentPrompt,
} from './demoSeed.js'

// Deep-ish copies so mutations never touch the canonical seed arrays.
export const users: DemoUser[] = DEMO_USERS.map((u) => ({ ...u, roles: [...u.roles] }))
export const roles: DemoRole[] = DEMO_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] }))
export const rolePrompts: DemoRolePrompt[] = DEMO_ROLE_PROMPTS.map((p) => ({ ...p, variables: [...p.variables] }))
export const deptPrompts: DemoDepartmentPrompt[] = DEMO_DEPARTMENT_PROMPTS.map((p) => ({ ...p }))

// The full user table with the visitor pinned at the top (spec §3.6), over the
// LIVE users list.
export function usersWithVisitor(): DemoUser[] {
  return [getVisitorUser(), ...users]
}

export function findUser(id: string): DemoUser | undefined {
  return usersWithVisitor().find((u) => u.id === id)
}

// Live members of a department (excludes the pinned visitor, who is a fixed
// super-admin overlay, not a seeded member).
export function usersInDepartmentLive(departmentId: string): DemoUser[] {
  return users.filter((u) => u.department_id === departmentId)
}

// Per-role user_count (spec §3.9). Visitor counts as a Super Admin.
export function roleUserCount(roleId: string): number {
  const base = users.filter((u) => u.role_id === roleId).length
  return roleId === 'role-super' ? base + 1 : base
}

export function departmentPromptsLive(departmentId: string): DemoDepartmentPrompt[] {
  return deptPrompts.filter((p) => p.department_id === departmentId).sort((a, b) => a.priority - b.priority)
}

// Remove a user from the live list (returns whether it existed).
export function deleteUser(id: string): boolean {
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) return false
  users.splice(idx, 1)
  return true
}
