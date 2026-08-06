<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ChatMessage } from '../../../types/chat';

  interface Props {
    messages: ChatMessage[];
    scrollContainer: HTMLDivElement | undefined;
  }

  let { messages, scrollContainer }: Props = $props();

  let activeMessageIndex = $state(-1);
  let isVisible = $state(false);
  let isHovered = $state(false);

  let resizeObserver: ResizeObserver | null = null;

  const userMarkers = $derived(
    messages
      .map((msg, i) => ({ id: msg.id, content: msg.content, messageIndex: i }))
      .filter((_, i) => messages[i]?.role === 'user')
  );

  const activeMarkerIndex = $derived(
    userMarkers.findIndex(m => {
      const idx = m.messageIndex;
      const nextUserIdx = userMarkers.find(u => u.messageIndex > idx)?.messageIndex ?? messages.length;
      return activeMessageIndex >= idx && activeMessageIndex < nextUserIdx;
    })
  );

  const shouldShow = $derived(isVisible && userMarkers.length > 1);

  function truncate(text: string, max: number): string {
    const clean = text.replace(/\n/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max).trimEnd() + '…';
  }

  function checkScrollable() {
    if (!scrollContainer) {
      isVisible = false;
      return;
    }
    isVisible = scrollContainer.scrollHeight > scrollContainer.clientHeight + 100;
  }

  function updateActiveFromScroll() {
    if (!scrollContainer) return;

    const messageEls = scrollContainer.querySelectorAll('.message');
    if (!messageEls.length) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const viewportMid = containerRect.top + containerRect.height * 0.35;

    let closestIndex = 0;
    let closestDistance = Infinity;

    messageEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const elMid = rect.top + rect.height / 2;
      const distance = Math.abs(elMid - viewportMid);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    });

    activeMessageIndex = closestIndex;
  }

  function scrollToMessage(messageIndex: number) {
    if (!scrollContainer) return;

    const messageEls = scrollContainer.querySelectorAll('.message');
    const target = messageEls[messageIndex] as HTMLElement | undefined;
    if (!target) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + scrollContainer.scrollTop - 16;

    scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    activeMessageIndex = messageIndex;
  }

  function handleScroll() {
    updateActiveFromScroll();
    checkScrollable();
  }

  onMount(() => {
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    resizeObserver = new ResizeObserver(() => {
      checkScrollable();
    });
    resizeObserver.observe(scrollContainer);

    checkScrollable();
    updateActiveFromScroll();

    return () => {
      scrollContainer?.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
    };
  });

  $effect(() => {
    if (messages.length) {
      tick().then(() => {
        checkScrollable();
        updateActiveFromScroll();
      });
    }
  });
</script>

{#if shouldShow}
  <div
    class="scroll-nav"
    class:expanded={isHovered}
    role="navigation"
    aria-label="Message navigator"
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
  >
    <!-- Slim tick rail (default) -->
    <div class="tick-rail" class:hidden={isHovered}>
      {#each userMarkers as marker, i (marker.id)}
        <button
          class="tick"
          class:active={i === activeMarkerIndex}
          onclick={() => scrollToMessage(marker.messageIndex)}
          title={truncate(marker.content, 60)}
          aria-label={`Jump to: ${truncate(marker.content, 40)}`}
          aria-current={i === activeMarkerIndex ? 'true' : undefined}
        ></button>
      {/each}
    </div>

    <!-- Expanded popover with message previews (on hover) -->
    {#if isHovered}
      <div class="popover">
        {#each userMarkers as marker, i (marker.id)}
          <button
            class="popover-item"
            class:active={i === activeMarkerIndex}
            onclick={() => scrollToMessage(marker.messageIndex)}
            aria-label={`Jump to: ${truncate(marker.content, 40)}`}
            aria-current={i === activeMarkerIndex ? 'true' : undefined}
          >
            <span class="popover-tick"></span>
            <span class="popover-text">{truncate(marker.content, 32)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .scroll-nav {
    position: fixed;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
  }

  /* ── Slim tick rail ── */
  .tick-rail {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    padding: 4px 0;
  }

  .tick-rail.hidden {
    display: none;
  }

  .tick {
    display: block;
    border: none;
    cursor: pointer;
    padding: 0;
    background: rgba(255, 255, 255, 0.2);
    width: 14px;
    height: 2.5px;
    border-radius: 2px;
    transition: all 0.2s ease;
  }

  .tick:hover {
    background: rgba(255, 255, 255, 0.5);
    width: 18px;
  }

  .tick.active {
    background: rgba(255, 255, 255, 0.7);
    width: 20px;
    height: 3px;
  }

  @media (prefers-color-scheme: light) {
    .tick {
      background: rgba(0, 0, 0, 0.15);
    }

    .tick:hover {
      background: rgba(0, 0, 0, 0.35);
    }

    .tick.active {
      background: rgba(0, 0, 0, 0.5);
    }
  }

  /* ── Expanded popover ── */
  .popover {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px;
    background: rgba(32, 33, 36, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04);
    max-height: 60vh;
    overflow-y: auto;
    scrollbar-width: none;
    min-width: 140px;
    max-width: 220px;
    animation: popIn 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .popover::-webkit-scrollbar {
    display: none;
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translateX(4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }

  @media (prefers-color-scheme: light) {
    .popover {
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04);
    }
  }

  .popover-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.12s ease;
    text-align: left;
    width: 100%;
  }

  .popover-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .popover-item.active {
    background: rgba(255, 255, 255, 0.1);
  }

  @media (prefers-color-scheme: light) {
    .popover-item:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .popover-item.active {
      background: rgba(0, 0, 0, 0.06);
    }
  }

  .popover-tick {
    display: block;
    width: 12px;
    height: 2.5px;
    border-radius: 2px;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.25);
    transition: all 0.15s ease;
  }

  .popover-item.active .popover-tick {
    background: rgba(255, 255, 255, 0.7);
    width: 16px;
    height: 3px;
  }

  @media (prefers-color-scheme: light) {
    .popover-tick {
      background: rgba(0, 0, 0, 0.18);
    }

    .popover-item.active .popover-tick {
      background: rgba(0, 0, 0, 0.5);
    }
  }

  .popover-text {
    font-size: 0.72rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .popover-item.active .popover-text {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  .popover-item:hover .popover-text {
    color: rgba(255, 255, 255, 0.8);
  }

  @media (prefers-color-scheme: light) {
    .popover-text {
      color: rgba(0, 0, 0, 0.45);
    }

    .popover-item.active .popover-text {
      color: rgba(0, 0, 0, 0.85);
    }

    .popover-item:hover .popover-text {
      color: rgba(0, 0, 0, 0.7);
    }
  }

  /* When artifact panel is open, shift left */
  :global(.chat-layout--with-artifact) .scroll-nav {
    right: calc(50% + 8px);
  }

  @media (max-width: 768px) {
    .scroll-nav {
      right: 4px;
    }

    .tick {
      width: 10px;
      height: 2px;
    }

    .tick.active {
      width: 14px;
    }

    .tick-rail {
      gap: 5px;
    }

    .popover {
      min-width: 120px;
      max-width: 170px;
      padding: 4px;
    }

    .popover-item {
      padding: 5px 6px;
      gap: 6px;
    }

    .popover-text {
      font-size: 0.65rem;
    }
  }
</style>
