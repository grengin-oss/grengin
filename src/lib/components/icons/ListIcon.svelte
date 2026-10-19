<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  // List-view icon. Strokes with `currentColor` so it follows the surrounding
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
    d="M1.75 2.9162H1.75583M1.75 7H1.75583M1.75 11.0838H1.75583M4.66667 2.9162H12.25M4.66667 7H12.25M4.66667 11.0838H12.25"
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
