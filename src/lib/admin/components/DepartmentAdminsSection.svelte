<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department } from "../types.js";
  import { departmentsStore } from "../stores/index.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import { getUser, getUsers } from "../../api/admin/users.js";
  import * as departmentsApi from "../../api/admin/departments.js";
  import { tick } from "svelte";
  
  interface Props {
    department: Department;
    canManage?: boolean;
  }
  
  let { department, canManage = true }: Props = $props();
  
  let adminUsers = $state<any[]>([]);
  let loadingAdmins = $state(false);
  let showAddAdminSearch = $state(false);
  let adminSearchQuery = $state("");
  let adminSearchResults = $state<any[]>([]);
  let searchingAdmins = $state(false);
  let addingAdminId = $state<string | null>(null);
  let removingAdminId = $state<string | null>(null);
  let showRemoveAdminConfirm = $state(false);
  let adminToRemove = $state<any | null>(null);
  let searchTimeout: number | undefined;
  let searchInputRef = $state<HTMLInputElement | null>(null);
  
  async function loadAdminUsers() {
    if(!department || !department.admin_ids || department.admin_ids.length === 0) {
      adminUsers = [];
      return;
    }

    loadingAdmins = true;
    const deptId = department?.id;

    try {
      const userPromises = department.admin_ids?.map(userId => getUser(userId)) || [];
      const users = await Promise.all(userPromises);
      if(deptId && deptId === department?.id && users.length === department.admin_ids.length) {
        adminUsers = users;
      }
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToLoadAdmins');
      toast.error(errorMessage);
      adminUsers = [];
    } finally {
      loadingAdmins = false;
    }
  }
  
  $effect(() => {
      resetSearch();
      loadAdminUsers();
  });

  function resetSearch() {
    showAddAdminSearch = false;
    adminSearchQuery = '';
    adminSearchResults = [];
    addingAdminId = null;
    tick().then(() => {
      searchInputRef?.blur();
    });
  }
  
  function handleAdminsUpdated() {
    Promise.all([
      departmentsStore.fetchAdministeredDepartments(),
      departmentsStore.fetchDepartmentsTree(),
    ]);
  }
  
  async function searchAdminUsers(query: string) {
    if (!query.trim()) {
      adminSearchResults = [];
      return;
    }
    
    searchingAdmins = true;
    try {
      const response = await getUsers({ 
        search: query, 
        limit: 10,
        status: 'active'
      });
      adminSearchResults = response.users.filter(u => !department.admin_ids.includes(u.id));
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToSearchUsers');
      toast.error(errorMessage);
      adminSearchResults = [];
    } finally {
      searchingAdmins = false;
    }
  }
  
  function handleAdminSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    adminSearchQuery = target.value;
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
      searchAdminUsers(adminSearchQuery);
    }, 300);
  }
  
  async function toggleAddAdminSearch() {
    showAddAdminSearch = !showAddAdminSearch;
    if (!showAddAdminSearch) {
      adminSearchQuery = "";
      adminSearchResults = [];
    } else {
      await tick();
      searchInputRef?.focus();
    }
  }
  
  async function handleAddAdmin(user: any) {
    addingAdminId = user.id;
    try {
      const updatedAdminIds = [...department.admin_ids, user.id];
      await departmentsApi.updateDepartment(department.id, { admin_ids: updatedAdminIds });
      toast.success($_('admin.departments.adminAdded'));
      resetSearch();
      handleAdminsUpdated();
    } catch (error) {
      addingAdminId = null;
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToAddAdmin');
      toast.error(errorMessage);
    }
  }
  
  function confirmRemoveAdmin(admin: any) {
    adminToRemove = admin;
    showRemoveAdminConfirm = true;
  }
  
  async function handleRemoveAdmin() {
    if (!adminToRemove) return;
    
    showRemoveAdminConfirm = false;
    removingAdminId = adminToRemove.id;
    
    try {
      const updatedAdminIds = department.admin_ids.filter(id => id !== adminToRemove.id);
      await departmentsApi.updateDepartment(department.id, { admin_ids: updatedAdminIds });
      toast.success($_('admin.departments.adminRemoved'));
      handleAdminsUpdated();
    } catch (error) {
      const errorMessage = error instanceof ApiError 
        ? getLocalizedError(error, 'description', $_) 
        : $_('admin.departments.failedToRemoveAdmin');
      toast.error(errorMessage);
    } finally {
      removingAdminId = null;
      adminToRemove = null;
    }
  }
</script>

<div class="admins-panel">
  <div class="admins-header">
    <span class="admins-title">{$_('admin.departments.departmentAdmins')}</span>
    {#if canManage}
      <button type="button" class="btn-primary" onclick={toggleAddAdminSearch}>
        {$_('admin.departments.addAdmin')}
      </button>
    {/if}
  </div>
  
  {#if canManage && showAddAdminSearch}
    <div class="admin-search-wrapper">
      <div class="admin-search-box">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 12L16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          type="text"
          class="admin-search-input"
          placeholder={$_('admin.departments.searchUsersToAdd')}
          bind:value={adminSearchQuery}
          bind:this={searchInputRef}
          oninput={handleAdminSearchInput}
        />
        <button class="search-close-btn" onclick={toggleAddAdminSearch} aria-label="Close search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      
      {#if searchingAdmins}
        <div class="admin-search-dropdown">
          <div class="search-loading">
            <LoadingSpinner />
          </div>
        </div>
      {:else if adminSearchQuery && adminSearchResults.length > 0}
        <div class="admin-search-dropdown">
          {#each adminSearchResults as user (user.id)}
            <button
              type="button"
              class="search-result-item"
              onclick={() => handleAddAdmin(user)}
              disabled={addingAdminId !== null}
            >
              <div class="user-avatar">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M4 17C4 13.6863 6.68629 11 10 11C13.3137 11 16 13.6863 16 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="user-info">
                <div class="user-name">{user.name || user.email}</div>
                <div class="user-email">{user.email}</div>
              </div>
              {#if addingAdminId === user.id}
                <div class="adding-spinner">
                  <LoadingSpinner />
                </div>
              {:else}
                <div class="add-button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {:else if adminSearchQuery && adminSearchResults.length === 0 && !searchingAdmins}
        <div class="admin-search-dropdown">
          <div class="no-results">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="20" cy="20" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M28 28L36 36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M20 16V24M16 20H24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>{$_('admin.departments.noUsersFound')}</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  {#if loadingAdmins}
    <div class="admins-loading">
      <LoadingSpinner />
    </div>
  {:else if adminUsers.length === 0}
    <div class="admins-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M19 8v6M22 11h-6"/>
      </svg>
      <span>{$_('admin.departments.noAdmins')}</span>
    </div>
  {:else}
    <div class="admins-list">
      {#each adminUsers as admin (admin.id)}
        <div class="admin-item">
          <div class="admin-info">
            <div class="admin-name">{admin.name || admin.email}</div>
            <div class="admin-email">{admin.email}</div>
          </div>
          <button 
            class="btn-remove-admin"
            onclick={() => confirmRemoveAdmin(admin)}
            disabled={removingAdminId === admin.id}
          >
            {#if removingAdminId === admin.id}
              {$_('admin.common.removing')}...
            {:else}
              {$_('admin.departments.removeAdmin')}
            {/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showRemoveAdminConfirm && adminToRemove}
  <Modal 
    isOpen={showRemoveAdminConfirm}
    onclose={() => { showRemoveAdminConfirm = false; adminToRemove = null; }}
    title={$_('admin.departments.removeAdminConfirmTitle')}
  >
    <div class="remove-confirm">
      <p>{$_('admin.departments.removeAdminConfirmMessage', { values: { name: adminToRemove.name || adminToRemove.email } })}</p>
      <p class="warning">{$_('admin.departments.removeAdminConfirmWarning')}</p>
      
      <div class="modal-actions">
        <button class="btn-secondary" onclick={() => { showRemoveAdminConfirm = false; adminToRemove = null; }}>
          {$_('common.cancel')}
        </button>
        <button class="btn-danger" onclick={handleRemoveAdmin}>
          {$_('admin.departments.removeAdmin')}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .admins-panel {
    align-self: stretch;
    width: 100%;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    align-items: flex-start;
    font-family: var(--gx-font);
  }

  .admins-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 12px;
  }

  .admins-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .btn-primary {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-primary:hover {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .admins-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: stretch;
    padding: 32px 0;
  }

  .admins-empty {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 32px 0;
    justify-content: center;
    align-items: center;
    align-self: stretch;
    color: var(--gx-slate-400);
  }

  .admins-empty span {
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .admins-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
  }

  .admin-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--gx-org-track);
  }

  .admin-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .admin-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .admin-email {
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  .btn-remove-admin {
    height: 28px;
    padding: 0 12px;
    background: transparent;
    border: 0;
    box-shadow: inset 0 0 0 1px var(--gx-org-danger-line);
    border-radius: 6px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--gx-org-danger);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .btn-remove-admin:hover:not(:disabled) {
    background: var(--gx-org-danger-bg);
    transform: none;
  }

  .btn-remove-admin:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .admin-search-wrapper {
    position: relative;
    align-self: stretch;
    animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .admin-search-box {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--glass-bg-dark);
    backdrop-filter: blur(12px);
    border: 1.5px solid var(--glass-stroke-dark);
    border-radius: 12px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px color-mix(in oklab, black 5%, transparent),
                inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
  }
  
  .admin-search-box:focus-within {
    border-color: var(--brand);
    background: var(--button-bg);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 12%, transparent),
                0 4px 16px color-mix(in oklab, var(--brand) 15%, transparent),
                inset 0 1px 0 color-mix(in oklab, white 8%, transparent);
    transform: translateY(-1px);
  }
  
  .search-icon {
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: color 0.2s;
  }
  
  .admin-search-box:focus-within .search-icon {
    color: var(--brand);
  }
  
  .admin-search-input {
    padding: 0 8px;
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    color: var(--text-primary);
    outline: none;
    font-weight: 450;
    letter-spacing: -0.01em;
    box-shadow: none;
  }
  
  .admin-search-input:focus {
    border: none;
    outline: none;
    box-shadow: none;
  }
  
  .admin-search-input::placeholder {
    color: var(--text-secondary);
    font-weight: 400;
  }
  
  .search-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }
  
  .search-close-btn:hover {
    background: color-mix(in oklab, var(--brand-red) 15%, transparent);
    color: var(--brand-red);
    transform: scale(1.05);
  }
  
  .search-close-btn:active {
    transform: scale(0.95);
  }
  
  .admin-search-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    max-height: 360px;
    overflow-y: auto;
    background: var(--glass-bg-dark);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: 12px;
    box-shadow: 0 8px 24px color-mix(in oklab, black 12%, transparent),
                0 2px 8px color-mix(in oklab, black 8%, transparent),
                inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
    animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow-x: hidden;
    z-index: 50;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  .search-loading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 48px 20px;
  }
  
  .search-result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-bottom: 1px solid color-mix(in oklab, var(--glass-stroke-dark) 50%, transparent);
    position: relative;
  }
  
  .search-result-item:last-child {
    border-bottom: none;
  }
  
  .search-result-item:hover:not(:disabled) {
    background: var(--button-bg);
    padding-left: 22px;
  }

  .search-result-item:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
    background: var(--button-bg);
    padding-left: 24px;
  }
  
  .search-result-item:active:not(:disabled) {
    transform: scale(0.99);
  }
  
  .search-result-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--button-bg);
    border: 1.5px solid var(--glass-stroke-dark);
    border-radius: 50%;
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: all 0.2s;
  }
  
  .search-result-item:hover:not(:disabled) .user-avatar {
    background: var(--btn-secondary);
    border-color: var(--brand);
    color: var(--brand);
    transform: scale(1.05);
  }
  
  .search-result-item .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  
  .search-result-item .user-name {
    font-size: 14.5px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }
  
  .search-result-item .user-email {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .add-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background: var(--brand);
    border-radius: 50%;
    color: white;
    flex-shrink: 0;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 6px color-mix(in oklab, var(--brand) 25%, transparent);
  }
  
  .search-result-item:hover:not(:disabled) .add-button {
    transform: scale(1.15) rotate(90deg);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--brand) 40%, transparent);
    background: var(--brand-hover);
  }
  
  .search-result-item:active:not(:disabled) .add-button {
    transform: scale(1.05) rotate(90deg);
  }
  
  .adding-spinner {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 48px 24px;
    text-align: center;
  }
  
  .no-results svg {
    color: var(--text-secondary);
    opacity: 0.4;
    animation: pulse 2s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.6;
    }
  }
  
  .no-results p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 450;
  }
  
  .remove-confirm {
    padding: 20px;
  }
  
  .remove-confirm p {
    margin: 0 0 12px 0;
    color: var(--text-primary);
  }
  
  .remove-confirm .warning {
    color: var(--brand-red);
    font-size: 14px;
  }
  
  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
  }
  
  .btn-secondary {
    padding: 10px 20px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }
  
  .btn-danger {
    padding: 10px 20px;
    background: var(--brand-red);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .btn-danger:hover {
    background: color-mix(in oklab, var(--brand-red) 90%, black);
  }
</style>
