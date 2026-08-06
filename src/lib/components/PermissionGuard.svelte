<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Snippet } from "svelte";
  import { permissionsStore } from "../features/auth/index.js";
  import Forbidden from "./Forbidden.svelte";
  import LoadingSpinner from "../admin/components/LoadingSpinner.svelte";

  interface Props {
    permission: string;
    requireGlobal?: boolean;
    children?: Snippet;
  }

  let { permission, requireGlobal = false, children }: Props = $props();

  let canAccess = $derived(
    requireGlobal
      ? permissionsStore.isPermissionGlobal(permission)
      : permissionsStore.hasPermission(permission),
  );
  let isReady = $derived(
    permissionsStore.hasFetched && !permissionsStore.isLoading,
  );
</script>

{#if canAccess}
  {@render children?.()}
{:else if !isReady}
  <div class="permission-loading surface-elevated rounded-2xl">
    <LoadingSpinner />
  </div>
{:else}
  <Forbidden />
{/if}

<style>
  .permission-loading {
    margin: var(--space-2xl) auto;
    max-width: 560px;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    align-items: center;
    text-align: center;
    color: var(--text-secondary);
  }
</style>
