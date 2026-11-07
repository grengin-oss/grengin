<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0

A connector's brand icon, loaded from the published catalog. Falls back to a
neutral lettered tile when the image is missing or blocked, so a card never
renders a broken-image glyph.
-->
<script lang="ts">
  interface Props {
    src: string;
    name: string;
    size?: number;
  }
  let { src, name, size = 32 }: Props = $props();
  let failed = $state(false);

  // Reset the fallback if the source changes (e.g. navigating between details).
  $effect(() => {
    void src;
    failed = false;
  });

  const initial = $derived((name?.trim()?.[0] ?? '?').toUpperCase());
</script>

{#if src && !failed}
  <img
    class="cn-icon"
    {src}
    alt={name}
    width={size}
    height={size}
    loading="lazy"
    onerror={() => (failed = true)}
  />
{:else}
  <span class="cn-icon cn-icon-fallback" style="width:{size}px;height:{size}px;font-size:{size * 0.44}px;">
    {initial}
  </span>
{/if}

<style>
  .cn-icon {
    flex: none;
    border-radius: 7px;
    object-fit: contain;
    display: block;
  }
  .cn-icon-fallback {
    display: grid;
    place-items: center;
    background: var(--gx-fill-soft);
    color: var(--gx-muted);
    font-weight: 700;
    font-family: var(--gx-font);
  }
</style>
