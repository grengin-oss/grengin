/**
 * Demo view state (ENGG-381 / Interactive Demo spec §1).
 *
 * ADDITIVE FILE. The role switcher has *view-only* semantics: changing the
 * viewing role updates which nav/affordances are visible and NOTHING else.
 * Seeded data and chat history live in their own stores/backend and are never
 * touched here, so a role switch can never reset them.
 *
 * Also owns whether the demo chrome is active at all, so the bar stays inert in
 * a normal production session and only lights up for the demo build/host.
 */

import { DEMO_ROLES, permissionsForRole, type DemoRole } from './demoRoles.js';
import type { PermissionScope } from '../../api/permissions.js';

function createDemoView() {
  const roles: readonly DemoRole[] = DEMO_ROLES;

  // Demo chrome is gated on a build-time env flag so it only lights up in the
  // demo build (`vite --mode demo`, which loads `.env.demo` → VITE_DEMO_MODE=true)
  // and stays completely inert in normal dev/prod builds of the real app.
  let enabled = $state(import.meta.env.VITE_DEMO_MODE === 'true');
  let roleId = $state(roles[0]?.id ?? '');

  const role = $derived(roles.find((r) => r.id === roleId) ?? roles[0]);
  const visibleAreas = $derived(new Set(role?.areas ?? []));
  // Permissions map for the current viewing role, in the exact shape the app's
  // permissionsStore expects. Recomputes when the viewing role changes.
  const viewingPermissions = $derived<Record<string, PermissionScope>>(permissionsForRole(roleId));

  function setRole(id: string) {
    // The ONLY state this writes. No data/chat is touched — view-only by design.
    if (roles.some((r) => r.id === id)) roleId = id;
  }

  function setEnabled(value: boolean) {
    enabled = value;
  }

  function canSee(areaKey: string): boolean {
    return visibleAreas.has(areaKey);
  }

  return {
    get enabled() {
      return enabled;
    },
    get roles() {
      return roles;
    },
    get roleId() {
      return roleId;
    },
    get role() {
      return role;
    },
    get visibleAreas() {
      return visibleAreas;
    },
    get viewingPermissions() {
      return viewingPermissions;
    },
    setRole,
    setEnabled,
    canSee,
  };
}

export const demoView = createDemoView();
export type DemoView = ReturnType<typeof createDemoView>;
