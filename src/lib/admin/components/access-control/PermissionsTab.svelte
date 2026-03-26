<script lang="ts">
  import type { Permission } from "../../../api/admin/permissions.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import AdminPanelCard from "../AdminPanelCard.svelte";
  import AdminEmptyState from "../AdminEmptyState.svelte";
  import { _ } from "svelte-i18n";
  import {
    formatAction,
    formatDomain,
    getPermissionDescription,
    groupPermissionsByDomain,
  } from "./permissionGroups";

  interface Props {
    permissions: Permission[];
    loading: boolean;
  }

  let { permissions, loading }: Props = $props();

  const permissionsByDomain = $derived(
    groupPermissionsByDomain(permissions).permissionsByDomain,
  );

  const domainOrder = $derived(
    groupPermissionsByDomain(permissions).domainOrder,
  );
</script>

{#if loading}
  <LoadingSpinner text={$_("admin.accessControl.permissionsTab.loading")} />
{:else if domainOrder.length === 0}
  <AdminEmptyState
    title={$_("admin.accessControl.permissionsTab.noPermissionsTitle")}
    message={$_("admin.accessControl.permissionsTab.noPermissionsDescription")}
  />
{:else}
  <div class="permissions-tab">
    <div class="permissions-grid">
      {#each domainOrder as domain}
        <AdminPanelCard class="domain-card-wrapper">
          <div class="domain-header">
            <h3 class="domain-heading">{formatDomain(domain)}</h3>
            <span class="domain-count">
              {$_("admin.accessControl.permissionsTab.domainCount", {
                values: { count: permissionsByDomain[domain].length },
              })}
            </span>
          </div>
          <div class="permissions-table">
            <div class="permissions-table-header">
              <span class="col-action"
                >{$_("admin.accessControl.permissionsTab.columns.action")}</span
              >
              <span class="col-scope"
                >{$_("admin.accessControl.permissionsTab.columns.scope")}</span
              >
            </div>
            {#each permissionsByDomain[domain] as perm (perm.id)}
              {@const description = getPermissionDescription(perm, $_)}
              <div class="permission-row">
                <div class="permission-info">
                  <span class="permission-action"
                    >{formatAction(perm.action)}</span
                  >
                  {#if description}
                    <span class="permission-description">{description}</span>
                  {/if}
                </div>
                <span class="permission-scope">
                  {#if perm.is_scopeable}
                    <span
                      class="badge badge--scopeable"
                      title={$_("admin.accessControl.departmentScopeSupportTooltip")}
                    >
                      {$_("admin.accessControl.departmentLabel")}
                    </span>
                  {:else}
                    <span class="badge badge--global"
                      >{$_(
                        "admin.accessControl.permissionsTab.globalBadge",
                      )}</span
                    >
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        </AdminPanelCard>
      {/each}
    </div>
  </div>
{/if}

<style>
  .permissions-tab {
    width: 100%;
    min-width: 0;
  }

  .permissions-grid {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-xl);
  }

  .domain-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .domain-heading {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .domain-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .permissions-table {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .permissions-table-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-md);
    padding: var(--space-xs) 0;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .permission-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    transition: background 0.15s ease;
  }

  .permission-row:hover {
    background: rgba(var(--glass-tint), 0.06);
  }

  .permission-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
  }

  .permission-action {
    color: var(--text-primary);
    font-weight: 500;
  }

  .permission-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.35;
  }

  .permission-scope {
    display: flex;
    justify-content: flex-end;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-md);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .badge--scopeable {
    background: color-mix(in oklab, var(--brand-green) 15%, transparent);
    color: var(--brand-green);
    border: 1px solid color-mix(in oklab, var(--brand-green) 25%, transparent);
  }

  .badge--global {
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 768px) {
    .permissions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
