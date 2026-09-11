<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  // Renders nothing and sends the router somewhere else, so a route that has
  // been retired or hidden lands on a real page instead of an empty shell.
  import { onMount } from "svelte";
  import { navigate } from "svelte-routing";

  interface Props {
    to: string;
  }

  let { to }: Props = $props();

  onMount(() => {
    navigate(to, { replace: true });
  });
</script>
