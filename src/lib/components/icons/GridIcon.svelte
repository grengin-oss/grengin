<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  // Grid-view icon. Strokes with `currentColor` so it follows the surrounding
  // text colour (e.g. a view-toggle's active/inactive state), never a fixed hue.
  let { size = 14 }: { size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 14 14"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <path
    d="M1.75 5.25H5.25M1.75 5.25V8.75M1.75 5.25V2.91667C1.75 2.27233 2.27233 1.75 2.91667 1.75H5.25M5.25 5.25H8.75M5.25 5.25V1.75M5.25 5.25V8.75M8.75 5.25H12.25M8.75 5.25V1.75M8.75 5.25V8.75M12.25 5.25V2.91667C12.25 2.27233 11.7277 1.75 11.0833 1.75H8.75M12.25 5.25V8.75M1.75 8.75H5.25M1.75 8.75V11.0833C1.75 11.7277 2.27233 12.25 2.91667 12.25H5.25M5.25 8.75H8.75M5.25 8.75V12.25M8.75 8.75H12.25M8.75 8.75V12.25M12.25 8.75V11.0833C12.25 11.7277 11.7277 12.25 11.0833 12.25H8.75M5.25 1.75H8.75M5.25 12.25H8.75"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  />
</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }
</style>
