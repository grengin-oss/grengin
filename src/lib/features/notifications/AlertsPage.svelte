<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { navigate } from 'svelte-routing';
  import {
    listNotifications,
    markNotificationRead,
    type NotificationItem,
  } from '../../api/notificationsApi.js';
  import { ApiError } from '../../api/client.js';
  import { toast } from '../../components/Toaster.svelte';
  import LoadingSpinner from '../../admin/components/LoadingSpinner.svelte';
  import AlertIcon from './AlertIcon.svelte';
  import { isBudgetAlert, isUnread, needsAttention, severityOf } from './alertPresentation.js';
  import { getNotificationsState, markNotificationReadLocal, fetchNotificationFeed } from './index.js';
  import { permissionsStore } from '../auth/index.js';
  import { PERMISSIONS } from '../auth/permissions.js';
  import { setPageTitle } from '../../utils/pageTitle';

  $effect(() => {
    setPageTitle($_('alerts.title'));
  });

  const PAGE_SIZE = 20;
  const AUTO_READ_VISIBLE_MS = 3000;
  const AUTO_READ_VISIBLE_RATIO = 0.75;
  /** Mark-all walks the unread list in pages this size and reads them in batches. */
  const MARK_ALL_PAGE_SIZE = 100;
  const MARK_ALL_BATCH = 8;

  /** IDs we already POSTed read for (UI may still show unread until refetch). */
  const readApiCompletedIds = new Set<string>();

  type Filter = 'all' | 'unread';
  type FilterDataset = {
    items: NotificationItem[];
    total: number;
    offset: number;
    loadingMore: boolean;
    hasMore: boolean;
  };

  let filter = $state<Filter>('all');
  let initialLoading = $state(true);
  let markingAll = $state(false);
  let scrollEl = $state<HTMLElement | undefined>();
  let datasets = $state<Record<Filter, FilterDataset>>({
    all: {
      items: [],
      total: 0,
      offset: 0,
      loadingMore: false,
      hasMore: true,
    },
    unread: {
      items: [],
      total: 0,
      offset: 0,
      loadingMore: false,
      hasMore: true,
    },
  });

  const activeItems = $derived(datasets[filter].items);
  const activeLoadingMore = $derived(datasets[filter].loadingMore);
  const activeHasMore = $derived(datasets[filter].hasMore);
  const showLoadMoreSentinel = $derived(!initialLoading && activeHasMore);
  const allTotal = $derived(datasets.all.total);
  const unreadTotal = $derived(datasets.unread.total);

  /* ".alert-group" — unread alerts and alerts still live for their budget
     period sit up top; everything seen and out of period is history. */
  const attentionItems = $derived(activeItems.filter((n) => needsAttention(n)));
  const earlierItems = $derived(activeItems.filter((n) => !needsAttention(n)));

  /** The "Review Budget" action only makes sense for someone who can open it. */
  const canReviewBudget = $derived(permissionsStore.hasPermission(PERMISSIONS.departments.view));

  /** ".alert-date" — the design shows a bare day, the full stamp is the tooltip. */
  function shortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  }

  function fullDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  }

  async function loadInitial(): Promise<void> {
    initialLoading = true;
    try {
      const [allRes, unreadRes] = await Promise.all([
        listNotifications({ limit: PAGE_SIZE, offset: 0 }),
        listNotifications({ limit: PAGE_SIZE, offset: 0, unread_only: true }),
      ]);

      datasets.all.items = allRes.notifications;
      datasets.all.total = allRes.total;
      datasets.all.offset = allRes.notifications.length;
      datasets.all.loadingMore = false;
      datasets.all.hasMore = allRes.notifications.length < allRes.total;

      datasets.unread.items = unreadRes.notifications;
      datasets.unread.total = unreadRes.total;
      datasets.unread.offset = unreadRes.notifications.length;
      datasets.unread.loadingMore = false;
      datasets.unread.hasMore = unreadRes.notifications.length < unreadRes.total;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : $_('alerts.loadError');
      toast.error(msg);
    } finally {
      initialLoading = false;
      await tick();
    }
  }

  function handleAlertListScroll(event: Event) {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight <= 300;
    if (nearBottom && !initialLoading && !activeLoadingMore && activeHasMore) {
      loadMore();
    }
  }

  function setFilter(next: Filter) {
    if (filter === next) return;
    filter = next;
  }

  async function loadMore() {
    const target = datasets[filter];
    if (target.loadingMore || !target.hasMore) return;
    target.loadingMore = true;

    try {
      const { notifications } = await listNotifications({
        limit: PAGE_SIZE,
        offset: target.offset,
        ...(filter === 'unread' ? { unread_only: true } : {}),
      });
      target.items = [...target.items, ...notifications];
      target.offset += notifications.length;
      target.hasMore = target.items.length < target.total;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : $_('alerts.loadError');
      toast.error(msg);
    } finally {
      target.loadingMore = false;
      await tick();
    }
  }

  /** No bulk endpoint exists, so walk the unread list and read each one. */
  async function markAllAsRead(): Promise<void> {
    if (markingAll || unreadTotal === 0) return;
    markingAll = true;

    try {
      const ids: string[] = [];
      let offset = 0;
      for (;;) {
        const { notifications, total } = await listNotifications({
          limit: MARK_ALL_PAGE_SIZE,
          offset,
          unread_only: true,
        });
        ids.push(...notifications.map((n) => n.id));
        offset += notifications.length;
        if (notifications.length === 0 || ids.length >= total) break;
      }

      for (let i = 0; i < ids.length; i += MARK_ALL_BATCH) {
        const batch = ids.slice(i, i + MARK_ALL_BATCH);
        const results = await Promise.allSettled(batch.map((id) => markNotificationRead(id)));
        const rejected = results.find((r) => r.status === 'rejected');
        if (rejected) throw (rejected as PromiseRejectedResult).reason;
        batch.forEach((id) => readApiCompletedIds.add(id));
      }

      await Promise.all([loadInitial(), fetchNotificationFeed()]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : $_('alerts.markAllReadError');
      toast.error(msg);
      void loadInitial();
    } finally {
      markingAll = false;
    }
  }

  function openBudget(): void {
    navigate('/admin/departments');
  }

  /** When unread row is ≥75% visible for 3s, POST read then disconnect (no local UI updates). */
  function autoReadOnVisible(node: HTMLElement, notificationId: string | null) {
    let id = notificationId;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let observer: IntersectionObserver | null = null;
    let finished = false;

    const clearTimer = () => {
      if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const teardownObserver = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };

    const arm = () => {
      if (finished || id == null || readApiCompletedIds.has(id)) return;

      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry || finished || id == null || readApiCompletedIds.has(id)) return;

          const visibleEnough = entry.isIntersecting && entry.intersectionRatio >= AUTO_READ_VISIBLE_RATIO;

          if (visibleEnough) {
            if (timeout != null) return;
            timeout = setTimeout(() => {
              timeout = null;
              if (finished || id == null) return;
              finished = true;
              clearTimer();
              teardownObserver();
              const targetId = id;
              void markNotificationRead(targetId)
                .then(() => {
                  readApiCompletedIds.add(targetId);
                  markNotificationReadLocal(targetId);
                })
                .catch((e) => {
                  finished = false;
                  const msg = e instanceof ApiError ? e.message : $_('alerts.markReadError');
                  toast.error(msg);
                  arm();
                });
            }, AUTO_READ_VISIBLE_MS);
          } else {
            clearTimer();
          }
        },
        { threshold: [0, AUTO_READ_VISIBLE_RATIO, 1] }
      );

      observer.observe(node);
    };

    if (notificationId != null && !readApiCompletedIds.has(notificationId)) {
      arm();
    }

    return {
      update(next: string | null) {
        clearTimer();
        teardownObserver();
        finished = false;
        id = next;
        if (next != null && !readApiCompletedIds.has(next)) {
          arm();
        }
      },
      destroy() {
        clearTimer();
        teardownObserver();
      },
    };
  }

  /** Load initial notifications list. */
  $effect(() => {
    void loadInitial();
  });

  /* The feed scrolls inside this page, so a first page that does not fill the
     viewport would leave the reader with nothing to scroll and the rest of the
     list unreachable — keep pulling until it overflows or the list runs out. */
  $effect(() => {
    void activeItems.length;
    void activeLoadingMore;
    void initialLoading;
    if (!scrollEl || initialLoading || activeLoadingMore || !activeHasMore) return;
    if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
      void loadMore();
    }
  });

  /** Update list when stream toast is received. */
  $effect(() => {
    const fromStream = getNotificationsState().streamToast;
    if (fromStream == null) return;
    void loadInitial();
  });
</script>

{#snippet alertCard(n: NotificationItem, group: 'attention' | 'earlier')}
  {@const unread = isUnread(n)}
  {@const severity = severityOf(n)}
  <li>
    <div
      class="alert-card"
      class:alert-card--tinted={group === 'attention'}
      class:alert-card--warning={group === 'attention' && severity === 'warning'}
      class:alert-card--unread={unread}
      use:autoReadOnVisible={unread ? n.id : null}
      aria-label={`${n.title}${n.body ? ': ' + n.body : ''}`}
    >
      <AlertIcon item={n} size={40} muted={group === 'earlier'} />
      <div class="alert-content">
        <div class="alert-title-row">
          {#if unread}
            <span class="new-dot" aria-hidden="true"></span>
          {/if}
          <span class="alert-title">{n.title}</span>
        </div>
        {#if n.body}
          <p class="alert-desc">{n.body}</p>
        {/if}
        {#if isBudgetAlert(n) && canReviewBudget}
          <button type="button" class="action-link" onclick={openBudget}>
            {$_('alerts.reviewBudget')}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5 3.5 9 7l-4 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        {/if}
      </div>
      <time class="alert-date" datetime={n.created_at} title={fullDate(n.created_at)}>
        {shortDate(n.created_at)}
      </time>
    </div>
  </li>
{/snippet}

<div
  class="alerts-page"
  role="main"
  aria-label={$_('alerts.title') || 'Alerts'}
  bind:this={scrollEl}
  onscroll={handleAlertListScroll}
>
  <div class="alerts-main">
    <header class="header-row">
      <div class="title-col">
        <h1 class="page-title">{$_('alerts.title')}</h1>
        <p class="page-sub">{$_('alerts.subtitle')}</p>
      </div>
    </header>

    <div class="tabs-row">
      <div class="alert-tabs" role="group" aria-label={$_('alerts.filterLabel') || 'Filter alerts'}>
        <button
          type="button"
          class="alert-tab"
          class:alert-tab--selected={filter === 'all'}
          aria-pressed={filter === 'all'}
          onclick={() => setFilter('all')}
        >
          {$_('alerts.filterAll')}
          {#if allTotal > 0}<span class="tab-count">{allTotal}</span>{/if}
        </button>
        <button
          type="button"
          class="alert-tab"
          class:alert-tab--selected={filter === 'unread'}
          aria-pressed={filter === 'unread'}
          onclick={() => setFilter('unread')}
        >
          {$_('alerts.filterUnread')}
        </button>
      </div>

      {#if unreadTotal > 0}
        <button
          type="button"
          class="mark-read-btn"
          onclick={markAllAsRead}
          disabled={markingAll}
        >
          {#if markingAll}<span class="btn-spinner" aria-hidden="true"></span>{/if}
          {$_('alerts.markAllRead')}
        </button>
      {/if}
    </div>

    {#if initialLoading}
      <div class="loading-wrap" role="status" aria-live="polite" aria-label={$_('alerts.loading') || 'Loading alerts'}>
        <LoadingSpinner size="md" />
      </div>
    {:else if activeItems.length === 0}
      <div class="empty-card" role="status" aria-label={$_('alerts.empty') || 'No alerts found'}>
        <p class="empty-text">{$_('alerts.empty')}</p>
      </div>
    {:else}
      <div class="alerts-groups">
        {#if attentionItems.length > 0}
          <section class="alert-group">
            <div class="group-heading">
              <h2 class="group-heading-label">{$_('alerts.needsAttention')}</h2>
              <span class="badge-count">{attentionItems.length}</span>
            </div>
            <ul class="group-items" aria-label={$_('alerts.notificationsList') || 'Notifications list'}>
              {#each attentionItems as n (n.id)}
                {@render alertCard(n, 'attention')}
              {/each}
            </ul>
          </section>
        {/if}

        {#if earlierItems.length > 0}
          <section class="alert-group">
            <div class="group-heading">
              <h2 class="group-heading-label">{$_('alerts.earlier')}</h2>
              <span class="badge-count">{earlierItems.length}</span>
            </div>
            <ul class="group-items" aria-label={$_('alerts.notificationsList') || 'Notifications list'}>
              {#each earlierItems as n (n.id)}
                {@render alertCard(n, 'earlier')}
              {/each}
            </ul>
          </section>
        {/if}

        {#if showLoadMoreSentinel}
          <div class="loading-item" aria-live="polite" aria-busy={activeLoadingMore}>
            {#if activeLoadingMore}
              <span class="load-more-spinner" aria-hidden="true"></span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ===== alerts.html, transcribed. Design values that no --gx-* token already
     carried live in app.css as --gx-alr-*. ===== */

  /* app.css paints every bare <button> as a glass pill — padding, a fill, a
     radius, an inset shadow, a lift on hover. Every control below is flat, so
     strip that once here and let each rule paint its own skin. */
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

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ".right-col" */
  .alerts-page {
    height: 100%;
    width: 100%;
    overflow-y: auto;
    background: var(--gx-page);
    font-family: var(--gx-font);
    box-sizing: border-box;
  }

  /* ".main-area" */
  .alerts-main {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding: 40px 48px;
    box-sizing: border-box;
  }

  /* ".header-row" */
  .header-row {
    display: flex;
    gap: 6px;
    align-items: center;
    align-self: stretch;
  }

  .title-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-grow: 1;
    min-width: 0;
  }

  .page-title {
    margin: 0;
    font-weight: 800;
    font-size: 28px;
    line-height: 1.2;
    letter-spacing: -0.5px;
    color: var(--gx-an-strong);
  }

  .page-sub {
    margin: 0;
    font-weight: 500;
    font-size: 14px;
    line-height: 1.4;
    color: var(--gx-slate-500);
  }

  /* ".tabs-row" */
  .tabs-row {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .alert-tabs {
    height: 41px;
    border-radius: 10px;
    background: var(--gx-rule);
    display: flex;
    gap: 4px;
    padding: 4px;
    flex-shrink: 0;
  }

  .alert-tab {
    border-radius: 8px;
    padding: 8px 16px;
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-chip-fg);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
  }

  .alert-tab:hover {
    color: var(--gx-org-slate-800);
  }

  .alert-tab--selected {
    background: var(--gx-card);
    box-shadow: var(--gx-alr-tab-shadow);
    color: var(--gx-org-primary-500);
    font-weight: 600;
  }

  .tab-count {
    font-variant-numeric: tabular-nums;
  }

  .mark-read-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--gx-org-primary-500);
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    white-space: nowrap;
    color: #fff;
    transition: background-color 120ms ease;
  }

  .mark-read-btn:hover:not(:disabled) {
    background: var(--gx-ac-cta-hover);
  }

  .alert-tab:focus-visible,
  .mark-read-btn:focus-visible,
  .action-link:focus-visible {
    outline: 2px solid var(--gx-an-dot);
    outline-offset: 2px;
  }

  /* ".alerts-groups" */
  .alerts-groups {
    display: flex;
    flex-direction: column;
    gap: 40px;
    align-self: stretch;
  }

  .alert-group {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
  }

  .group-heading {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .group-heading-label {
    margin: 0;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.3;
    color: var(--gx-org-slate-800);
  }

  .badge-count {
    border-radius: 12px;
    background: var(--gx-hair);
    padding: 2px 6px;
    font-weight: 600;
    font-size: 11px;
    line-height: 1.3;
    color: var(--gx-ac-slate-600);
    font-variant-numeric: tabular-nums;
  }

  .group-items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  /* ".alert-card" — the tint belongs to the top group: amber for a low budget,
     blue for everything else. The "Earlier" group is plain white with a hairline
     ring, and its icon tiles go neutral (see AlertIcon's `muted`). */
  .alert-card {
    border-radius: 12px;
    display: flex;
    gap: 16px;
    padding: 16px;
    align-items: flex-start;
    align-self: stretch;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    transition: background-color 120ms ease, box-shadow 120ms ease;
  }

  /* #EFF6FF / #D0E1FD */
  .alert-card--tinted {
    background: var(--gx-blue-soft);
    box-shadow: inset 0 0 0 1px var(--gx-alr-tint-ring);
  }

  /* #FFFBEB / #FDE68A */
  .alert-card--warning {
    background: var(--gx-alr-warn-bg);
    box-shadow: inset 0 0 0 1px var(--gx-alr-warn-ring);
  }

  .alert-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-grow: 1;
    min-width: 0;
  }

  .alert-title-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .new-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gx-an-dot);
    flex-shrink: 0;
  }

  .alert-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 1.35;
    color: var(--gx-org-slate-800);
    overflow-wrap: anywhere;
  }

  .alert-desc {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 18px;
    color: var(--gx-ac-slate-600);
    overflow-wrap: anywhere;
  }

  .action-link {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    align-self: flex-start;
    padding: 4px 0;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-dot);
    border-radius: 4px;
    transition: color 120ms ease;
  }

  .action-link:hover {
    color: var(--gx-ac-link);
  }

  .alert-date {
    font-weight: 500;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-slate-400);
    flex-shrink: 0;
    padding-inline-start: 16px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* ---- states ---- */
  .loading-wrap {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 40px 16px;
    text-align: center;
  }

  .empty-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--gx-slate-500);
  }

  .loading-item {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 48px;
  }

  .load-more-spinner,
  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--gx-hair);
    border-top-color: var(--gx-org-primary-500);
    border-radius: 50%;
    animation: alertsSpin 0.8s linear infinite;
  }

  .btn-spinner {
    border-color: rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    width: 14px;
    height: 14px;
  }

  @keyframes alertsSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .load-more-spinner,
    .btn-spinner {
      animation-duration: 2s;
    }
  }

  @media (max-width: 900px) {
    .alerts-main {
      padding: 24px;
      gap: 24px;
    }

    .alerts-groups {
      gap: 28px;
    }
  }

  @media (max-width: 600px) {
    .alerts-main {
      padding: 20px 16px;
    }

    .page-title {
      font-size: 22px;
    }

    .tabs-row {
      align-items: stretch;
    }

    .alert-tabs,
    .mark-read-btn {
      flex-grow: 1;
      justify-content: center;
    }

    .alert-card {
      padding: 12px;
      gap: 12px;
    }

    .alert-date {
      padding-inline-start: 8px;
    }
  }
</style>
