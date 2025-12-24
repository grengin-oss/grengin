<script lang="ts">
    import type { User } from "../types.js";

    interface Props {
        user: User;
        toggleUserStatus: (user: User) => Promise<void>;
        openEditModal: (user: User) => void;
    }

    let { user, toggleUserStatus, openEditModal }: Props = $props();
    let isPendingStatusUpdate = $state(false);
    
    // Local checkbox state - synced with user.status
    let checkboxChecked = $state(user.status === "active");
    
    // Sync checkboxChecked when user.status changes (after successful refetch)
    $effect(() => {
        if (!isPendingStatusUpdate) {
            checkboxChecked = user.status === "active";
        }
    });

    async function handleToggleUserStatus() {
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
        <span class="role-badge {user.role}">
            {user.role || "user"}
        </span>
    </td>
    <td>{user.department || "-"}</td>
    <td>
        {#if !user.is_super_admin}
            <label class="status-switch">
                <input
                    type="checkbox"
                    checked={checkboxChecked}
                    onchange={handleToggleUserStatus}
                />
                <span class="status-slider"></span>
                <span class="status-label">
                    {user.status === "active" ? "Active" : "Deactivated"}
                </span>
            </label>
        {:else}
            <span class="status-badge active">Active</span>
        {/if}
    </td>
    <td
        >{user.created_at
            ? new Date(user.created_at).toLocaleDateString()
            : "-"}</td
    >
    <td>
        <div class="actions">
            <button
                class="action-btn edit"
                onclick={() => openEditModal(user)}
                title="Edit user"
            >
                ✏️
            </button>
        </div>
    </td>
</tr>

<style>
    .pending {
        opacity: 0.3;
        pointer-events: none;
    }

    .role-badge,
    .status-badge {
        display: inline-block;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .role-badge.admin {
        background: rgba(var(--brand-rgb), 0.15);
        color: var(--brand);
    }

    .role-badge.user {
        background: rgba(var(--glass-tint), 0.1);
        color: var(--text-secondary);
    }

    .status-badge.active {
        background: rgba(var(--brand-green-rgb), 0.15);
        color: var(--brand-green);
    }

    .status-badge.deactivated {
        background: rgba(var(--brand-red-rgb), 0.15);
        color: var(--brand-red);
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

    .reset-btn {
        max-width: 100px;
    }

    .action-btn:hover {
        background: rgba(var(--glass-tint), 0.08);
        transform: scale(1.1);
    }

    /* Status Switch */
    .status-switch {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        cursor: pointer;
        position: relative;
    }

    .status-switch input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
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
