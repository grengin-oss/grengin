<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .unassigned-panel {
    display: flex;
    flex-direction: column;
    padding: 20px;
    gap: 16px;
    height: 100%;
    min-height: 0;
    font-family: var(--gx-font);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .panel-header h2 {
    font-weight: 700;
    font-size: 18px;
    line-height: 100%;
    color: var(--gx-slate-900);
    margin: 0;
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    height: 23px;
    padding: 0 10px;
    border-radius: 6px;
    background: var(--gx-org-brand-tint);
    color: var(--gx-org-brand);
    font-size: 12px;
    font-weight: 600;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-track);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-slate-500);
    cursor: pointer;
    box-shadow: none;
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .close-btn:hover {
    background: var(--gx-org-track-hover);
    transform: none;
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 2px;
  }

  .panel-caption {
    margin: -8px 0 0 0;
    color: var(--gx-slate-500);
    font-size: 13px;
  }

  .panel-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-slate-500);
    font-size: 13px;
    text-align: center;
  }

  /* The panel has the detail column's fixed height, so a long list scrolls
     here rather than pushing the page. */
  .user-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .user-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--gx-org-track);
  }

  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--gx-org-brand);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }

  .user-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-email {
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
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
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    outline: 1px dashed var(--gx-hair);
    outline-offset: -1px;
    box-shadow: none;
    font-family: inherit;
    color: var(--gx-slate-500);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      outline-color 120ms ease,
      color 120ms ease;
  }

  .assign-btn:hover {
    outline-color: var(--gx-org-brand-alt);
    color: var(--gx-org-brand-alt);
    background: transparent;
    transform: none;
  }

  .assign-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: 1px;
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
