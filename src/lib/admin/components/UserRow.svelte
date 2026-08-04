<script lang="ts">
    import type { User } from "../types.js";
    import { _ } from "svelte-i18n";
    import { formatDate } from "../../utils/format.js";
    import RolesBadgeList from "./RolesBadgeList.svelte";

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

    // Local checkbox state - synced with user.status
    let checkboxChecked = $state(user.status === "active");

    const statusToggleTooltip = $derived(
        isSelfUser
            ? $_('admin.users.cannotToggleOwnStatus')
            : user.status === "active"
                ? $_('admin.users.disableUserTooltip')
                : $_('admin.users.enableUserTooltip')
    );

    // Sync checkboxChecked when user.status changes (after successful refetch)
    $effect(() => {
        if (!isPendingStatusUpdate) {
            checkboxChecked = user.status === "active";
        }
    });

    async function handleToggleUserStatus() {
        // Prevent self-lockout
        if (isSelfUser) {
            return;
        }

        isPendingStatusUpdate = true;

        // Store original state BEFORE any changes
        const originalChecked = checkboxChecked;
        
        // Optimistically update checkbox immediately (matches visual state)
        checkboxChecked = !originalChecked;
        
        try {
            await toggleUserStatus(user);
            // On success, user.status will be updated via refetch,
            // and $effect will sync checkboxChecked automatically
        } catch (err) {
            // On error, revert checkbox to original state
            checkboxChecked = originalChecked;
        } finally {
            isPendingStatusUpdate = false;
        }
    }
</script>

<tr class:pending={isPendingStatusUpdate}>
    <td>{user.name || "-"}</td>
    <td>{user.email}</td>
    <td>
        <RolesBadgeList roles={user.roles}/>
    </td>
    <td>
        {#if canManageUsers && onAssignTeam}
            {#if user.department}
                <span class="department-cell">
                    <span class="department-name">{user.department}</span>
                    <button
                        type="button"
                        class="department-edit-btn"
                        onclick={() => onAssignTeam?.(user)}
                        title={$_('admin.organization.changeTeamTooltip')}
                        aria-label={$_('admin.organization.changeTeamTooltip')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M12 20h9"/>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                    </button>
                </span>
            {:else}
                <button
                    type="button"
                    class="department-assign-pill"
                    onclick={() => onAssignTeam?.(user)}
                    title={$_('admin.organization.assignToATeamTooltip')}
                    aria-label={$_('admin.organization.assignToATeamTooltip')}
                >
                    {$_('admin.organization.assign')}
                </button>
            {/if}
        {:else}
            {user.department || "-"}
        {/if}
    </td>
    <td>
        {#if !user.is_super_admin}
            {#if canManageUsers}
                <label 
                    class="status-switch" 
                    class:disabled={isSelfUser}
                    title={statusToggleTooltip}
                >
                    <input
                        type="checkbox"
                        checked={checkboxChecked}
                        onchange={handleToggleUserStatus}
                        disabled={isSelfUser}
                        aria-label={$_('admin.users.toggleUserStatus') || `Toggle ${user.name} status`}
                    />
                    <span class="status-slider" aria-hidden="true"></span>
                    <span class="status-label">
                        {user.status === "active" ? $_('admin.common.active') : $_('admin.common.deactivated')}
                    </span>
                </label>
            {:else}
                <span class="status-label">
                    {user.status === "active" ? $_('admin.common.active') : $_('admin.common.deactivated')}
                </span>
            {/if}
        {:else}
            <span class="status-badge active">{$_('admin.common.active')}</span>
        {/if}
    </td>
    <td>{user.created_at ? formatDate(user.created_at) : "-"}</td>
    {#if canManageUsers}
        <td>
            <div class="actions">
                <button
                    class="action-btn edit"
                    onclick={() => openEditModal(user)}
                    title={$_('admin.users.editUserTitle')}
                    aria-label={$_('admin.users.editUserTitle') || `Edit ${user.name}`}
                >
                    ✏️
                </button>
            </div>
        </td>
    {/if}
</tr>

<style>
    .pending {
        opacity: 0.3;
        pointer-events: none;
    }

    .status-badge {
        display: inline-block;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: none;
    }

    .status-badge.active {
        background: rgba(var(--brand-green-rgb), 0.15);
        color: var(--brand-green);
    }

    /* Department cell */
    .department-cell {
        display: inline-flex;
        align-items: center;
        gap: var(--space-sm);
    }

    .department-name {
        color: var(--text-primary);
    }

    .department-edit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .department-edit-btn:hover {
        background: rgba(var(--glass-tint), 0.08);
        color: var(--brand);
    }

    .department-edit-btn:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
    }

    .department-assign-pill {
        display: inline-flex;
        align-items: center;
        padding: var(--space-xs) var(--space-md);
        border: 1px dashed color-mix(in oklab, var(--brand) 60%, transparent);
        border-radius: var(--radius-full);
        background: color-mix(in oklab, var(--brand) 8%, transparent);
        color: var(--brand);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .department-assign-pill:hover {
        background: color-mix(in oklab, var(--brand) 16%, transparent);
        border-style: solid;
    }

    .department-assign-pill:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
    }

    .actions {
        display: flex;
        gap: var(--space-sm);
    }

    .action-btn {
        padding: var(--space-xs) var(--space-sm);
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: all 0.2s ease;
        font-size: 1rem;
    }

    .action-btn:hover {
        background: rgba(var(--glass-tint), 0.08);
        transform: scale(1.1);
    }

    .action-btn:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
    }

    /* Status Switch */
    .status-switch {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        cursor: pointer;
        position: relative;
    }

    .status-switch.disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .status-switch input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }

    .status-switch input[type="checkbox"]:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
    }

    .status-switch input[type="checkbox"]:disabled {
        cursor: not-allowed;
    }

    .status-slider {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        background: rgba(143, 143, 143, 0.2);
        border-radius: 24px;
        transition: all 0.3s ease;
        flex-shrink: 0;
    }

    .status-switch input:focus-visible ~ .status-slider {
        outline: 2px solid var(--brand);
        outline-offset: 2px;
        border-radius: 24px;
    }

    .status-slider::before {
        content: "";
        position: absolute;
        height: 18px;
        width: 18px;
        left: 3px;
        top: 3px;
        background: var(--brand-red);
        border-radius: 50%;
        transition: all 0.3s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .status-switch input:checked + .status-slider::before {
        background: var(--brand-green);
        transform: translateX(20px);
    }

    .status-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--text-secondary);
        min-width: 90px;
    }

    .status-switch:hover .status-slider {
        opacity: 0.9;
    }
</style>
