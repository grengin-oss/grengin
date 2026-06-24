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
        <AdminPanelCard class="domain-card-wrapper" ariaLabel={formatDomain(domain)}>
          <div class="domain-header">
            <h3 class="domain-heading">{formatDomain(domain)}</h3>
            <span class="domain-count">
              {$_("admin.accessControl.permissionsTab.domainCount", {
                values: { count: permissionsByDomain[domain].length },
              })}
            </span>
          </div>
          <table class="permissions-table">
            <thead>
              <tr class="permissions-table-header">
                <th scope="col" class="col-action"
                  >{$_("admin.accessControl.permissionsTab.columns.action")}</th
                >
                <th scope="col" class="col-scope"
                  >{$_("admin.accessControl.permissionsTab.columns.scope")}</th
                >
              </tr>
            </thead>
            <tbody>
              {#each permissionsByDomain[domain] as perm (perm.id)}
                {@const description = getPermissionDescription(perm, $_)}
                <tr class="permission-row">
                  <td class="permission-info">
                    <span class="permission-action"
                      >{formatAction(perm.action)}</span
                    >
                    {#if description}
                      <span class="permission-description">{description}</span>
                    {/if}
                  </td>
                  <td class="permission-scope">
                    {#if perm.is_scopeable}
                      <span
                        class="badge badge--scopeable"
                        aria-label={$_(
                          "admin.accessControl.departmentScopeSupportTooltip",
                        )}
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
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
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
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0 var(--space-xs);
  }

  .permissions-table-header {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .permissions-table-header th {
    padding: 0 0 var(--space-xs);
    text-align: left;
    vertical-align: bottom;
  }

  .permissions-table-header .col-scope {
    text-align: right;
    width: 8rem;
  }

  .permission-row {
    transition: background 0.15s ease;
  }

  .permission-row td {
    padding: var(--space-sm) var(--space-md);
    font-size: 0.875rem;
    background: rgba(var(--glass-tint), 0.03);
    vertical-align: middle;
  }

  .permission-row td:first-child {
    border-top-left-radius: var(--radius-md);
    border-bottom-left-radius: var(--radius-md);
  }

  .permission-row td:last-child {
    border-top-right-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
  }

  .permission-row:hover td {
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

  .permissions-table td.permission-scope {
    text-align: right;
    white-space: nowrap;
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
