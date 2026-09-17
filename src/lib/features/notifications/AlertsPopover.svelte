<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import AlertIcon from './AlertIcon.svelte';
  import { isUnread, needsAttention, severityOf } from './alertPresentation.js';
  import { fetchNotificationFeed, getNotificationsState, type NotificationItem } from './index.js';

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

  /* The feed is seeded at sign-in and kept warm by the SSE stream; re-read it on
     open so rows read elsewhere (another tab, the Alerts page) are current. */
  $effect(() => {
    if (!open) return;
    void fetchNotificationFeed({ silent: notifState.preview.length > 0 });
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
    <!-- ".popover" from alerts.html -->
    <div
      class="popover"
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
      <div class="popover-header">
        <span class="popover-title">{$_('app.notifications')}</span>
        <button
          type="button"
          class="popover-close"
          onclick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={$_('sidebar.close')}
          title={$_('sidebar.close')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2 2 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="popover-body">
        {#if notifState.previewLoading}
          <div class="popover-loading" aria-live="polite" aria-label={$_('alerts.loading')}>
            <span class="popover-spinner" aria-hidden="true"></span>
          </div>
        {:else if notifState.preview.length === 0}
          <p class="popover-empty">{$_('sidebar.noRecentAlerts')}</p>
        {:else}
          {#each notifState.preview as n (n.id)}
            {@const unread = isUnread(n as NotificationItem)}
            {@const attention = needsAttention(n as NotificationItem)}
            {@const severity = severityOf(n as NotificationItem)}
            <button
              type="button"
              class="mini-card"
              class:mini-card--tinted={attention}
              class:mini-card--warning={attention && severity === 'warning'}
              aria-label={`${n.title}${n.body ? ': ' + n.body : ''}`}
              onclick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
            >
              <AlertIcon item={n as NotificationItem} size={36} />
              <span class="mini-text">
                <span class="mini-title-row">
                  {#if unread}
                    <span class="new-dot" aria-hidden="true"></span>
                  {/if}
                  <span class="mini-title">{n.title}</span>
                </span>
                {#if n.body}
                  <span class="mini-desc">{n.body}</span>
                {/if}
              </span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="popover-footer">
        <button
          type="button"
          class="view-all-link"
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
  /* ===== alerts.html ".popover", transcribed. ===== */

  /* app.css paints every bare <button> as a glass pill — strip that once here
     and let each rule below paint its own skin. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    text-align: start;
    cursor: pointer;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .alerts-flyout-stack {
    /* fixed + inline top/left/width: escapes sidebar overflow-x clipping */
    position: fixed;
    z-index: 1100;
    display: flex;
    flex-direction: column;
    min-width: 0;
    box-sizing: border-box;
    pointer-events: auto;
    font-family: var(--gx-font);
  }

  .popover {
    overflow: hidden;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair), var(--gx-cx-panel-shadow);
    display: flex;
    flex-direction: column;
    animation: slideUpFade 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .popover:focus-visible {
    outline: 2px solid var(--gx-an-dot);
    outline-offset: 2px;
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

  .popover-header {
    height: 66px;
    border-bottom: 1px solid var(--gx-hair);
    display: flex;
    padding: 16px;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .popover-title {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 14px;
    line-height: 1.3;
    color: var(--gx-org-slate-800);
  }

  .popover-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-an-axis);
    transition: background-color 120ms ease, color 120ms ease;
  }

  .popover-close:hover {
    background: var(--gx-an-insight-bg);
    color: var(--gx-org-slate-800);
  }

  .popover-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    align-self: stretch;
    max-height: min(380px, 60vh);
    overflow-y: auto;
  }

  /* The popover has no headings, but it follows the page's rule for which rows
     are tinted: unread, or still live for their budget period. Amber for a low
     budget, blue otherwise, plain white for the rest. Tiles keep their colour
     here — there is no muted "Earlier" pile for them to fall into. */
  .mini-card {
    border-radius: 12px;
    background: var(--mini-card-fill, var(--gx-card));
    box-shadow: inset 0 0 0 1px var(--mini-card-ring, var(--gx-hair));
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    align-items: center;
    align-self: stretch;
    width: 100%;
    box-sizing: border-box;
    transition: background-color 120ms ease, box-shadow 120ms ease;
  }

  /* #EFF6FF / #D0E1FD */
  .mini-card--tinted {
    --mini-card-fill: var(--gx-blue-soft);
    --mini-card-ring: var(--gx-alr-tint-ring);
  }

  /* #FFFBEB / #FDE68A */
  .mini-card--warning {
    --mini-card-fill: var(--gx-alr-warn-bg);
    --mini-card-ring: var(--gx-alr-warn-ring);
  }

  /* Hover deepens a row toward its own ring colour, so each row keeps its hue. */
  .mini-card:hover {
    background: color-mix(in oklab, var(--mini-card-fill, var(--gx-card)) 65%, var(--mini-card-ring, var(--gx-hair)));
  }

  .mini-card:focus-visible,
  .popover-close:focus-visible,
  .view-all-link:focus-visible {
    outline: 2px solid var(--gx-an-dot);
    outline-offset: 2px;
  }

  .mini-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-grow: 1;
    min-width: 0;
  }

  .mini-title-row {
    display: flex;
    gap: 6px;
    align-items: center;
    align-self: stretch;
    min-width: 0;
  }

  .new-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gx-an-dot);
    flex-shrink: 0;
  }

  .mini-title {
    flex-grow: 1;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.3;
    color: var(--gx-org-slate-800);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mini-desc {
    align-self: stretch;
    font-weight: 500;
    font-size: 11px;
    line-height: 1.4;
    color: var(--gx-slate-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .popover-footer {
    min-height: 39px;
    background: var(--gx-surface-rail);
    border-top: 1px solid var(--gx-hair);
    display: flex;
    padding: 12px 16px;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .view-all-link {
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 12px;
    line-height: 1.2;
    color: var(--gx-blue);
    border-radius: 4px;
    transition: color 120ms ease;
  }

  .view-all-link:hover {
    color: var(--gx-ac-link);
  }

  .popover-empty {
    margin: 0;
    padding: 24px 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--gx-slate-500);
    text-align: center;
  }

  .popover-loading {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .popover-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--gx-hair);
    border-top-color: var(--gx-org-primary-500);
    border-radius: 50%;
    animation: alertsSpin 0.8s linear infinite;
  }

  @keyframes alertsSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: none;
    }

    .popover-spinner {
      animation-duration: 2s;
    }
  }
</style>
