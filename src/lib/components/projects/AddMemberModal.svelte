<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import MemberPickerModal from '../MemberPickerModal.svelte';
  import type { User } from '../../admin/types';
  import { addProjectMember } from '../../api/projectsApi';
  import type { ProjectRole } from '../../types/project';
  import { ApiError } from '../../api/client';
  import { toast } from '../Toaster.svelte';

  interface Props {
    isOpen: boolean;
    projectId: string;
    projectName: string;
    /** User ids already on the project — listed but not selectable. */
    existingMemberIds?: ReadonlySet<string>;
    onclose: () => void;
  }

  let { isOpen = $bindable(), projectId, projectName, existingMemberIds, onclose }: Props = $props();

  let role = $state<ProjectRole>('member');

  // Each open starts back on "member", as the old modal did.
  $effect(() => {
    if (isOpen) role = 'member';
  });

  async function handleAdd(users: User[]) {
    const results = await Promise.allSettled(
      users.map((user) => addProjectMember(projectId, { userId: user.id, role })),
    );

    const added = users.filter((_, i) => results[i].status === 'fulfilled');
    const failures = results
      .map((r, i) => ({ r, user: users[i] }))
      .filter((f): f is { r: PromiseRejectedResult; user: User } => f.r.status === 'rejected');

    if (added.length === 1) {
      toast.success(
        $_('projects.addedToProject', {
          values: { name: added[0].name || added[0].email, project: projectName },
        }),
      );
    } else if (added.length > 1) {
      toast.success(
        $_('projects.addedManyToProject', { values: { count: added.length, project: projectName } }),
      );
    }

    if (failures.some((f) => f.r.reason instanceof ApiError && f.r.reason.status === 403)) {
      toast.error($_('projects.onlyOwnerCanAdd'));
    } else {
      for (const { r, user } of failures) {
        if (r.reason instanceof ApiError && r.reason.status === 409) {
          toast.error($_('projects.alreadyMember', { values: { name: user.name || user.email } }));
        } else {
          toast.error($_('projects.addMemberError'));
          break;
        }
      }
    }

    // Close once anything landed; the parent refetches the member list on close.
    if (added.length > 0 || failures.every((f) => f.r.reason instanceof ApiError && f.r.reason.status === 409)) {
      onclose();
    }
  }
</script>

<MemberPickerModal
  {isOpen}
  title={$_('projects.addMembersTitle')}
  subtitle={$_('common.addMembers.subtitle', { values: { name: projectName } })}
  existingIds={existingMemberIds}
  {onclose}
  onsubmit={handleAdd}
>
  {#snippet beforeSearch()}
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
  {/snippet}
</MemberPickerModal>

<style>
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
    background: rgb(var(--brand-rgb) / 0.1);
    color: var(--brand);
    font-weight: 600;
  }
</style>
