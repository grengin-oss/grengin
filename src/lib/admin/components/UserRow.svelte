<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
    import type { User } from "../types.js";
    import { _ } from "svelte-i18n";

    interface Props {
        user: User;
        toggleUserStatus: (user: User) => Promise<void>;
        openEditModal: (user: User) => void;
        currentUserId?: string;
        canManageUsers: boolean;
        /** Opens the team picker for this user. When omitted, the department cell stays read-only. */
        onAssignTeam?: (user: User) => void;
    }

    let { user, toggleUserStatus, openEditModal, currentUserId, canManageUsers, onAssignTeam }: Props = $props();
    let isPendingStatusUpdate = $state(false);

    // Check if this is the current user's own row
    const isSelfUser: boolean = $derived((currentUserId && user.id === currentUserId) || false);

    const isActive = $derived(user.status === "active");

    const initials = $derived.by(() => {
        const source = user.name?.trim() || user.email || "";
        const parts = source.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return source.substring(0, 2).toUpperCase() || "?";
    });

    const roleLabels = $derived(user.roles ?? []);
    /** The design shows the first role plus a "+N" counter inside one badge. */
    const primaryRole = $derived(roleLabels[0] ?? "");
    const extraRoleCount = $derived(Math.max(0, roleLabels.length - 1));
    const roleTitle = $derived(roleLabels.join(", "));

    /** Super admins and your own row keep the static dot — they can't be toggled. */
    const canToggleStatus = $derived(canManageUsers && !user.is_super_admin && !isSelfUser);

    const statusToggleTooltip = $derived(
        isActive
            ? $_('admin.users.disableUserTooltip')
            : $_('admin.users.enableUserTooltip')
    );

    async function handleToggleUserStatus() {
        // Prevent self-lockout
        if (isSelfUser || user.is_super_admin) return;

        isPendingStatusUpdate = true;
        try {
            await toggleUserStatus(user);
        } finally {
            isPendingStatusUpdate = false;
        }
    }
</script>

<div class="user-row" class:pending={isPendingStatusUpdate} role="row">
    <div class="user-cell user-cell--name" role="cell">
        <span class="user-avatar" aria-hidden="true">{initials}</span>
        <span class="user-name" title={user.name || user.email}>{user.name || "-"}</span>
    </div>

    <span class="user-cell user-cell--email" role="cell" title={user.email}>{user.email}</span>

    <div class="user-cell user-cell--role" role="cell">
        {#if roleLabels.length === 0}
            <span class="role-badge role-badge--none">{$_('admin.common.noRole')}</span>
        {:else if canManageUsers}
            <button
                type="button"
                class="role-badge"
                onclick={() => openEditModal(user)}
                title={$_('admin.users.editUserTitle')}
            >
                <span>{primaryRole}</span>
                {#if extraRoleCount > 0}
                    <span class="role-badge__extra">+{extraRoleCount}</span>
                {/if}
            </button>
        {:else}
            <span class="role-badge" title={roleTitle}>
                <span>{primaryRole}</span>
                {#if extraRoleCount > 0}
                    <span class="role-badge__extra">+{extraRoleCount}</span>
                {/if}
            </span>
        {/if}
    </div>

    <div class="user-cell user-cell--dept" role="cell">
        {#if canManageUsers && onAssignTeam}
            {#if user.department}
                <button
                    type="button"
                    class="dept-chip"
                    onclick={() => onAssignTeam?.(user)}
                    title={$_('admin.organization.changeTeamTooltip')}
                >
                    <span class="dept-chip__name">{user.department}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M6.5 1.5L8.5 3.5L3.5 8.5H1.5V6.5L6.5 1.5Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
                    </svg>
                </button>
            {:else}
                <button
                    type="button"
                    class="assign-chip"
                    onclick={() => onAssignTeam?.(user)}
                    title={$_('admin.organization.assignToATeamTooltip')}
                >
                    + {$_('admin.organization.assign')}
                </button>
            {/if}
        {:else if user.department}
            <span class="dept-chip dept-chip--static">
                <span class="dept-chip__name">{user.department}</span>
            </span>
        {:else}
            <span class="dept-plain">-</span>
        {/if}
    </div>

    <div class="user-cell user-cell--status" role="cell">
        {#if canToggleStatus}
            <button
                type="button"
                class="status-toggle"
                class:status-toggle--off={!isActive}
                onclick={handleToggleUserStatus}
                disabled={isPendingStatusUpdate}
                aria-pressed={isActive}
                title={statusToggleTooltip}
                aria-label={statusToggleTooltip}
            >
                <span class="status-toggle__thumb"></span>
            </button>
        {:else}
            <span class="status-dot" class:status-dot--off={!isActive} aria-hidden="true"></span>
        {/if}
        <span class="status-label" class:status-label--off={!isActive}>
            {isActive ? $_('admin.common.active') : $_('admin.common.deactivated')}
        </span>
    </div>
</div>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the row rings, the tab-row ring), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

    /* Design 247:24146: 64px row, 16px padding, full hairline ring. */
    .user-row {
        height: 64px;
        display: flex;
        padding: 16px;
        align-items: center;
        align-self: stretch;
        flex-shrink: 0;
        box-shadow: inset 0 0 0 1px var(--gx-hair);
        font-family: var(--gx-font);
        transition: background-color 120ms ease;
    }

    .user-row:hover {
        background: var(--gx-org-table-row-hover);
    }

    .pending {
        opacity: 0.4;
        pointer-events: none;
    }

    .user-cell--name {
        width: 240px;
        flex-shrink: 0;
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
    }

    .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 16px;
        background: var(--gx-org-brand);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-weight: 700;
        font-size: 12px;
        line-height: 100%;
        color: #fff;
    }

    .user-name {
        font-weight: 600;
        font-size: 14px;
        line-height: 100%;
        color: var(--gx-slate-900);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .user-cell--email {
        width: 240px;
        flex-shrink: 0;
        font-weight: 400;
        font-size: 14px;
        line-height: 100%;
        color: var(--gx-slate-500);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .user-cell--role,
    .user-cell--dept {
        width: 160px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        min-width: 0;
    }

    .user-cell--status {
        flex-grow: 1;
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
    }

    .role-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 23px;
        border: 0;
        border-radius: 6px;
        background: var(--gx-org-primary-tint);
        box-shadow: none;
        padding: 4px 10px;
        font-family: var(--gx-font);
        font-weight: 600;
        font-size: 12px;
        line-height: 100%;
        color: var(--gx-org-primary-500);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        transition: filter 120ms ease;
    }

    button.role-badge {
        cursor: pointer;
    }

    button.role-badge:hover {
        background: var(--gx-org-primary-tint);
        filter: brightness(0.97);
        transform: none;
    }

    .role-badge > span {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .role-badge__extra {
        color: var(--gx-slate-500);
        flex-shrink: 0;
    }

    .role-badge--none {
        background: var(--gx-org-track);
        color: var(--gx-slate-400);
    }

    /* Assigned team: white chip with a hairline ring and a small edit glyph. */
    .dept-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 23px;
        border: 0;
        border-radius: 6px;
        background: var(--gx-card);
        box-shadow: inset 0 0 0 1px var(--gx-hair);
        padding: 4px 10px;
        font-family: var(--gx-font);
        font-weight: 500;
        font-size: 12px;
        line-height: 100%;
        color: var(--gx-slate-900);
        white-space: nowrap;
        max-width: 100%;
        overflow: hidden;
        cursor: pointer;
        transition: background-color 120ms ease;
    }

    .dept-chip__name {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .dept-chip svg {
        flex-shrink: 0;
        color: var(--gx-slate-500);
    }

    .dept-chip:hover {
        background: var(--gx-org-track);
        transform: none;
    }

    .dept-chip--static {
        cursor: default;
    }

    .assign-chip {
        display: inline-flex;
        align-items: center;
        height: 23px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        box-shadow: none;
        outline: 1px dashed var(--gx-hair);
        outline-offset: -1px;
        padding: 4px 10px;
        font-family: var(--gx-font);
        font-weight: 500;
        font-size: 12px;
        line-height: 100%;
        color: var(--gx-slate-400);
        white-space: nowrap;
        cursor: pointer;
        transition:
            outline-color 120ms ease,
            color 120ms ease;
    }

    .assign-chip:hover {
        outline-color: var(--gx-org-brand-alt);
        color: var(--gx-org-brand-alt);
        background: transparent;
        transform: none;
    }

    .dept-chip:focus-visible,
    .assign-chip:focus-visible,
    button.role-badge:focus-visible,
    .status-toggle:focus-visible {
        outline: 2px solid var(--gx-org-brand-alt);
        outline-offset: 1px;
    }

    .dept-plain {
        font-size: 13px;
        color: var(--gx-slate-500);
    }

    /* 36x20 pill with a 16px thumb — on = brand fill, thumb right. */
    .status-toggle {
        width: 36px;
        height: 20px;
        border: 0;
        border-radius: 10px;
        background: var(--gx-org-primary-500);
        box-shadow: none;
        display: flex;
        padding: 2px;
        justify-content: flex-end;
        align-items: center;
        flex-shrink: 0;
        cursor: pointer;
        transition:
            background-color 120ms ease,
            justify-content 120ms ease;
    }

    .status-toggle:hover:not(:disabled) {
        background: var(--gx-org-primary-500-hover);
        transform: none;
    }

    .status-toggle--off {
        justify-content: flex-start;
        background: var(--gx-org-toggle-off);
    }

    .status-toggle--off:hover:not(:disabled) {
        background: var(--gx-slate-400);
    }

    .status-toggle:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .status-toggle__thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        flex-shrink: 0;
    }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--gx-org-primary-500);
        flex-shrink: 0;
    }

    .status-dot--off {
        background: var(--gx-slate-400);
    }

    .status-label {
        font-weight: 600;
        font-size: 14px;
        line-height: 100%;
        color: var(--gx-org-primary-500);
        white-space: nowrap;
    }

    .status-label--off {
        color: var(--gx-slate-400);
    }
</style>
