<!--
  SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
  SPDX-License-Identifier: Apache-2.0

  Viewport-gated rendering, the same technique the chat transcript uses
  (ChatMessage.svelte): each item observes itself against its scroll container
  with a large rootMargin buffer. When it is far off-screen its content is not
  rendered and a placeholder reserves its last measured height; the content
  mounts only when the item is near the viewport. This windows long lists
  (only on-screen items + a buffer pay render cost) while keeping whole-page
  scrolling and the keyed {#each} intact.
-->
<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  let {
    children,
    rootMargin = "1200px 0px 1200px 0px",
    minHeight = 0,
    stretch = false,
  }: {
    /** The item content; mounted only while near the viewport. */
    children: Snippet;
    /** Pre-render buffer above/below the scroll viewport. */
    rootMargin?: string;
    /** Estimated height before the item has been measured once. */
    minHeight?: number;
    /** Stretch the child to full width (for grid cells). */
    stretch?: boolean;
  } = $props();

  let el = $state<HTMLElement>();
  let near = $state(false);
  let measuredH = $state(0);
  // Last measured height; falls back to the minHeight estimate until measured.
  let cachedH = $state(0);

  // Keep the reserved placeholder height in step with the live content height.
  $effect(() => {
    if (near && measuredH > 0) cachedH = measuredH;
  });

  /** Nearest scrollable ancestor, or null (viewport) when the page itself scrolls. */
  function scrollParent(node: HTMLElement): Element | null {
    let cur: HTMLElement | null = node.parentElement;
    while (cur) {
      const oy = getComputedStyle(cur).overflowY;
      if (oy === "auto" || oy === "scroll") return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  onMount(() => {
    if (!el) return;
    const root = scrollParent(el);
    const io = new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting);
      },
      { root, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  });

  const baseStyle = $derived(
    stretch ? "display:flex;flex-direction:column;min-width:0;" : "",
  );
  const style = $derived(
    near ? baseStyle : `${baseStyle}min-height:${cachedH || minHeight}px;`,
  );
</script>

<div bind:this={el} bind:clientHeight={measuredH} {style}>
  {#if near}
    {@render children()}
  {/if}
</div>
