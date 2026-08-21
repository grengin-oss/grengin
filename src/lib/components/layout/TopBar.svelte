<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { Link, navigate } from 'svelte-routing';
  import { _ } from 'svelte-i18n';
  import type { User } from '../../types/auth';
  import { permissionsStore } from '../../features/auth/index.js';
  import { getNotificationsState } from '../../features/notifications/index.js';
  import { topBarState } from './topBarState.svelte.js';

  interface Props {
    user?: User | null;
    onlogout?: () => void;
  }

  let { user = null, onlogout }: Props = $props();

  const notifState = getNotificationsState();

  let menuOpen = $state(false);
  let userEl = $state.raw<HTMLElement | undefined>(undefined);

  // Same navigation mirror the sidebar uses: svelte-routing's Link goes through
  // pushState, which fires no event of its own.
  let currentPath = $state(window.location.pathname);

  $effect(() => {
    const update = () => {
      currentPath = window.location.pathname;
    };
    window.addEventListener('popstate', update);
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      update();
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      update();
    };
    return () => {
      window.removeEventListener('popstate', update);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  let isAdminView = $derived(currentPath.startsWith('/admin'));
  let isChatView = $derived(
    currentPath === '/' ||
      currentPath === '/chat' ||
      currentPath.startsWith('/chat/'),
  );
  let hasAdminPermissions = $derived(permissionsStore.hasAnyPermissions());

  // Route → label. The bar names the page the router is on; the leaf name of a
  // detail page arrives via topBarState.crumbLeaf from the page itself.
  const ROUTE_LABEL_KEYS: Record<string, string> = {
    '/admin/overview': 'sidebar.overview',
    '/admin/analytics': 'sidebar.usageAnalytics',
    '/admin/prompt-effectiveness': 'sidebar.promptEffectiveness',
    '/admin/audit-logs': 'sidebar.auditLogs',
    '/admin/departments': 'sidebar.organization',
    '/admin/users': 'sidebar.users',
    '/admin/ai-engines': 'sidebar.aiEngines',
    '/admin/mcp-servers': 'sidebar.connectors',
    '/admin/access-control': 'sidebar.accessControl',
    '/admin/skills': 'sidebar.skills',
    '/admin/prompt-library': 'sidebar.promptLibrary',
    '/admin/settings': 'sidebar.settings',
    '/admin/system-metrics': 'sidebar.systemMetrics',
    '/admin/alerts': 'topBar.alerts',
    '/projects': 'sidebar.projects',
    '/alerts': 'topBar.alerts',
    '/settings': 'sidebar.settings',
  };

  interface Crumb {
    label: string;
    path?: string;
  }

  let crumbs = $derived.by<Crumb[]>(() => {
    const leaf = topBarState.crumbLeaf;

    if (isAdminView) {
      const root: Crumb = { label: $_('sidebar.adminPanel'), path: '/admin' };
      const key = ROUTE_LABEL_KEYS[currentPath];
      const section = key ? { label: $_(key) } : null;
      // A named entity below a section pushes that section back to a link.
      if (section && leaf) {
        return [root, { ...section, path: currentPath }, { label: leaf }];
      }
      return section ? [root, section] : [root];
    }

    if (currentPath.startsWith('/projects/')) {
      const root = { label: $_('sidebar.projects'), path: '/projects' };
      // Until the page reports its project name there is nothing to name it
      // with, so the root stands alone rather than showing a placeholder.
      return leaf ? [root, { label: leaf }] : [{ label: root.label }];
    }

    const key = ROUTE_LABEL_KEYS[currentPath];
    return key ? [{ label: $_(key) }] : [];
  });

  // Case 1: the chat bar. Both halves of the badge are facts the chat page
  // publishes, so a half it cannot establish is simply left out.
  let badgeParts = $derived.by<string[]>(() => {
    const parts: string[] = [];
    if (topBarState.chat.approvedModel) parts.push($_('topBar.approvedModel'));
    if (topBarState.chat.visibility === 'team') {
      parts.push($_('topBar.teamVisible'));
    } else if (topBarState.chat.visibility === 'private') {
      parts.push($_('topBar.privateToYou'));
    }
    return parts;
  });

  let chatTitle = $derived(topBarState.chat.title);

  function getUserInitials(): string {
    if (!user?.name) return 'U';
    const parts = user.name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.substring(0, 2).toUpperCase() || 'U';
  }

  function toggleMenu(event: MouseEvent) {
    event.stopPropagation();
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function handleWindowClick(event: MouseEvent) {
    if (!menuOpen) return;
    if (!userEl?.contains(event.target as Node)) closeMenu();
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeMenu();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const scope = event.currentTarget as HTMLElement;
    const items = Array.from(
      scope.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  function goToAlerts() {
    navigate(isAdminView ? '/admin/alerts' : '/alerts');
  }

  function handleLogout() {
    closeMenu();
    onlogout?.();
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={(e) => {
    if (e.key === 'Escape') closeMenu();
  }}
/>

<!-- top-bar — Figma 1168 × 64, from chat/conversation (159:15291) and
     control-hub/overview (159:15429); right cluster is Component 2
     (user-trigger / user-dropdown, 159:15038 / 159:15044). -->
<header class="tb">
  {#if isChatView}
    <div class="tb-left">
      {#if chatTitle}
        <span class="tb-title" title={chatTitle}>{chatTitle}</span>
      {/if}
      {#if badgeParts.length}
        <span class="tb-badge">
          <span class="tb-badge__dot" aria-hidden="true"></span>
          <span class="tb-badge__label">{badgeParts.join(' · ')}</span>
        </span>
      {/if}
    </div>
  {:else}
    <nav class="tb-crumbs" aria-label={$_('topBar.breadcrumb')}>
      {#each crumbs as crumb, i (crumb.label + i)}
        {#if i > 0}
          <span class="tb-crumb tb-crumb--sep" aria-hidden="true">/</span>
        {/if}
        {#if crumb.path && i < crumbs.length - 1}
          <Link to={crumb.path} class="tb-crumb">{crumb.label}</Link>
        {:else}
          <span class="tb-crumb tb-crumb--current" aria-current="page"
            >{crumb.label}</span
          >
        {/if}
      {/each}
    </nav>
  {/if}

  <div class="tb-right">
    <button
      class="tb-bell"
      type="button"
      onclick={goToAlerts}
      aria-label={$_('sidebar.openAlerts')}
      title={$_('sidebar.openAlerts')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {#if notifState.unreadCount > 0}
        <span class="tb-bell__badge" aria-hidden="true"></span>
      {/if}
    </button>

    <div class="tb-user" class:open={menuOpen} bind:this={userEl}>
      <button
        class="tb-user__trigger"
        type="button"
        onclick={toggleMenu}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={user?.name || $_('sidebar.userMenu')}
      >
        <span class="tb-user__avatar">{getUserInitials()}</span>
        <span class="tb-user__name">{user?.name || $_('sidebar.user')}</span>
        <span class="tb-user__caret" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </span>
      </button>

      <div
        class="tb-dropdown"
        role="menu"
        aria-label={$_('sidebar.userMenu')}
        aria-hidden={!menuOpen}
        onkeydown={handleMenuKeydown}
      >
        <Link
          to="/settings"
          class="tb-dd-item"
          role="menuitem"
          onclick={closeMenu}
          aria-label={$_('sidebar.settings')}
        >
          <span class="tb-dd-icon" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </span>
          <span class="tb-dd-label">{$_('sidebar.settings')}</span>
        </Link>

        {#if hasAdminPermissions}
          <Link
            to="/admin"
            class="tb-dd-item"
            role="menuitem"
            onclick={closeMenu}
            aria-label={$_('sidebar.admin')}
          >
            <span class="tb-dd-icon" aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <span class="tb-dd-label">{$_('sidebar.admin')}</span>
          </Link>
        {/if}

        <span class="tb-dd-rule" aria-hidden="true"></span>

        <button
          class="tb-dd-item tb-dd-item--danger"
          type="button"
          role="menuitem"
          onclick={handleLogout}
          aria-label={$_('sidebar.signOut')}
        >
          <span class="tb-dd-icon" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span class="tb-dd-label">{$_('sidebar.signOut')}</span>
        </button>
      </div>
    </div>
  </div>
</header>

<style>
  /* ===== top bar (Figma: 64px, 0 32px padding, 1px hairline) ===== */
  .tb {
    display: flex;
    height: 64px;
    width: 100%;
    padding: 0 32px;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    background: var(--gx-card);
    border: 1px solid var(--gx-hair);
    font-family: var(--gx-font-display);
  }

  /* ---------- left: chat title + status badge ---------- */
  .tb-left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .tb-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 20px;
    color: var(--gx-slate-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tb-badge {
    display: flex;
    height: 26px;
    gap: 6px;
    padding: 5px 10px;
    align-items: center;
    flex-shrink: 0;
    border-radius: 20px;
    background: var(--gx-ok-bg);
    box-shadow: inset 0 0 0 1px var(--gx-ok-line);
  }

  .tb-badge__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--gx-ok-dot);
    flex-shrink: 0;
  }

  .tb-badge__label {
    font-weight: 500;
    font-size: 12px;
    line-height: 16px;
    color: var(--gx-ok-text);
    white-space: nowrap;
  }

  /* ---------- left: breadcrumb ---------- */
  .tb-crumbs {
    display: flex;
    height: 18px;
    gap: 8px;
    align-items: center;
    flex-grow: 1;
    min-width: 0;
  }

  /* `Link` renders its <a> outside this component, so it never receives the
     scope class — the crumb rules are :global, kept under .tb-crumbs. */
  .tb-crumbs :global(.tb-crumb) {
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    font-family: inherit;
    font-weight: 500;
    font-size: 13px;
    line-height: 18px;
    color: var(--gx-slate-400);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
    transition: color 120ms ease;
  }

  .tb-crumbs :global(a.tb-crumb:hover) {
    color: var(--gx-slate-500);
    transform: none;
  }

  .tb-crumbs :global(.tb-crumb--current) {
    color: var(--gx-slate-900);
  }

  .tb-crumbs :global(.tb-crumb--sep) {
    color: var(--gx-slate-400);
    cursor: default;
  }

  /* ---------- right cluster ---------- */
  .tb-right {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-shrink: 0;
  }

  .tb-bell {
    position: relative;
    display: flex;
    width: 32px;
    height: 32px;
    padding: 0;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 0;
    border-radius: 8px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-slate-500);
    cursor: pointer;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .tb-bell:hover {
    background: var(--gx-rule-cool);
    color: var(--gx-slate-500);
    transform: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .tb-bell:focus-visible {
    outline: 2px solid var(--gx-teal);
    outline-offset: 2px;
  }

  .tb-bell__badge {
    position: absolute;
    left: 18px;
    top: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gx-danger);
    box-shadow: inset 0 0 0 1.5px var(--gx-card);
  }

  /* ---------- user chip + dropdown (Component 2) ---------- */
  .tb-user {
    position: relative;
    width: 169px;
    height: 40px;
    flex-shrink: 0;
  }

  .tb-user__trigger {
    display: flex;
    width: 169px;
    height: 40px;
    gap: 8px;
    padding: 6px 10px;
    justify-content: flex-start;
    align-items: center;
    border: 0;
    border-radius: 8px;
    background: var(--gx-page);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    cursor: pointer;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .tb-user__trigger:hover,
  .open .tb-user__trigger {
    background: var(--gx-rule-cool);
    transform: none;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .tb-user__trigger:focus-visible {
    outline: 2px solid var(--gx-teal);
    outline-offset: 2px;
  }

  .tb-user__avatar {
    display: flex;
    width: 28px;
    align-self: stretch;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 14px;
    background: var(--gx-teal);
    font-weight: 700;
    font-size: 11px;
    line-height: 14px;
    color: #fff;
  }

  .tb-user__name {
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
    line-height: 18px;
    color: var(--gx-slate-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tb-user__caret {
    position: absolute;
    inset-inline-end: 10px;
    display: flex;
    color: var(--gx-slate-900);
    transition: transform 160ms ease;
  }

  .open .tb-user__caret {
    transform: rotate(180deg);
  }

  .tb-dropdown {
    position: absolute;
    inset-inline-start: 0;
    top: 44px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    width: 169px;
    padding: 8px 0;
    align-items: flex-start;
    overflow: hidden;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.1);
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
    transition:
      opacity 140ms ease,
      transform 140ms ease;
  }

  .open .tb-dropdown {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .tb-dropdown :global(.tb-dd-item) {
    display: flex;
    height: 40px;
    width: 100%;
    gap: 10px;
    padding: 10px 16px;
    justify-content: flex-start;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .tb-dropdown :global(.tb-dd-item:hover) {
    background: var(--gx-rule-cool);
    transform: none;
    box-shadow: none;
  }

  .tb-dropdown :global(.tb-dd-item:focus-visible) {
    outline: 2px solid var(--gx-teal);
    outline-offset: -2px;
  }

  .tb-dropdown :global(.tb-dd-icon) {
    display: flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 6px;
    background: var(--gx-rule-cool);
    color: var(--gx-slate-500);
  }

  .tb-dropdown :global(.tb-dd-label) {
    font-weight: 500;
    font-size: 13px;
    line-height: 18px;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .tb-dropdown :global(.tb-dd-rule) {
    height: 1px;
    align-self: stretch;
    flex-shrink: 0;
    background: var(--gx-rule-cool);
  }

  .tb-dropdown :global(.tb-dd-item--danger:hover) {
    background: var(--gx-danger-soft);
  }

  .tb-dropdown :global(.tb-dd-item--danger .tb-dd-icon) {
    background: var(--gx-danger-soft);
    color: var(--gx-danger);
  }

  .tb-dropdown :global(.tb-dd-item--danger .tb-dd-label) {
    font-weight: 600;
    color: var(--gx-danger);
  }

  /* ---------- mobile ---------- */
  @media (max-width: 768px) {
    .tb {
      padding: 0 16px;
    }

    .tb-user,
    .tb-user__trigger {
      width: 40px;
    }

    .tb-user__name,
    .tb-user__caret {
      display: none;
    }

    .tb-user__trigger {
      padding: 6px;
      justify-content: center;
    }

    .tb-dropdown {
      inset-inline-start: auto;
      inset-inline-end: 0;
    }

    .tb-badge__label {
      display: none;
    }

    .tb-badge {
      padding: 5px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tb-user__caret,
    .tb-dropdown {
      transition: none;
    }
  }
</style>
