<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import Modal from "../Modal.svelte";
  import type { Permission } from "../../../api/admin/permissions.js";
  import type { Role } from "../../../api/admin/roles.js";
  import * as rolesApi from "../../../api/admin/roles.js";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import {
    formatAction,
    formatDomain,
    getPermissionDescription,
    groupPermissionsByDomain,
  } from "./permissionGroups";

  interface Props {
    role?: Role | null;
    permissions: Permission[];
    onclose: () => void;
    onSuccess: () => void;
  }

  let { role = null, permissions, onclose, onSuccess }: Props = $props();

  const isEdit = $derived(!!role);

  let name = $state(untrack(() => role?.name ?? ""));
  let roleNameInputEl = $state<HTMLInputElement | null>(null);
  let selectedPermissions = $state<Set<string>>(
    untrack(() => new Set(role?.permissions ?? [])),
  );
  let saving = $state(false);
  let expandedPermId = $state<string | null>(null);

  $effect(() => {
    const r = role;
    name = r?.name ?? "";
    selectedPermissions = new Set(r?.permissions ?? []);
  });

  onMount(() => {
    if (isEdit || role?.is_system) return;
    tick().then(() => {
      roleNameInputEl?.focus();
      roleNameInputEl?.select();
    });
  });

  function toPermissionKey(p: Permission): string {
    return `${p.domain}:${p.action}`;
  }

  const permissionsByDomain = $derived(
    groupPermissionsByDomain(permissions).permissionsByDomain,
  );

  const domainOrder = $derived(
    groupPermissionsByDomain(permissions).domainOrder,
  );

  const selectedCount = $derived(selectedPermissions.size);

  /** ".footer-summary" — "N permissions selected across M categories". */
  const selectedCategoryCount = $derived(
    domainOrder.filter((domain) =>
      permissionsByDomain[domain].some((p) =>
        selectedPermissions.has(toPermissionKey(p)),
      ),
    ).length,
  );

  /** ".search-wrapper" — filters the category list. */
  let query = $state("");

  const visibleDomains = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return domainOrder;
    return domainOrder.filter(
      (domain) =>
        formatDomain(domain).toLowerCase().includes(q) ||
        permissionsByDomain[domain].some((p) =>
          formatAction(p.action).toLowerCase().includes(q),
        ),
    );
  });

  /**
   * ".cat-block[data-open]" — the design ships the first category open and the
   * rest closed. A search opens every match so results are never hidden behind a
   * collapsed header.
   */
  let openDomains = $state<Record<string, boolean>>({});

  function isDomainOpen(domain: string, index: number): boolean {
    if (query.trim()) return true;
    return openDomains[domain] ?? index === 0;
  }

  function toggleDomain(domain: string, index: number) {
    openDomains = {
      ...openDomains,
      [domain]: !isDomainOpen(domain, index),
    };
  }

  function domainSelectedCount(domain: string): number {
    return permissionsByDomain[domain].filter((p) =>
      selectedPermissions.has(toPermissionKey(p)),
    ).length;
  }

  /** ".scope-dot" — shown when any permission in the category is scopeable. */
  function domainHasScopeable(domain: string): boolean {
    return permissionsByDomain[domain].some((p) => p.is_scopeable);
  }

  function togglePermission(key: string) {
    const next = new Set(selectedPermissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedPermissions = next;
  }

  function selectAllInDomain(domain: string) {
    const next = new Set(selectedPermissions);
    for (const p of permissionsByDomain[domain]) {
      next.add(toPermissionKey(p));
    }
    selectedPermissions = next;
  }

  function clearDomain(domain: string) {
    const next = new Set(selectedPermissions);
    for (const p of permissionsByDomain[domain]) {
      next.delete(toPermissionKey(p));
    }
    selectedPermissions = next;
  }

  function isDomainFullySelected(domain: string): boolean {
    const keys = permissionsByDomain[domain].map(toPermissionKey);
    return keys.every((k) => selectedPermissions.has(k));
  }

  function toggleExpand(permId: string) {
    expandedPermId = expandedPermId === permId ? null : permId;
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error($_("admin.accessControl.roleNameRequired"));
      return;
    }
    saving = true;
    try {
      if (isEdit && role) {
        await rolesApi.updateRole(role.id, {
          name: trimmed,
          permissions: Array.from(selectedPermissions),
        });
        toast.success($_("admin.accessControl.roleUpdated"));
      } else {
        await rolesApi.createRole({
          name: trimmed,
          permissions: Array.from(selectedPermissions),
        });
        toast.success($_("admin.accessControl.roleCreated"));
      }
      onSuccess();
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? getLocalizedError(error, "description", $_)
          : isEdit
            ? $_("admin.accessControl.failedToUpdateRole")
            : $_("admin.accessControl.failedToCreateRole");
      toast.error(msg);
    } finally {
      saving = false;
    }
  }
</script>

<Modal
  isOpen={true}
  {onclose}
  variant="access-control"
  title={isEdit
    ? $_("admin.accessControl.editRoleTitle")
    : $_("admin.accessControl.addRoleTitle")}
>
  <!-- ".field-group": ROLE NAME -->
  <div class="field-group">
    <label class="field-label" for="role-name"
      >{$_("admin.accessControl.roleName")}</label
    >
    <div class="input-wrapper" class:input-wrapper--locked={role?.is_system}>
      <input
        id="role-name"
        type="text"
        bind:this={roleNameInputEl}
        bind:value={name}
        placeholder={$_("admin.accessControl.roleNamePlaceholder")}
        disabled={role?.is_system ?? false}
      />
    </div>
    {#if role?.is_system}
      <span class="help-text">{$_("admin.accessControl.systemRoleNameLocked")}</span>
    {/if}
  </div>

  <!-- ".permissions-header" + ".selected-pill" -->
  <div class="permissions-header">
    <span class="field-label" id="permissions-label"
      >{$_("admin.accessControl.permissionsLabel")}</span
    >
    <span class="selected-pill"
      >{$_("admin.accessControl.permissionsSelected", {
        values: { count: selectedCount },
      })}</span
    >
  </div>

  <!-- ".search-wrapper" -->
  <div class="search-wrapper">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3" />
      <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
    </svg>
    <input
      type="text"
      bind:value={query}
      placeholder={$_("admin.accessControl.searchPermissions")}
      aria-label={$_("admin.accessControl.searchPermissions")}
    />
  </div>

  <!-- ".legend-line" -->
  <div class="legend-line">
    <span class="legend-dot" aria-hidden="true"></span>
    <span class="legend-text"
      >{$_("admin.accessControl.departmentScopeSupport")}</span
    >
  </div>

  <!-- ".perm-list": a ".cat-block" per domain -->
  <div class="perm-list" role="group" aria-labelledby="permissions-label">
    {#if visibleDomains.length === 0}
      <div class="perm-list__empty">
        {$_("admin.accessControl.noSearchResults", {
          values: { query: query.trim() },
        })}
      </div>
    {/if}
    {#each visibleDomains as domain, index (domain)}
      {@const open = isDomainOpen(domain, index)}
      <div class="cat-block" class:cat-block--open={open}>
        <div class="cat-header">
          <button
            class="cat-header__left"
            type="button"
            onclick={() => toggleDomain(domain, index)}
            aria-expanded={open}
          >
            <span class="cat-chev" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4" fill="none" />
              </svg>
            </span>
            <span class="cat-name">{formatDomain(domain)}</span>
            {#if domainHasScopeable(domain)}
              <span
                class="scope-dot"
                title={$_("admin.accessControl.departmentScopeSupportTooltip")}
              ></span>
            {/if}
            <span class="count-pill"
              >{domainSelectedCount(domain)}/{permissionsByDomain[domain].length}</span
            >
          </button>
          <div class="cat-actions">
            <button
              class="select-all"
              type="button"
              onclick={() => selectAllInDomain(domain)}
              disabled={isDomainFullySelected(domain)}
            >
              {$_("admin.accessControl.selectAll")}
            </button>
            <button
              class="clear-all"
              type="button"
              onclick={() => clearDomain(domain)}
              disabled={domainSelectedCount(domain) === 0}
            >
              {$_("admin.accessControl.clearSelection")}
            </button>
          </div>
        </div>

        {#if open}
          <div class="cat-children">
            {#each permissionsByDomain[domain] as perm (perm.id)}
              {@const key = toPermissionKey(perm)}
              {@const desc = getPermissionDescription(perm, $_)}
              {@const checked = selectedPermissions.has(key)}
              {@const isExpanded = expandedPermId === perm.id}
              <div class="perm-item-row">
                <div class="perm-item-left">
                  <!-- ".perm-check": the design's own 18px box. A real checkbox
                       sits behind it so the label, keyboard and a11y all work. -->
                  <label class="perm-check" data-checked={checked}>
                    <input
                      type="checkbox"
                      {checked}
                      onchange={() => togglePermission(key)}
                      aria-label={`${formatDomain(domain)} — ${formatAction(perm.action)}`}
                    />
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" stroke-width="1.6" fill="none" />
                    </svg>
                  </label>
                  <span class="perm-item-label">{formatAction(perm.action)}</span>
                </div>
                {#if desc}
                  <button
                    class="perm-info"
                    type="button"
                    onclick={() => toggleExpand(perm.id)}
                    title={desc}
                    aria-expanded={isExpanded}
                    aria-label={desc}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.1" />
                      <path d="M7 6.3v4M7 4.3v.1" stroke="currentColor" stroke-width="1.1" />
                    </svg>
                  </button>
                {/if}
              </div>
              {#if desc && isExpanded}
                <div class="perm-item-desc">{desc}</div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#snippet footer()}
    <span class="footer-summary">
      {@html $_("admin.accessControl.footerSummary", {
        values: {
          count: `<b>${selectedCount}</b>`,
          categories: `<b>${selectedCategoryCount}</b>`,
        },
      })}
    </span>
    <div class="footer-actions">
      <button class="btn-cancel" type="button" onclick={onclose} disabled={saving}>
        {$_("common.cancel")}
      </button>
      <button class="btn-create" type="button" onclick={handleSubmit} disabled={saving}>
        {#if saving}
          {isEdit ? $_("admin.common.saving") : $_("admin.accessControl.creating")}
        {:else}
          {isEdit ? $_("common.save") : $_("admin.accessControl.createRole")}
        {/if}
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* ==========================================================================
     Add/edit role modal — access-control.html ".modal". The chrome (560px card,
     gradient header rule, footer bar) lives in Modal.svelte's "access-control"
     variant; everything here is the body and footer content.
     ========================================================================== */

  /* app.css styles EVERY bare <button> as a glass button: 16px radius, a
     backdrop blur and an edge-glow + drop shadow. The modal's controls are
     text/box buttons drawn by the design, so that chrome has to be cleared or
     each one renders inside a stray rounded pill. */
  .cat-header__left,
  .cat-actions button,
  .perm-info,
  .btn-cancel,
  .btn-create {
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-radius: 0;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    align-self: stretch;
  }

  .field-label {
    font-family: var(--gx-font);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  /* The design draws the name field already focused — a blue ring with a soft
     inner glow. Here that's the real focus state; at rest it's a hairline. */
  .input-wrapper {
    min-height: 42px;
    border-radius: 10px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 0 14px;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;
    transition: box-shadow 120ms ease;
  }

  .input-wrapper:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-tx-chip-icon-fg),
      inset 0 0 4px 0 rgba(59, 103, 189, 0.149);
  }

  .input-wrapper--locked {
    background: var(--gx-page);
  }

  /* app.css styles every bare <input> as a glass field; the wrapper IS the field
     here, so that has to be neutralised (see the same note in PermissionsTab). */
  .input-wrapper input,
  .search-wrapper input {
    flex-grow: 1;
    min-width: 0;
    width: 100%;
    /* 14px on all sides. The reset of app.css's other bare-<input> chrome
       (radius, fill, shadow, blur) below still applies. */
    padding: 14px;
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
    color: var(--gx-slate-900);
  }

  .input-wrapper input:focus,
  .search-wrapper input:focus {
    box-shadow: none;
    background: transparent;
  }

  .input-wrapper input::placeholder,
  .search-wrapper input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .input-wrapper input:disabled {
    color: var(--gx-slate-500);
    cursor: not-allowed;
  }

  .help-text {
    font-family: var(--gx-font);
    font-size: 11px;
    color: var(--gx-slate-500);
  }

  .permissions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
  }

  .selected-pill {
    border-radius: 100px;
    background: var(--gx-ac-selected-pill-bg);
    padding: 4px 10px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
    color: var(--gx-tx-chip-icon-fg);
    white-space: nowrap;
  }

  .search-wrapper {
    min-height: 42px;
    border-radius: 10px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 0 14px;
    align-items: center;
    align-self: stretch;
    color: var(--gx-slate-500);
    box-sizing: border-box;
  }

  .search-wrapper:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-wrapper svg {
    flex-shrink: 0;
  }

  .legend-line {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgb(46, 168, 117);
    flex-shrink: 0;
  }

  .legend-text {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-ac-slate-600);
  }

  /* ---- ".perm-list" ---- */
  .perm-list {
    overflow: hidden;
    border-radius: 14px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: stretch;
  }

  .perm-list__empty {
    padding: 16px;
    font-family: var(--gx-font);
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .cat-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: stretch;
  }

  .cat-header {
    background: var(--gx-page);
    display: flex;
    padding: 14px 16px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    border-top: 1px solid var(--gx-hair);
    box-sizing: border-box;
  }

  .cat-block:first-child .cat-header {
    border-top: 0;
  }

  .cat-header__left {
    display: flex;
    gap: 12px;
    align-items: center;
    /* app.css centres every button's content; this row reads left-to-right. */
    justify-content: flex-start;
    text-align: start;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    min-width: 0;
    flex-grow: 1;
  }

  .cat-header__left:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .cat-chev {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-ac-slate-600);
    transition: transform 150ms ease;
    flex-shrink: 0;
  }

  .cat-block--open .cat-chev {
    transform: rotate(90deg);
  }

  .cat-name {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .scope-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgb(46, 168, 117);
    flex-shrink: 0;
  }

  .count-pill {
    border-radius: 100px;
    background: var(--gx-hair);
    padding: 2px 6px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 11px;
    color: var(--gx-slate-500);
    white-space: nowrap;
  }

  .cat-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }

  .cat-actions button {
    border: none;
    background: transparent;
    padding: 0;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }

  .cat-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .select-all {
    color: var(--gx-tx-chip-icon-fg);
  }

  .clear-all {
    color: var(--gx-slate-400);
  }

  .cat-children {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: stretch;
  }

  .perm-item-row {
    min-height: 48px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    padding: 12px 16px 12px 44px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
    box-sizing: border-box;
  }

  .perm-item-left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  /* ".perm-check" — the design's 18px box, wrapped around a real checkbox so
     click, keyboard and screen readers keep working. */
  .perm-check {
    position: relative;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-ac-slate-300);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease;
  }

  .perm-check[data-checked="true"] {
    background: var(--gx-tx-chip-icon-fg);
    box-shadow: inset 0 0 0 1px var(--gx-tx-chip-icon-fg);
  }

  .perm-check input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    box-shadow: none;
    border: 0;
    border-radius: 5px;
  }

  .perm-check svg {
    display: none;
    color: #fff;
    pointer-events: none;
  }

  .perm-check[data-checked="true"] svg {
    display: block;
  }

  .perm-check:has(input:focus-visible) {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .perm-item-label {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-slate-900);
  }

  .perm-info {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-400);
    flex-shrink: 0;
    cursor: pointer;
  }

  .perm-info:hover {
    color: var(--gx-slate-900);
  }

  .perm-item-desc {
    align-self: stretch;
    padding: 0 16px 12px 44px;
    font-family: var(--gx-font);
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-slate-500);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  /* ---- footer ---- */
  .footer-summary {
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-ac-slate-600);
  }

  .footer-summary :global(b) {
    font-weight: 700;
    color: var(--gx-slate-900);
  }

  .footer-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }

  .btn-cancel,
  .btn-create {
    height: 37px;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-cancel {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-org-track);
  }

  .btn-create {
    background: var(--gx-tx-chip-icon-fg);
    color: #fff;
  }

  .btn-create:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .btn-cancel:disabled,
  .btn-create:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-cancel:focus-visible,
  .btn-create:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }
</style>
