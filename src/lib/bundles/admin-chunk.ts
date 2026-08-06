// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/** Single entry for the admin panel — all admin pages (and admin alerts) in one async chunk. */
export { default as Overview } from '$lib/admin/pages/Overview.svelte';
export { default as Users } from '$lib/admin/pages/Users.svelte';
export { default as Departments } from '$lib/admin/pages/Departments.svelte';
export { default as AccessControl } from '$lib/admin/pages/AccessControl.svelte';
export { default as Settings } from '$lib/admin/pages/Settings.svelte';
export { default as AIEngines } from '$lib/admin/pages/AIEngines.svelte';
export { default as Analytics } from '$lib/admin/pages/Analytics.svelte';
export { default as AlertsPage } from '$lib/features/notifications/AlertsPage.svelte';
export { default as MCPServers } from '$lib/admin/pages/MCPServers.svelte';
export { default as AdminSkills } from '$lib/admin/pages/Skills.svelte';
export { default as McpOAuthCallback } from '$lib/admin/pages/McpOAuthCallback.svelte';
export { default as PromptLibrary } from '$lib/admin/pages/PromptLibrary.svelte';
export { default as PromptEffectiveness } from '$lib/admin/pages/PromptEffectiveness.svelte';
export { default as AuditLogs } from '$lib/admin/pages/AuditLogs.svelte';
export { default as SystemMetrics } from '$lib/admin/pages/SystemMetrics.svelte';
