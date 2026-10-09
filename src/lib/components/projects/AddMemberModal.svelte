<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from 'svelte-i18n';
  import MemberPickerModal from '../MemberPickerModal.svelte';
  import type { User } from '../../admin/types';
  import { addProjectMember } from '../../api/projectsApi';
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

  async function handleAdd(users: User[]) {
    const results = await Promise.allSettled(
      users.map((user) => addProjectMember(projectId, { userId: user.id, role: 'member' })),
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
/>
