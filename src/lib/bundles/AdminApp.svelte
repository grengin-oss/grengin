<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { Route } from 'svelte-routing';
  import PermissionGuard from '$lib/components/PermissionGuard.svelte';
  import { PERMISSIONS } from '$lib/features/auth/permissions.js';
  import { PROMPTS_FEATURE_ENABLED } from '$lib/config/features.js';
  import Redirect from '$lib/components/Redirect.svelte';
  import {
    Overview,
    Users,
    Departments,
    AccessControl,
    Settings,
    AIEngines,
    Analytics,
    AlertsPage,
    MCPServers,
    AdminSkills,
    McpOAuthCallback,
    PromptLibrary,
    PromptEffectiveness,
    AuditLogs,
    SystemMetrics,
      } from './admin-chunk';
</script>

<Route path="/admin/alerts"><AlertsPage /></Route>
<Route path="/admin/overview">
  <PermissionGuard permission={PERMISSIONS.analytics.view} requireGlobal={true}>
    {#snippet children()}
      <Overview />
    {/snippet}
  </PermissionGuard>
</Route>
<!-- Legacy User Management route — redirects to Organization › Users tab (ENGG-388). -->
<Route path="/admin/users"><Users /></Route>
<Route path="/admin/departments">
  <PermissionGuard permission={PERMISSIONS.departments.view}>
    {#snippet children()}
      <Departments />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/access-control">
  <PermissionGuard permission={PERMISSIONS.roles.view}>
    {#snippet children()}
      <AccessControl />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/settings">
  <PermissionGuard permission={PERMISSIONS.ssoProviders.view}>
    {#snippet children()}
      <Settings />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/ai-engines">
  <PermissionGuard permission={PERMISSIONS.aiPlatform.view}>
    {#snippet children()}
      <AIEngines />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/analytics" primary={false}>
  <PermissionGuard permission={PERMISSIONS.analytics.view}>
    {#snippet children()}
      <Analytics />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/mcp-servers">
  <PermissionGuard permission={PERMISSIONS.mcpServers.view}>
    {#snippet children()}
      <MCPServers />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/skills">
  <PermissionGuard permission={PERMISSIONS.roles.view}>
    {#snippet children()}
      <AdminSkills />
    {/snippet}
  </PermissionGuard>
</Route>
<!-- Prompts is hidden for the v1.0.0 launch (ENGG-423); while it is off the
     routes stay registered and bounce to Overview so bookmarks and in-product
     links do not land on an empty shell. -->
<Route path="/admin/prompt-library">
  {#if PROMPTS_FEATURE_ENABLED}
    <PermissionGuard permission={PERMISSIONS.roles.view}>
      {#snippet children()}
        <PromptLibrary />
      {/snippet}
    </PermissionGuard>
  {:else}
    <Redirect to="/admin/overview" />
  {/if}
</Route>
<Route path="/admin/prompt-effectiveness">
  {#if PROMPTS_FEATURE_ENABLED}
    <PermissionGuard permission={PERMISSIONS.roles.view}>
      {#snippet children()}
        <PromptEffectiveness />
      {/snippet}
    </PermissionGuard>
  {:else}
    <Redirect to="/admin/overview" />
  {/if}
</Route>
<Route path="/admin/audit-logs">
  <AuditLogs />
</Route>
<Route path="/admin/system-metrics">
  <PermissionGuard permission={PERMISSIONS.analytics.view} requireGlobal={true}>
    {#snippet children()}
      <SystemMetrics />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/mcp/oauth/callback">
  <McpOAuthCallback />
</Route>
