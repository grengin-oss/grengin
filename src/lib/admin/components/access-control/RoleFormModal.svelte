<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from "svelte";
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

  let name = $state(role?.name ?? "");
  let roleNameInputEl = $state<HTMLInputElement | null>(null);
  let selectedPermissions = $state<Set<string>>(
    new Set(role?.permissions ?? []),
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
  title={isEdit
    ? $_("admin.accessControl.editRoleTitle")
    : $_("admin.accessControl.addRoleTitle")}
>
  <div class="role-form-modal">
    <div class="role-name-section">
      <label for="role-name" class="section-label"
        >{$_("admin.accessControl.roleName")}</label
      >
      <input
        id="role-name"
        type="text"
        bind:this={roleNameInputEl}
        bind:value={name}
        placeholder={$_("admin.accessControl.roleNamePlaceholder")}
        class="role-name-input"
        disabled={role?.is_system ?? false}
      />
      {#if role?.is_system}
        <span class="help-text"
          >{$_("admin.accessControl.systemRoleNameLocked")}</span
        >
      {/if}
    </div>

    <div
      class="permissions-section"
      role="group"
      aria-labelledby="permissions-label"
    >
      <div class="section-header">
        <span class="section-label" id="permissions-label"
          >{$_("admin.accessControl.permissionsLabel")}</span
        >
        {#if selectedCount > 0}
          <span class="selection-badge"
            >{$_("admin.accessControl.permissionsSelected", {
              values: { count: selectedCount },
            })}</span
          >
        {/if}
      </div>
      <div class="permissions-scroll">
        {#each domainOrder as domain}
          <div class="domain-block">
            <div class="domain-block-header">
              <span class="domain-name">{formatDomain(domain)}</span>
              <div class="domain-buttons">
                <button
                  type="button"
                  class="text-btn"
                  onclick={() => selectAllInDomain(domain)}
                  disabled={isDomainFullySelected(domain)}
                >
                  {$_("admin.accessControl.selectAll")}
                </button>
                <button
                  type="button"
                  class="text-btn"
                  onclick={() => clearDomain(domain)}
                >
                  {$_("admin.accessControl.clearSelection")}
                </button>
              </div>
            </div>
            <div class="permission-list">
              {#each permissionsByDomain[domain] as perm (perm.id)}
                {@const key = toPermissionKey(perm)}
                {@const desc = getPermissionDescription(perm, $_)}
                {@const isExpanded = expandedPermId === perm.id}
                <div
                  class="permission-row"
                  class:is-selected={selectedPermissions.has(key)}
                  class:has-description={!!desc}
                >
                  <label class="permission-row-main">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.has(key)}
                      onchange={() => togglePermission(key)}
                      class="permission-checkbox"
                    />
                    <span class="permission-name"
                      >{formatAction(perm.action)}</span
                    >
                    {#if perm.is_scopeable}
                      <span
                        class="scope-tag"
                        title={$_(
                          "admin.accessControl.departmentScopeSupportTooltip",
                        )}
                      >
                        {$_("admin.accessControl.departmentScopeSupport")}
                      </span>
                    {/if}
                    {#if desc}
                      <button
                        type="button"
                        class="info-btn"
                        onclick={(e) => {
                          e.preventDefault();
                          toggleExpand(perm.id);
                        }}
                        title={desc}
                        aria-expanded={isExpanded}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                      </button>
                    {/if}
                  </label>
                  {#if desc && isExpanded}
                    <div class="permission-description">
                      {desc}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick={onclose} disabled={saving}>
        {$_("common.cancel")}
      </button>
      <button class="btn-primary" onclick={handleSubmit} disabled={saving}>
        {#if saving}
          {isEdit
            ? $_("admin.common.saving")
            : $_("admin.accessControl.creating")}
        {:else}
          {isEdit ? $_("common.save") : $_("admin.accessControl.createRole")}
        {/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  .role-form-modal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
    min-width: 0;
  }

  .section-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: var(--space-sm);
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: var(--space-xs);
    display: block;
  }

  .role-name-input {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 500;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .role-name-input:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .role-name-input::placeholder {
    color: var(--text-secondary);
  }

  .role-name-input:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.12);
  }

  .role-name-input:focus:not(:disabled) {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
  }

  .permissions-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex: 1;
    min-height: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .selection-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-full);
    background: rgba(var(--brand-rgb), 0.15);
    color: var(--brand);
  }

  .permissions-scroll {
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    padding: var(--space-lg);
    background: var(--button-bg);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-lg);
  }

  .domain-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding-left: var(--space-md);
    border-left: 3px solid color-mix(in oklab, var(--brand) 30%, transparent);
  }

  .domain-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .domain-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .domain-buttons {
    display: flex;
    gap: var(--space-sm);
  }

  .text-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--brand);
    cursor: pointer;
    opacity: 0.9;
    box-shadow: none;
  }

  .text-btn:hover:not(:disabled) {
    opacity: 1;
    text-decoration: underline;
  }

  .text-btn:disabled {
    color: var(--text-secondary);
    cursor: default;
    opacity: 0.6;
  }

  .permission-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .permission-row {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.02);
    border: 1px solid transparent;
    transition: background 0.15s ease;
  }

  .permission-row:hover {
    background: rgba(var(--glass-tint), 0.06);
  }

  .permission-row.is-selected {
    background: rgba(var(--brand-rgb), 0.12);
    border-color: rgba(var(--brand-rgb), 0.25);
  }

  .permission-row-main {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    cursor: pointer;
  }

  .permission-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--brand);
    flex-shrink: 0;
  }

  .permission-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .permission-row.is-selected .permission-name {
    color: var(--brand);
  }

  .scope-tag {
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    background: rgba(var(--brand-green-rgb), 0.15);
    color: var(--brand-green);
  }

  .info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .info-btn:hover {
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.1);
  }

  .permission-description {
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    padding-left: calc(1rem + var(--space-md));
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    margin-top: var(--space-md);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-primary,
  .btn-secondary {
    padding: var(--space-md) var(--space-xl);
    font-size: 0.9375rem;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
    border: none;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--brand);
    color: white;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 0.375rem 1.25rem rgba(var(--brand-rgb), 0.25);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--brand-hover);
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 0.5rem 1.5rem rgba(var(--brand-rgb), 0.35);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--glass-stroke-dark);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-primary);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
