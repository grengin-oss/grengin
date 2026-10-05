<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Permission } from "../../../api/admin/permissions.js";
  import type { Role } from "../../../api/admin/roles.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
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
    /** Columns of the matrix view. */
    roles?: Role[];
    rolesLoading?: boolean;
    /** ".layout-toggles" choice, owned by the page. "grid" is the matrix. */
    view?: "list" | "grid";
  }

  let {
    permissions,
    loading,
    roles = [],
    rolesLoading = false,
    view = "list",
  }: Props = $props();

  let query = $state("");

  /**
   * Search matches the three things the row actually shows — domain, action and
   * description — so a query can never hide a row whose visible text contains it.
   */
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter((perm) => {
      const description = getPermissionDescription(perm, $_) ?? "";
      return (
        formatDomain(perm.domain).toLowerCase().includes(q) ||
        formatAction(perm.action).toLowerCase().includes(q) ||
        description.toLowerCase().includes(q)
      );
    });
  });

  const grouped = $derived(groupPermissionsByDomain(filtered));
  const permissionsByDomain = $derived(grouped.permissionsByDomain);
  const domainOrder = $derived(grouped.domainOrder);

  // Roles reference permissions as "domain:action" keys, not by permission id.
  const grantsByRole = $derived(
    new Map(roles.map((role) => [role.id, new Set(role.permissions)])),
  );

  function isGranted(role: Role, perm: Permission): boolean {
    return (
      grantsByRole.get(role.id)?.has(`${perm.domain}:${perm.action}`) ?? false
    );
  }

  // Pinned permission column (--mx-perm-col, 368px by design), then one column
  // per role. minmax lets a short role list fill the card instead of leaving a
  // blank strip on the right.
  const matrixColumns = $derived(
    `var(--mx-perm-col) repeat(${roles.length}, minmax(114px, 1fr))`,
  );

  function countLabel(n: number): string {
    return $_("admin.accessControl.permissionsTab.domainCount", {
      values: { count: n },
    });
  }
</script>

<!-- Blue glyph per domain (the design's icon files aren't in the repo); unknown
     domains get a neutral grid. The caller supplies the white tile around it. -->
{#snippet domainIcon(domain: string, size: number)}
  <svg
    width={size}
    height={size}
    viewBox="0 0 13 13"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    {#if domain === "ai_platform"}
      <path
        d="M6.5 1.2 7.6 4.6 11 5.7 7.6 6.8 6.5 10.2 5.4 6.8 2 5.7 5.4 4.6Z"
      />
      <path d="M10.6 9.4v2.4M9.4 10.6h2.4" />
    {:else if domain === "analytics"}
      <path d="M1.5 11.5h10M3 9.5V6.5M6.5 9.5V2.5M10 9.5V4.5" />
    {:else if domain === "audit_logs"}
      <path d="M3 1.2h5l2.5 2.5v8.1H3Z" />
      <path d="M7.8 1.2v2.7h2.7M4.8 6.5h3.6M4.8 8.7h3.6" />
    {:else if domain === "budget"}
      <ellipse cx="4" cy="2.2" rx="3.2" ry="1.4" />
      <path d="M.8 2.2v6.8c0 .8 1.4 1.4 3.2 1.4M.8 5.6c0 .8 1.4 1.4 3.2 1.4" />
      <rect x="6.4" y="5" width="5.6" height="6.2" rx=".6" />
      <path d="M8 7h2.4M8 9h2.4" />
    {:else if domain === "departments"}
      <rect x="4.5" y="1.2" width="4" height="3" rx=".6" />
      <rect x="1.2" y="8.8" width="4" height="3" rx=".6" />
      <rect x="7.8" y="8.8" width="4" height="3" rx=".6" />
      <path d="M6.5 4.2v2.3M3.2 8.8V6.5h6.6v2.3" />
    {:else if domain === "mcp_servers"}
      <rect x="1.5" y="1.5" width="10" height="4" rx="1" />
      <rect x="1.5" y="7.5" width="10" height="4" rx="1" />
      <path d="M3.8 3.5h.01M3.8 9.5h.01" />
    {:else if domain === "roles"}
      <path d="M6.5 1.2 11 3v3.3c0 2.7-1.9 4.6-4.5 5.5C3.9 10.9 2 9 2 6.3V3Z" />
      <path d="m4.6 6.6 1.3 1.3 2.6-2.6" />
    {:else if domain === "skills"}
      <path d="M7.3 1.2 2.5 7.3h4l-.8 4.5 4.8-6.1h-4Z" />
    {:else if domain === "sso_providers"}
      <circle cx="4.2" cy="8.8" r="2.6" />
      <path d="m6.1 6.9 5-5M9.4 3.6l1.5 1.5M8 5l1.2 1.2" />
    {:else if domain === "users"}
      <circle cx="5" cy="4" r="2.2" />
      <path
        d="M1.2 11.5c0-2.1 1.7-3.6 3.8-3.6s3.8 1.5 3.8 3.6M8.8 2.1a2.2 2.2 0 0 1 0 4M10 8.2c1.1.5 1.8 1.7 1.8 3.3"
      />
    {:else}
      <rect x="1.5" y="1.5" width="4" height="4" rx=".8" />
      <rect x="7.5" y="1.5" width="4" height="4" rx=".8" />
      <rect x="1.5" y="7.5" width="4" height="4" rx=".8" />
      <rect x="7.5" y="7.5" width="4" height="4" rx=".8" />
    {/if}
  </svg>
{/snippet}

{#snippet scopePill(perm: Permission, small: boolean)}
  <span
    class="{small ? 'scope-pill-sm' : 'scope-pill'} {perm.is_scopeable
      ? 'scope-pill--dept'
      : 'scope-pill--global'}"
    title={perm.is_scopeable
      ? $_("admin.accessControl.departmentScopeSupportTooltip")
      : undefined}
  >
    {perm.is_scopeable
      ? $_("admin.accessControl.departmentLabel")
      : $_("admin.accessControl.permissionsTab.globalBadge")}
  </span>
{/snippet}

{#if loading}
  <LoadingSpinner text={$_("admin.accessControl.permissionsTab.loading")} />
{:else if permissions.length === 0}
  <AdminEmptyState
    title={$_("admin.accessControl.permissionsTab.noPermissionsTitle")}
    message={$_("admin.accessControl.permissionsTab.noPermissionsDescription")}
  />
{:else}
  <div class="panel">
    <!-- ".search-row" -->
    <div class="search-row">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="7"
          cy="7"
          r="4.5"
          stroke="currentColor"
          stroke-width="1.3"
        />
        <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <input
        type="text"
        bind:value={query}
        placeholder={$_("admin.accessControl.searchPermissions")}
        aria-label={$_("admin.accessControl.searchPermissions")}
      />
    </div>

    {#if domainOrder.length === 0}
      <AdminEmptyState
        title={$_("admin.accessControl.permissionsTab.noPermissionsTitle")}
        message={$_("admin.accessControl.noSearchResults", {
          values: { query: query.trim() },
        })}
      />
    {:else if view === "list"}
      <!-- ".perms-list-wrap": one table, category rows breaking up the domains -->
      <div class="perms-list-wrap">
        <div class="table-container">
          {#each domainOrder as domain, i (domain)}
            <div class="perm-group">
              {#if i === 0}
                <div class="thead-row">
                  <span
                    >{$_(
                      "admin.accessControl.permissionsTab.columns.permission",
                    )}</span
                  >
                  <span
                    >{$_(
                      "admin.accessControl.permissionsTab.columns.description",
                    )}</span
                  >
                  <span
                    >{$_(
                      "admin.accessControl.permissionsTab.columns.scope",
                    )}</span
                  >
                </div>
              {/if}
              <div class="category-row">
                <span class="category-row__icon" aria-hidden="true"
                  >{@render domainIcon(domain, 13)}</span
                >
                <span class="category-row__name">{formatDomain(domain)}</span>
                <span class="count-pill"
                  >{countLabel(permissionsByDomain[domain].length)}</span
                >
              </div>
              {#each permissionsByDomain[domain] as perm (perm.id)}
                {@const description = getPermissionDescription(perm, $_)}
                <div class="perm-row">
                  <span class="perm-row__name">{formatAction(perm.action)}</span
                  >
                  <span class="perm-row__desc">{description ?? ""}</span>
                  {@render scopePill(perm, false)}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <!-- ".perms-grid-wrap": role × permission matrix (node 1772:15028). Read-only;
           grants are edited from the Roles tab. -->
      <div class="perms-grid-wrap">
        <div class="mx-note">
          <svg
            width="17"
            height="17"
            viewBox="0 0 17 17"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="8.5"
              cy="8.5"
              r="7.08"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M6.5 6.6a2.1 2.1 0 0 1 4.05.7c0 1.4-2.05 1.9-2.05 1.9M8.5 11.9h.01"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          <span>{$_("admin.accessControl.permissionsTab.matrixNote")}</span>
        </div>

        {#if rolesLoading && roles.length === 0}
          <LoadingSpinner
            text={$_("admin.accessControl.permissionsTab.matrixLoadingRoles")}
          />
        {:else if roles.length === 0}
          <AdminEmptyState
            title={$_("admin.accessControl.noRolesTitle")}
            message={$_("admin.accessControl.permissionsTab.matrixNoRoles")}
          />
        {:else}
          <div class="mx-scroll">
            <div class="mx" style:grid-template-columns={matrixColumns}>
              <div class="mx-h mx-h--perm mx-sticky">
                {$_("admin.accessControl.permissionsTab.columns.permission")}
              </div>
              {#each roles as role, ri (role.id)}
                <div
                  class="mx-h"
                  class:mx-end={ri === roles.length - 1}
                  title={role.name}
                >
                  <span class="mx-h__name">{role.name}</span>
                </div>
              {/each}

              {#each domainOrder as domain, di (domain)}
                <div class="mx-cat mx-end">
                  <div class="mx-cat__inner">
                    <span class="mx-cat__icon" aria-hidden="true"
                      >{@render domainIcon(domain, 11)}</span
                    >
                    <span class="mx-cat__name">{formatDomain(domain)}</span>
                  </div>
                </div>
                {#each permissionsByDomain[domain] as perm, pi (perm.id)}
                  {@const action = formatAction(perm.action)}
                  {@const lastRow =
                    di === domainOrder.length - 1 &&
                    pi === permissionsByDomain[domain].length - 1}
                  <div
                    class="mx-perm mx-sticky"
                    class:mx-bottom={lastRow}
                    title={getPermissionDescription(perm, $_) ?? undefined}
                  >
                    <span class="mx-perm__name">{action}</span>
                    <span
                      class="mx-scope"
                      title={perm.is_scopeable
                        ? $_(
                            "admin.accessControl.departmentScopeSupportTooltip",
                          )
                        : undefined}
                    >
                      {perm.is_scopeable
                        ? $_("admin.accessControl.departmentLabel")
                        : $_("admin.accessControl.permissionsTab.globalBadge")}
                    </span>
                  </div>
                  {#each roles as role, ri (role.id)}
                    {@const granted = isGranted(role, perm)}
                    {@const status = granted
                      ? $_("admin.accessControl.permissionsTab.matrixGranted")
                      : $_(
                          "admin.accessControl.permissionsTab.matrixNotGranted",
                        )}
                    <div
                      class="mx-cell"
                      class:mx-end={ri === roles.length - 1}
                      class:mx-bottom={lastRow}
                      title="{$_(
                        'admin.accessControl.permissionsTab.matrixCellLabel',
                        {
                          values: {
                            role: role.name,
                            permission: `${formatDomain(domain)} · ${action}`,
                          },
                        },
                      )} — {status}"
                    >
                      {#if granted}
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          role="img"
                          aria-label={status}
                        >
                          <circle
                            cx="10"
                            cy="10"
                            r="10"
                            class="mx-check__disc"
                          />
                          <path
                            d="m6.4 10.2 2.4 2.4 4.8-4.9"
                            class="mx-check__tick"
                            stroke-width="1.6"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      {:else}
                        <span class="mx-none" role="img" aria-label={status}
                          >—</span
                        >
                      {/if}
                    </div>
                  {/each}
                {/each}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: flex-start;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  /* ---- ".search-row" ---- */
  .search-row {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 10px 14px;
    align-items: center;
    flex-shrink: 0;
    align-self: stretch;
    color: var(--gx-slate-400);
    box-sizing: border-box;
  }

  .search-row:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-row svg {
    flex-shrink: 0;
  }

  .search-row input {
    flex-grow: 1;
    min-width: 0;
    /* app.css styles every bare <input> as a full glass field — padding, its own
       radius, a fill, an inset shadow and a focus ring. Inside a search row the
       container IS the field, so all of that has to be neutralised or the input
       draws a second pill inside the first. */
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .search-row input:focus {
    box-shadow: none;
    background: transparent;
  }

  .search-row input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  /* ---- ".perms-list-wrap": table view ---- */
  .perms-list-wrap {
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  /* Domains are separate ".perm-group" blocks 18px apart inside one outlined
     frame. Rows draw their own 1px borders and overlap by 1px so neighbours share
     a single line. The columns are fixed-width, so the table scrolls inside its
     own container on narrow viewports rather than pushing the page sideways. */
  .table-container {
    overflow-x: auto;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-items: stretch;
    align-self: stretch;
  }

  .perm-group {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .perm-group > * + * {
    margin-top: -1px;
  }

  .thead-row,
  .category-row,
  .perm-row {
    min-width: 640px;
    border: 1px solid var(--gx-hair);
    box-sizing: border-box;
  }

  .thead-row {
    height: 37px;
    background: var(--gx-card);
    display: flex;
    gap: 220px;
    padding: 12px 14px;
    align-items: flex-start;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    letter-spacing: 0.5px;
    color: var(--gx-card-title-ink);
  }

  .thead-row span:first-child {
    width: 180px;
    flex-shrink: 0;
  }

  .thead-row span:nth-child(2) {
    flex-grow: 1;
    min-width: 0;
  }

  .thead-row span:last-child {
    flex-shrink: 0;
    text-align: right;
  }

  .category-row {
    height: 40px;
    background: var(--gx-rule-cool);
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    align-items: center;
  }

  .category-row__icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--gx-card);
    color: var(--gx-org-primary-500);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .category-row__icon svg {
    display: block;
  }

  .category-row__name {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
  }

  .count-pill {
    border-radius: 100px;
    padding: 2px 6px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 10px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  .perm-row {
    height: 51px;
    background: var(--gx-card);
    display: flex;
    gap: 220px;
    padding: 14px;
    align-items: center;
  }

  .perm-row__name {
    width: 180px;
    flex-shrink: 0;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .perm-row__desc {
    flex-grow: 1;
    min-width: 0;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  @media (max-width: 1280px) {
    .thead-row,
    .perm-row {
      gap: 48px;
    }
  }

  /* ---- scope pills: text-only labels in the design ---- */
  .scope-pill {
    border-radius: 6px;
    padding: 4px 10px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .scope-pill-sm {
    border-radius: 6px;
    padding: 3px 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .scope-pill--global {
    color: var(--gx-org-ink);
  }

  .scope-pill--dept {
    color: var(--gx-slate-900);
  }

  /* ---- ".perms-grid-wrap": matrix view ---- */
  .perms-grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 28px;
    align-items: stretch;
    align-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .mx-note {
    min-height: 40px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--gx-ac-mx-note-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ac-mx-note-ring);
    display: flex;
    gap: 9px;
    padding: 10px 13px;
    align-items: center;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 12px;
    line-height: 18px;
    color: var(--gx-ac-mx-note-fg);
  }

  .mx-note svg {
    flex-shrink: 0;
  }

  /* Wide role lists scroll sideways inside the card; the permission column and
     the category labels stay pinned on the left. */
  /* A real border, not an inset shadow: the cells' backgrounds paint over an
     inset shadow, which left the matrix without a visible outline. */
  .mx-scroll {
    overflow-x: auto;
    border: 1px solid var(--gx-cx-panel-ring);
    border-radius: 12px;
    background: var(--gx-card);
    max-width: 100%;
  }

  .mx {
    --mx-perm-col: 368px;
    display: grid;
    width: max-content;
    min-width: 100%;
  }

  .mx > div {
    box-sizing: border-box;
    border-right: 1px solid var(--gx-cx-panel-ring);
    border-bottom: 1px solid var(--gx-cx-panel-ring);
  }

  /* The card's border draws the outer edge; drop the cells' own lines there so
     it isn't doubled. */
  .mx > .mx-end {
    border-right: 0;
  }

  .mx > .mx-bottom {
    border-bottom: 0;
  }

  .mx-sticky {
    position: sticky;
    left: 0;
    z-index: 1;
  }

  .mx-h {
    height: 60px;
    background: var(--gx-an-field-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    text-align: center;
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-ac-mx-head-fg);
    min-width: 0;
  }

  /* Long custom role names wrap to two lines, then clip, so the header row
     keeps its 60px height. */
  .mx-h__name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .mx > .mx-h--perm {
    justify-content: flex-start;
    padding: 0 14px;
    background: var(--gx-card);
    border-right-color: var(--gx-cx-pill-ring);
    z-index: 2;
  }

  .mx-cat {
    grid-column: 1 / -1;
    height: 38px;
    background: var(--gx-org-track);
    display: flex;
    align-items: center;
    padding: 0 14px;
  }

  .mx-cat__inner {
    position: sticky;
    left: 14px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .mx-cat__icon {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--gx-card);
    color: var(--gx-org-primary-500);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .mx-cat__icon svg {
    display: block;
  }

  .mx-cat__name {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 10px;
    line-height: 14px;
    letter-spacing: 0.005em;
    text-transform: uppercase;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
  }

  .mx > .mx-perm {
    height: 50px;
    background: var(--gx-card);
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 0 12px 0 14px;
    border-right-color: var(--gx-cx-pill-ring);
  }

  .mx-perm__name {
    flex-grow: 1;
    min-width: 0;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-ac-mx-ink);
  }

  .mx-scope {
    flex-shrink: 0;
    border-radius: 20px;
    background: var(--gx-org-track);
    box-shadow: inset 0 0 0 0.25px var(--gx-ac-mx-scope-ring);
    padding: 2px 8px;
    font-family: var(--gx-font);
    font-weight: 500;
    font-size: 8px;
    line-height: 10.5px;
    color: var(--gx-ac-mx-ink);
    white-space: nowrap;
  }

  .mx-cell {
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-card);
  }

  .mx-cell svg {
    display: block;
  }

  .mx-check__disc {
    fill: var(--gx-nav-active-fg);
  }

  .mx-check__tick {
    stroke: var(--gx-card);
  }

  .mx-none {
    font-family: var(--gx-font);
    font-weight: 500;
    font-size: 16px;
    line-height: 20px;
    color: var(--gx-ac-mx-none);
  }

  /* A 368px pinned column would leave almost no room for roles on a phone. */
  @media (max-width: 768px) {
    .mx {
      --mx-perm-col: 200px;
    }
  }
</style>
