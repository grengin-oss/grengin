<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import * as departmentsApi from "../../api/admin/departments.js";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import MemberPickerModal from "../../components/MemberPickerModal.svelte";
  import type { User } from "../types.js";

  interface Props {
    departmentId: string;
    /** Shown as "to {name}" under the title. */
    departmentName?: string;
    onclose: () => void;
    onSuccess: () => void;
  }

  let { departmentId, departmentName, onclose, onSuccess }: Props = $props();

  async function handleAddMembers(users: User[]) {
    try {
      await departmentsApi.addDepartmentMembers(
        departmentId,
        users.map((u) => u.id),
      );
      toast.success($_("admin.departments.memberAdded"));
      onSuccess();
      onclose();
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : $_('admin.departments.failedToAddMember');
      toast.error(errorMessage);
    }
  }
</script>

<MemberPickerModal
  isOpen={true}
  title={$_("admin.departments.addMembers")}
  subtitle={departmentName
    ? $_("common.addMembers.subtitle", { values: { name: departmentName } })
    : undefined}
  {onclose}
  onsubmit={handleAddMembers}
/>
