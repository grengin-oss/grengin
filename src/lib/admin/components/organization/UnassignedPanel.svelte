<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { User } from "../../types.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import RolesBadgeList from "../RolesBadgeList.svelte";

  interface Props {
    users: User[];
    loading?: boolean;
    canAssign?: boolean;
    onClose: () => void;
    onAssign: (user: User) => void;
  }

  let { users, loading = false, canAssign = true, onClose, onAssign }: Props = $props();

  function getInitials(user: User): string {
    const source = user.name?.trim() || user.email;
    if (!source) return "?";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return source.substring(0, 2).toUpperCase();
  }
</script>

<div class="unassigned-panel">
  <div class="panel-header">
    <div class="header-content">
      <h2>{$_("admin.organization.unassigned")}</h2>
      <span class="count-badge">
        {$_("admin.organization.usersCountBadge", { values: { count: users.length } })}
      </span>
    </div>
    <button
      type="button"
      class="close-btn"
      onclick={onClose}
      aria-label={$_("admin.common.closeModal")}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <p class="panel-caption">{$_("admin.organization.unassignedDescription")}</p>

  {#if loading}
    <div class="panel-state">
      <LoadingSpinner />
      <p>{$_("admin.organization.loadingUnassigned")}</p>
    </div>
  {:else if users.length === 0}
    <div class="panel-state">
      <p>{$_("admin.organization.noUnassigned")}</p>
    </div>
  {:else}
    <ul class="user-list">
      {#each users as user (user.id)}
        <li class="user-row">
          <span class="user-avatar" aria-hidden="true">{getInitials(user)}</span>
          <div class="user-info">
            <span class="user-name">{user.name || "-"}</span>
            <span class="user-email" title={user.email}>{user.email}</span>
          </div>
          <div class="user-role">
            <RolesBadgeList roles={user.roles} />
          </div>
          {#if canAssign}
            <button
              type="button"
              class="assign-btn"
              onclick={() => onAssign(user)}
            >
              {$_("admin.organization.assignToTeam")}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .unassigned-panel {
    display: flex;
    flex-direction: column;
    padding: 20px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .panel-header h2 {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: var(--radius-full);
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-primary);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .panel-caption {
    margin: 0 0 16px 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .panel-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-align: center;
  }

  .user-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .user-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: rgba(var(--glass-tint), 0.03);
  }

  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--glass-tint-primary);
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .user-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-email {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-role {
    flex-shrink: 0;
  }

  .assign-btn {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border: 1px solid var(--brand);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .assign-btn:hover {
    background: var(--brand);
    color: var(--bg-primary);
  }

  .assign-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .user-row {
      flex-wrap: wrap;
    }

    .user-info {
      flex: 1 1 60%;
    }

    .assign-btn {
      margin-inline-start: auto;
    }
  }
</style>
