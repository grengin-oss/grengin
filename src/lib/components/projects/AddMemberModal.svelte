<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import Modal from '$lib/admin/components/Modal.svelte';
  import { getUsers } from '../../api/admin/users';
  import type { User } from '../../admin/types';
  import { addProjectMember, removeProjectMember } from '../../api/projectsApi';
  import type { ProjectRole } from '../../types/project';
  import { ApiError } from '../../api/client';
  import { toast } from '../Toaster.svelte';

  interface Props {
    isOpen: boolean;
    projectId: string;
    projectName: string;
    onclose: () => void;
  }

  let { isOpen = $bindable(), projectId, projectName, onclose }: Props = $props();

  interface AddedMember {
    user: User;
    role: ProjectRole;
  }

  let searchQuery = $state('');
  let results = $state<User[]>([]);
  let searching = $state(false);
  let role = $state<ProjectRole>('member');
  let added = $state<AddedMember[]>([]);
  let addingId = $state<string | null>(null);
  let removingId = $state<string | null>(null);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    const q = searchQuery.trim();
    if (!q) {
      results = [];
      return;
    }
    searchTimeout = setTimeout(async () => {
      searching = true;
      try {
        const response = await getUsers({ search: q, limit: 10 });
        results = response.users;
      } catch {
        results = [];
      } finally {
        searching = false;
      }
    }, 300);
  }

  async function handleAdd(user: User) {
    addingId = user.id;
    try {
      await addProjectMember(projectId, { userId: user.id, role });
      added = [{ user, role }, ...added.filter((m) => m.user.id !== user.id)];
      results = results.filter((u) => u.id !== user.id);
      searchQuery = '';
      toast.success($_('projects.addedToProject', { values: { name: user.name || user.email, project: projectName } }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error($_('projects.alreadyMember', { values: { name: user.name || user.email } }));
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error($_('projects.onlyOwnerCanAdd'));
      } else {
        toast.error($_('projects.addMemberError'));
      }
    } finally {
      addingId = null;
    }
  }

  async function handleRemove(member: AddedMember) {
    removingId = member.user.id;
    try {
      await removeProjectMember(projectId, member.user.id);
      added = added.filter((m) => m.user.id !== member.user.id);
      toast.success($_('projects.memberRemovedShort', { values: { name: member.user.name || member.user.email } }));
    } catch {
      toast.error($_('projects.removeMemberError'));
    } finally {
      removingId = null;
    }
  }

  function handleClose() {
    searchQuery = '';
    results = [];
    added = [];
    onclose();
  }
</script>

<Modal {isOpen} title={$_('projects.addMembersTitle')} onclose={handleClose}>
  {#snippet children()}
    <div class="add-member">
      <p class="hint">
        {@html $_('projects.addMembersHint', { values: { name: projectName } })}
      </p>

      <div class="field">
        <span class="field-label">{$_('projects.role')}</span>
        <div class="role-toggle">
          <button
            type="button"
            class="role-btn"
            class:active={role === 'member'}
            onclick={() => (role = 'member')}
          >
            {$_('projects.roleMember')}
          </button>
          <button
            type="button"
            class="role-btn"
            class:active={role === 'owner'}
            onclick={() => (role = 'owner')}
          >
            {$_('projects.roleOwner')}
          </button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="member-search">{$_('projects.findPeople')}</label>
        <div class="search-box">
          <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            id="member-search"
            type="text"
            class="search-input"
            placeholder={$_('projects.searchByNameEmailEllipsis')}
            bind:value={searchQuery}
            oninput={handleSearchInput}
            autocomplete="off"
          />
        </div>

        {#if searching}
          <div class="list-state">{$_('projects.searching')}</div>
        {:else if searchQuery.trim() && results.length === 0}
          <div class="list-state">{$_('projects.noMatchingUsersShort')}</div>
        {:else if results.length > 0}
          <div class="result-list">
            {#each results as user (user.id)}
              <div class="result-row">
                <div class="user-info">
                  <span class="user-name">{user.name || user.email}</span>
                  {#if user.name}<span class="user-email">{user.email}</span>{/if}
                  {#if user.department}<span class="user-dept">{user.department}</span>{/if}
                </div>
                <button class="add-btn" onclick={() => handleAdd(user)} disabled={addingId === user.id}>
                  {addingId === user.id ? $_('projects.adding') : $_('projects.add')}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if added.length > 0}
        <div class="field">
          <span class="field-label">{$_('projects.addedInSession')}</span>
          <div class="added-list">
            {#each added as member (member.user.id)}
              <div class="added-row">
                <div class="user-info">
                  <span class="user-name">{member.user.name || member.user.email}</span>
                  <span class="role-tag">{member.role}</span>
                </div>
                <button
                  class="remove-btn"
                  onclick={() => handleRemove(member)}
                  disabled={removingId === member.user.id}
                  aria-label={$_('projects.removeMember')}
                  title={$_('projects.removeMember')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn-done" onclick={handleClose}>{$_('projects.done')}</button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .add-member {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .field-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .role-toggle {
    display: flex;
    gap: var(--space-xs);
  }

  .role-btn {
    padding: 6px 16px;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .role-btn.active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
    font-weight: 600;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    inset-inline-start: var(--space-md);
    color: var(--text-secondary);
    opacity: 0.6;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.6rem 0.9rem 0.6rem 2.4rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--btn-secondary);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.15);
  }

  .list-state {
    padding: var(--space-md);
    font-size: 0.82rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .result-list,
  .added-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
  }

  .result-row,
  .added-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-email,
  .user-dept {
    font-size: 0.72rem;
    color: var(--text-secondary);
    opacity: 0.75;
  }

  .role-tag {
    align-self: flex-start;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--brand);
    background: rgba(var(--brand-rgb), 0.1);
    border: 1px solid rgba(var(--brand-rgb), 0.2);
    padding: 1px 8px;
    border-radius: var(--radius-full);
  }

  .add-btn {
    flex-shrink: 0;
    padding: 5px 14px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--brand);
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .add-btn:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .remove-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .remove-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger, #ef4444);
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-sm);
    border-top: 1px solid var(--glass-stroke-dark);
  }

  .btn-done {
    padding: var(--space-sm) var(--space-xl);
    border: 1px solid var(--glass-stroke-dark);
    background: transparent;
    color: var(--text-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-done:hover {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }
</style>
