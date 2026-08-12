/**
 * Role source + permission matrix for the demo "View as" switcher
 * (ENGG-381 / Interactive Demo spec §1 & §3.9).
 *
 * ADDITIVE FILE — new to the demo layer; does not modify any existing webapp
 * file, so it never conflicts when upstream changes are merged in.
 *
 * `DEMO_ROLE_PERMISSIONS` maps each viewing role to a permissions map in the
 * EXACT shape the app already consumes (`Record<PermissionKey, PermissionScope>`
 * from /me/permissions). In demo mode `permissionsStore` reads this instead of
 * the API, so switching the viewing role re-gates the whole app through the
 * app's own PermissionGuard / nav checks — no per-screen conditions needed.
 */

import { PERMISSIONS } from '../auth/permissions.js';
import type { PermissionScope } from '../../api/permissions.js';

export type DemoRoleTag = 'SYSTEM' | 'SCOPED' | 'CUSTOM';

export interface DemoRole {
  id: string;
  label: string;
  tag: DemoRoleTag;
  desc: string;
  /** Control Hub nav sections this role may see (illustrative; gating is driven
      by the permission matrix below). */
  areas: string[];
}

/** Control Hub nav sections, keyed to the real product's admin areas. */
export const NAV_SECTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Usage Analytics' },
  { key: 'promptmetrics', label: 'Prompt Effectiveness' },
  { key: 'audit', label: 'Audit Logs' },
  { key: 'org', label: 'Organization' },
  { key: 'engines', label: 'AI Engines' },
  { key: 'connectors', label: 'MCP' },
  { key: 'access', label: 'RBAC' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'settings', label: 'Settings' },
];

/** Demo department id(s) a SCOPED role administers. Any seeded dept id works —
    what matters for gating is that scoped permissions are a non-empty array. */
export const DEMO_SCOPED_DEPT_IDS = ['d0010000-0000-0000-0000-000000000001'];

const ALL: PermissionScope = '*';
const SCOPED: PermissionScope = DEMO_SCOPED_DEPT_IDS;
const P = PERMISSIONS;

/** Role → permissions map (see matrix in the RBAC reference). */
export const DEMO_ROLE_PERMISSIONS: Record<string, Record<string, PermissionScope>> = {
  // Super Admin — everything, org-wide.
  super: {
    [P.analytics.view]: ALL,
    [P.departments.view]: ALL,
    [P.departments.manage]: ALL,
    [P.aiPlatform.view]: ALL,
    [P.aiPlatform.manage]: ALL,
    [P.ssoProviders.view]: ALL,
    [P.ssoProviders.manage]: ALL,
    [P.users.view]: ALL,
    [P.users.manage]: ALL,
    [P.roles.view]: ALL,
    [P.roles.manage]: ALL,
    [P.roles.assign]: ALL,
    [P.budget.view]: ALL,
    [P.budget.allocate]: ALL,
    [P.mcpServers.view]: ALL,
    [P.mcpServers.manage]: ALL,
    [P.auditLogs.view]: ALL,
    [P.system.maintain]: ALL,
  },
  // Department Admin — one department's people, budget, connectors, analytics (scoped).
  dept: {
    [P.analytics.view]: SCOPED,
    [P.departments.view]: SCOPED,
    [P.departments.manage]: SCOPED,
    [P.users.view]: SCOPED,
    [P.users.manage]: SCOPED,
    [P.budget.view]: SCOPED,
    [P.budget.allocate]: SCOPED,
    [P.mcpServers.view]: SCOPED,
    [P.mcpServers.manage]: SCOPED,
    [P.roles.assign]: SCOPED,
  },
  // Finance Admin — budgets + financial analytics only.
  fin: {
    [P.analytics.view]: ALL,
    [P.departments.view]: ALL,
    [P.budget.view]: ALL,
    [P.budget.allocate]: ALL,
  },
  // AI Manager (custom, spec §3.9) — MCP + AI platform only.
  ai: {
    [P.aiPlatform.view]: ALL,
    [P.aiPlatform.manage]: ALL,
    [P.mcpServers.view]: ALL,
    [P.mcpServers.manage]: ALL,
  },
  // User — no Control Hub; chat only.
  user: {},
};

/** Roles listed in the switcher. Seeded from the mockup + the spec's custom role. */
export const DEMO_ROLES: readonly DemoRole[] = [
  {
    id: 'super',
    label: 'Super Admin',
    tag: 'SYSTEM',
    desc: 'Full access to every part of the platform.',
    areas: ['overview', 'analytics', 'promptmetrics', 'audit', 'org', 'engines', 'connectors', 'access', 'prompts', 'settings'],
  },
  {
    id: 'dept',
    label: 'Department Admin',
    tag: 'SCOPED',
    desc: "Runs one department's people, budget, and connectors.",
    areas: ['analytics', 'org', 'connectors'],
  },
  {
    id: 'fin',
    label: 'Finance Admin',
    tag: 'SCOPED',
    desc: 'Budgets and financial analytics, nothing else.',
    areas: ['analytics', 'org'],
  },
  {
    id: 'ai',
    label: 'AI Manager',
    tag: 'CUSTOM',
    desc: 'Manages MCP connectors and AI engines only.',
    areas: ['engines', 'connectors'],
  },
  {
    id: 'user',
    label: 'User',
    tag: 'SYSTEM',
    desc: 'No Control Hub access — chat only.',
    areas: [],
  },
];

/** Permissions map for a given viewing role (falls back to empty). */
export function permissionsForRole(roleId: string): Record<string, PermissionScope> {
  return DEMO_ROLE_PERMISSIONS[roleId] ?? {};
}
