<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { getNotificationsState, type NotificationItem } from './index.js';

  type Align = 'start' | 'center' | 'end';

  interface Props {
    open: boolean;
    anchorEl: HTMLElement | undefined;
    align?: Align;
    maxWidth?: number;
    gap?: number;
    pad?: number;
    onClose: () => void;
    onNavigate: () => void;
  }

  let {
    open,
    anchorEl,
    align = 'start',
    maxWidth = 360,
    gap = 8,
    pad = 8,
    onClose,
    onNavigate,
  }: Props = $props();

  const notifState = getNotificationsState();

  let flyoutStyle = $state('');
  let popoverElement: HTMLDivElement | undefined = $state();

  function isNotificationUnread(n: { read_at: string | null }): boolean {
    return n.read_at == null || n.read_at === '';
  }

  function updateFlyoutPosition(): void {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();

    const w = Math.min(maxWidth, window.innerWidth - 2 * pad);
    let left: number;
    if (align === 'center') {
      left = r.left + r.width / 2 - w / 2;
    } else if (align === 'end') {
      left = r.right - w;
    } else {
      left = 0;
    }

    left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);
    const top = r.bottom + gap;

    flyoutStyle = `top:${top}px;left:${left}px;width:${w}px;`;
  }

  $effect(() => {
    if (!open) {
      flyoutStyle = '';
      return;
    }

    updateFlyoutPosition();
    requestAnimationFrame(updateFlyoutPosition);

    const onReposition = () => {
      void tick().then(updateFlyoutPosition);
    };

    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  });

  // Focus management: focus the dialog when opened
  $effect(() => {
    if (open && popoverElement) {
      tick().then(() => {
        popoverElement?.focus();
      });
    }
  });
</script>

{#if open}
  <div class="alerts-flyout-stack" style={flyoutStyle}>
    <div
      class="alerts-popover"
      bind:this={popoverElement}
      role="dialog"
      aria-modal="true"
      aria-label={$_('app.notifications')}
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div class="alerts-popover-header">
        <span class="alerts-popover-title">{$_('app.notifications')}</span>
        <button
          type="button"
          class="alerts-popover-close"
          onclick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={$_('sidebar.close')}
          title={$_('sidebar.close')}
        >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
        </button>
      </div>

      <div class="alerts-popover-body">
        {#if notifState.previewLoading}
          <div class="alerts-popover-loading" aria-live="polite" aria-label={$_('alerts.loading')}>
            <span class="alerts-popover-spinner" aria-hidden="true"></span>
          </div>
        {:else if notifState.preview.length === 0}
          <p class="alerts-popover-empty">{$_('sidebar.noRecentAlerts')}</p>
        {:else}
          {#each notifState.preview as n (n.id)}
            <button
              type="button"
              class="alerts-popover-item"
              class:alerts-popover-item-unread={isNotificationUnread(n as NotificationItem)}
              aria-label={`${n.title}${n.body ? ': ' + n.body : ''}`}
              onclick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
            >
              <span class="alerts-popover-item-top">
                <span class="alerts-popover-item-title-wrap">
                  {#if isNotificationUnread(n as NotificationItem)}
                    <span class="alerts-popover-item-dot" aria-hidden="true"></span>
                  {/if}
                  <span class="alerts-popover-item-title">{n.title}</span>
                </span>
              </span>
              {#if n.body}
                <span class="alerts-popover-item-body">{n.body}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="alerts-view-all-container">
        <button
          type="button"
          class="alerts-view-all"
          onclick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
        >
          {$_('sidebar.viewAllAlerts')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .alerts-flyout-stack {
    /* fixed + inline top/left/width: escapes sidebar overflow-x clipping */
    position: fixed;
    z-index: 1100;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    min-width: 0;
    box-sizing: border-box;
    pointer-events: auto;
  }

  .alerts-popover {
    background: color-mix(in oklab, var(--bg-primary) 85%, var(--btn-secondary));
    backdrop-filter: blur(calc(var(--glass-blur) * 1.25)) saturate(1.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.25)) saturate(1.5);
    /* Subtle lensing boundary (avoid double-stroking with box-shadow) */
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-lg);
    box-shadow:
      var(--glass-highlight),
      var(--glass-edge-glow),
      /* Top: subtle */
      0 1px 8px rgba(0, 0, 0, 0.08),
      /* Bottom: progressively deeper */
      0 10px 24px rgba(0, 0, 0, 0.16),
      0 22px 50px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    animation: slideUpFade 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideUpFade {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .alerts-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-md) var(--space-sm);
    border-bottom: 1px solid var(--glass-stroke-dark);
  }

  .alerts-popover-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .alerts-popover-close {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .alerts-popover-close:hover {
    color: var(--text-primary);
    background: var(--btn-tertiary);
  }

  .alerts-popover-body {
    max-height: 280px;
    overflow-y: auto;
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .alerts-popover-empty {
    margin: 0;
    padding: var(--space-lg) var(--space-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .alerts-popover-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
    width: 100%;
    flex-shrink: 0;
    padding: var(--space-md) var(--space-lg);
    border: 1px solid color-mix(in oklab, var(--glass-stroke-dark) 85%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--btn-secondary) 96%, transparent);
    cursor: pointer;
    text-align: left;
    transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    overflow-x: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 2px 8px rgba(0, 0, 0, 0.04);
    position: relative;
  }

  .alerts-popover-item:last-child {
    border-bottom: none;
  }

  .alerts-popover-item:hover {
    background: color-mix(in oklab, var(--btn-tertiary) 90%, transparent);
    border-color: color-mix(in oklab, var(--brand) 20%, var(--glass-stroke-dark));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 22px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .alerts-popover-item-top {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .alerts-popover-item-title-wrap {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-sm);
    min-width: 0;
  }

  .alerts-popover-item-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    background: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    margin-top: 0.2rem;
    flex: 0 0 auto;
  }

  .alerts-popover-item-unread .alerts-popover-item-title {
    color: var(--text-primary);
  }

  .alerts-popover-item-unread {
    border-color: color-mix(in oklab, var(--brand) 26%, var(--glass-stroke-dark));
    background: linear-gradient(
      135deg,
      color-mix(in oklab, var(--btn-secondary) 88%, rgba(var(--brand-rgb), 0.16)) 0%,
      color-mix(in oklab, var(--btn-secondary) 94%, transparent) 100%
    );
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 20px rgba(var(--brand-rgb), 0.1);
  }

  .alerts-popover-item-unread::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--brand) 0%, color-mix(in oklab, var(--brand) 78%, white) 100%);
    pointer-events: none;
  }

  .alerts-popover-item-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: color-mix(in oklab, var(--text-primary) 82%, var(--text-secondary));
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .alerts-popover-item-body {
    width: 100%;
    font-size: 0.75rem;
    color: color-mix(in oklab, var(--text-secondary) 90%, var(--text-primary));
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
  }

  .alerts-view-all-container {
    padding: var(--space-md);
    padding-right: var(--space-xl);
    display: flex;
    justify-content: flex-end;
  }

  .alerts-view-all {
    align-self: center;
    margin: 0;
    padding: 0.2rem 0.35rem;
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--brand);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0.01em;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease, text-decoration-color 0.15s ease;
  }

  .alerts-view-all:hover {
    color: var(--link-color);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .alerts-view-all:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .alerts-popover-loading {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .alerts-popover-spinner {
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--glass-stroke-dark);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: alertsSpin 0.8s linear infinite;
  }

  @keyframes alertsSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .alerts-popover {
      animation: none;
    }
  }

  @media (max-width: 768px) {
    .alerts-popover-item {
      padding: var(--space-md);
    }

    .alerts-popover-item-top {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-xs);
    }
  }
</style>

