<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    listNotifications,
    markNotificationRead,
    type NotificationItem,
  } from '../../api/notificationsApi.js';
  import { ApiError } from '../../api/client.js';
  import { toast } from '../../components/Toaster.svelte';
  import LoadingSpinner from '../../admin/components/LoadingSpinner.svelte';
  import { getNotificationsState, markNotificationReadLocal } from './index.js';

  const PAGE_SIZE = 20;
  const AUTO_READ_VISIBLE_MS = 3000;
  const AUTO_READ_VISIBLE_RATIO = 0.75;

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

  function isUnread(n: NotificationItem): boolean {
    return n.read_at == null || n.read_at === '';
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
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;
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

  /** Update list when stream toast is received. */
  $effect(() => {
    const fromStream = getNotificationsState().streamToast;
    if (fromStream == null) return;
    void loadInitial();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });

</script>

<svelte:window on:scroll={handleAlertListScroll} />
<div class="alerts-page surface-elevated" role="main" aria-label={$_('alerts.title') || 'Alerts'}>
  <header class="alerts-header">
    <h1 class="alerts-title">{$_('alerts.title')}</h1>
    <p class="alerts-subtitle">{$_('alerts.subtitle')}</p>
  </header>

  <div class="filter-row" role="group" aria-label={$_('alerts.filterLabel') || 'Filter alerts'}>
    <button
      type="button"
      class="filter-btn"
      class:active={filter === 'all'}
      onclick={() => setFilter('all')}
      aria-label={$_('alerts.filterAll')}
      aria-pressed={filter === 'all'}
    >
      {$_('alerts.filterAll')}
    </button>
    <button
      type="button"
      class="filter-btn"
      class:active={filter === 'unread'}
      onclick={() => setFilter('unread')}
      aria-label={$_('alerts.filterUnread')}
      aria-pressed={filter === 'unread'}
    >
      {$_('alerts.filterUnread')}
    </button>
  </div>

  {#if initialLoading}
    <div class="loading-wrap" role="status" aria-live="polite" aria-label={$_('alerts.loading') || 'Loading alerts'}>
      <LoadingSpinner size="md" />
    </div>
  {:else if activeItems.length === 0}
    <div class="surface-card empty-card" role="status" aria-label={$_('alerts.empty') || 'No alerts found'}>
      <p class="muted">{$_('alerts.empty')}</p>
    </div>
  {:else}
    <ul
      class="alert-list"
      role="list"
      aria-label={$_('alerts.notificationsList') || 'Notifications list'}
    >
      {#each activeItems as n (n.id)}
        <li>
          <div
            class="surface-card-interactive alert-row"
            class:unread={isUnread(n)}
            use:autoReadOnVisible={isUnread(n) ? n.id : null}
            aria-label={`${n.title}${n.body ? ': ' + n.body : ''}`}
          >
            <div class="alert-row-inner">
              <div class="alert-row-main">
                <div class="alert-row-top">
                  <span class="alert-title-wrap">
                    {#if isUnread(n)}
                      <span class="alert-unread-dot" aria-hidden="true"></span>
                    {/if}
                    <span class="alert-title">{n.title}</span>
                  </span>
                  <time class="alert-time" datetime={n.created_at}>
                    {new Date(n.created_at).toLocaleString()}
                  </time>
                </div>
                {#if n.body}
                  <p class="alert-body">{n.body}</p>
                {/if}
              </div>
            </div>
          </div>
        </li>
      {/each}
      {#if showLoadMoreSentinel}
        <li class="loading-item" aria-live="polite" aria-busy={activeLoadingMore}>
          <div class="loading-indicator">
            {#if activeLoadingMore}
              <span class="load-more-spinner" aria-hidden="true"></span>
            {/if}
          </div>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .alerts-page {
    margin: 0;
    max-width: none;
    width: 100%;
    height: 100%;
    padding: var(--space-3xl);
    border-radius: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .alerts-header {
    margin-bottom: var(--space-lg);
  }

  .alerts-title {
    margin: 0 0 var(--space-xs);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .alerts-subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .filter-row {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .filter-btn {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-stroke-dark);
    background: var(--btn-secondary);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .filter-btn:hover {
    background: var(--btn-tertiary);
    color: var(--text-primary);
  }

  .filter-btn.active {
    border-color: var(--color-accent-500, var(--brand));
    color: var(--brand);
    background: var(--btn-tertiary);
  }

  .muted {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-wrap {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-card {
    padding: var(--space-xl);
    text-align: center;
  }

  .alert-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .alert-row {
    position: relative;
    width: 100%;
    text-align: left;
    padding: 0;
    display: block;
    box-sizing: border-box;
    border: 1px solid color-mix(in oklab, var(--glass-stroke-dark) 85%, transparent);
    border-radius: var(--radius-xl);
    background: color-mix(in oklab, var(--btn-secondary) 96%, transparent);
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  }

  .alert-row:hover {
    background: color-mix(in oklab, var(--btn-tertiary) 90%, transparent);
    border-color: color-mix(in oklab, var(--brand) 22%, var(--glass-stroke-dark));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 22px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .alert-row.unread::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--brand) 0%, color-mix(in oklab, var(--brand) 78%, white) 100%);
    pointer-events: none;
  }

  .alert-row.unread {
    border-color: color-mix(in oklab, var(--brand) 28%, var(--glass-stroke-dark));
    background: linear-gradient(
      135deg,
      color-mix(in oklab, var(--btn-secondary) 88%, rgba(var(--brand-rgb), 0.18)) 0%,
      color-mix(in oklab, var(--btn-secondary) 93%, transparent) 100%
    );
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 20px rgba(var(--brand-rgb), 0.1);
  }

  .alert-row:not(.unread) {
    background: color-mix(in oklab, var(--btn-secondary) 97%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  .alert-row-inner {
    display: flex;
    align-items: flex-start;
    padding: var(--space-lg) var(--space-xl);
    min-height: 3.25rem;
  }

  .alert-row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .alert-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .alert-title-wrap {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--space-sm);
    min-width: 0;
  }

  .alert-unread-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    background: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    margin-top: 0.25rem;
    flex: 0 0 auto;
  }

  .alert-title {
    font-weight: 600;
    font-size: 0.9375rem;
    color: color-mix(in oklab, var(--text-primary) 74%, var(--text-secondary));
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .alert-row.unread .alert-title {
    color: var(--text-primary);
  }

  .alert-body {
    margin: 0;
    font-size: 0.8125rem;
    color: color-mix(in oklab, var(--text-secondary) 84%, var(--text-primary));
    line-height: 1.5;
    line-clamp: 3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alert-row.unread .alert-body {
    color: color-mix(in oklab, var(--text-secondary) 94%, var(--text-primary));
  }

  .alert-time {
    flex-shrink: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: color-mix(in oklab, var(--text-secondary) 86%, var(--text-primary));
    background: color-mix(in oklab, var(--btn-tertiary) 72%, transparent);
    border: 1px solid color-mix(in oklab, var(--glass-stroke-dark) 80%, transparent);
    border-radius: var(--radius-full);
    padding: 0.125rem var(--space-sm);
    margin-left: var(--space-md);
  }

  .alert-row.unread .alert-time {
    color: color-mix(in oklab, var(--text-secondary) 96%, var(--text-primary));
    background: color-mix(in oklab, rgba(var(--brand-rgb), 0.16) 50%, var(--btn-tertiary));
    border-color: color-mix(in oklab, var(--brand) 20%, transparent);
  }

  .loading-item {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 3rem;
    padding: var(--space-md) 0;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .load-more-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--glass-stroke-dark);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .alerts-page {
      padding: var(--space-xl);
    }

    .alert-row-top {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-sm);
    }

    .alert-time {
      margin-left: 0;
    }

    .alert-row-inner {
      padding: var(--space-lg);
    }
  }
</style>
