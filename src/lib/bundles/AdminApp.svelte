<script lang="ts">
  import { Route } from 'svelte-routing';
  import PermissionGuard from '$lib/components/PermissionGuard.svelte';
  import { PERMISSIONS } from '$lib/features/auth/permissions.js';
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
    McpOAuthCallback,
    PromptLibrary,
    PromptEffectiveness,
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
<Route path="/admin/users">
  <PermissionGuard permission={PERMISSIONS.users.view}>
    {#snippet children()}
      <Users />
    {/snippet}
  </PermissionGuard>
</Route>
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
<Route path="/admin/prompt-library">
  <PermissionGuard permission={PERMISSIONS.roles.view}>
    {#snippet children()}
      <PromptLibrary />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/admin/prompt-effectiveness">
  <PermissionGuard permission={PERMISSIONS.roles.view}>
    {#snippet children()}
      <PromptEffectiveness />
    {/snippet}
  </PermissionGuard>
</Route>
<Route path="/mcp/oauth/callback">
  <McpOAuthCallback />
</Route>
