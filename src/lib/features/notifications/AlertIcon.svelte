<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!-- ".alert-icon" / ".mini-icon" — the tinted tile in front of an alert. -->
<script lang="ts">
  import type { NotificationItem } from '../../api/notificationsApi.js';
  import { categorize } from './alertPresentation.js';

  interface Props {
    item: NotificationItem;
    /** 40 on the Alerts page, 36 in the bell popover. */
    size?: number;
    /**
     * Drop the tile to neutral (#F3F4F6 / #6B7280). The Alerts page does this
     * for every row in its "Earlier" group, whatever the alert's category; the
     * bell popover keeps every tile in colour.
     */
    muted?: boolean;
  }

  let { item, size = 40, muted = false }: Props = $props();

  const category = $derived(categorize(item));
  const glyph = $derived(Math.round(size / 2));
</script>

<span
  class="alert-icon"
  class:alert-icon--critical={category.severity === 'critical'}
  class:alert-icon--warning={category.severity === 'warning'}
  class:alert-icon--info={category.severity === 'info'}
  class:alert-icon--muted={muted}
  style="--alert-icon-size: {size}px"
  aria-hidden="true"
>
  {#if category.glyph === 'budget'}
    <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <path d="M12 4.5v15" />
      <path d="M15.6 8.3c-.5-1.1-1.8-1.8-3.6-1.8-2 0-3.5 1-3.5 2.6 0 1.7 1.5 2.3 3.6 2.7 2.2.4 3.8 1.1 3.8 2.9 0 1.8-1.7 2.8-3.9 2.8-1.9 0-3.4-.7-3.9-2" fill="none" />
    </svg>
  {:else if category.glyph === 'warning'}
    <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 4.2 2.8 19.2h18.4z" />
      <path d="M12 10v4M12 16.8h.01" />
    </svg>
  {:else if category.glyph === 'critical'}
    <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6v5M12 16.2h.01" />
    </svg>
  {:else}
    <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3.2l1.9 5.2 5.2 1.9-5.2 1.9-1.9 5.2-1.9-5.2L4.9 10.3l5.2-1.9z" />
    </svg>
  {/if}
</span>

<style>
  .alert-icon {
    width: var(--alert-icon-size);
    height: var(--alert-icon-size);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .alert-icon--critical {
    background: var(--gx-org-danger-line);
    color: var(--gx-danger);
  }

  .alert-icon--warning {
    background: var(--gx-alr-warn-tile);
    color: var(--gx-org-warn);
  }

  .alert-icon--info {
    background: var(--gx-blue-soft);
    color: var(--gx-an-dot);
  }

  .alert-icon--muted {
    background: var(--gx-an-insight-bg);
    color: var(--gx-an-axis);
  }
</style>
