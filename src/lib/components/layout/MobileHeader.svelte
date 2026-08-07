<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from 'svelte-routing';
  import { _ } from 'svelte-i18n';
  import grenginLogo from '../../../assets/grengin-logo.svg';
  import { getNotificationsState } from '../../features/notifications/index.js';
  import AlertsPopover from '../../features/notifications/AlertsPopover.svelte';

  interface Props {
    sidebarCollapsed: boolean;
    onToggleMenu: (event: Event) => void;
  }

  let { sidebarCollapsed, onToggleMenu }: Props = $props();

  const notifState = getNotificationsState();
  let showAlertsPopover = $state(false);
  let alertsAnchorEl = $state.raw<HTMLElement | undefined>(undefined);

  function closeAlertsPopover(): void {
    showAlertsPopover = false;
  }

  function goToAlertsPage(): void {
    closeAlertsPopover();
    const isAdminView = window.location.pathname.startsWith('/admin');
    navigate(isAdminView ? '/admin/alerts' : '/alerts');
  }

  function handleAlertsClickOutside(event: MouseEvent): void {
    if (!showAlertsPopover) return;
    const t = event.target as Node | null;
    if (!t) return;
    if (alertsAnchorEl?.contains(t)) return;
    closeAlertsPopover();
  }
</script>

<svelte:window onclick={handleAlertsClickOutside} />

<div class="mobile-header">
  <button
    type="button"
    class="mobile-menu-btn"
    class:mobile-menu-btn-open={!sidebarCollapsed}
    onclick={onToggleMenu}
    aria-expanded={!sidebarCollapsed}
    aria-label={sidebarCollapsed ? $_('app.openMenu') : $_('app.closeMenu')}
    title={sidebarCollapsed ? $_('app.openMenu') : $_('app.closeMenu')}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
  </button>
  <img src={grenginLogo} alt="Grengin" class="mobile-header-logo" />

  <button
    type="button"
    class="mobile-alerts-btn"
    bind:this={alertsAnchorEl}
    class:mobile-alerts-btn-active={showAlertsPopover}
    onclick={(e) => {
      e.stopPropagation();
      showAlertsPopover = !showAlertsPopover;
    }}
    aria-expanded={showAlertsPopover}
    aria-label={$_('sidebar.openAlerts')}
    title={$_('sidebar.openAlerts')}
  >
    <svg
      class="mobile-alerts-bell-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    {#if notifState.unreadCount > 0}
      <span class="mobile-alerts-badge">{notifState.unreadCount > 99 ? '99+' : notifState.unreadCount}</span>
    {/if}
  </button>
</div>

<AlertsPopover
  open={showAlertsPopover}
  anchorEl={alertsAnchorEl}
  align="end"
  onClose={closeAlertsPopover}
  onNavigate={goToAlertsPage}
/>

<style>
  .mobile-header {
    display: none;
    align-items: center;
    gap: var(--space-sm);
    min-height: 3.5rem;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-primary);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    position: sticky;
    top: 0;
    z-index: 520;
  }

  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    background: var(--btn-secondary);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    flex-shrink: 0;
  }

  .mobile-menu-btn-open {
    background: color-mix(in oklab, var(--btn-tertiary) 82%, var(--brand));
    border-color: rgba(var(--brand-rgb), 0.45);
    color: var(--brand);
  }

  @media (hover: hover) and (pointer: fine) {
    .mobile-menu-btn:hover {
      background: var(--btn-tertiary);
      border-color: var(--brand);
      color: var(--brand);
      transform: translateY(-1px);
    }
  }

  .mobile-menu-btn:active {
    transform: translateY(0);
  }

  .mobile-header-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
    margin-inline-start: var(--space-sm);
  }

  .mobile-alerts-btn {
    margin-inline-start: auto;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(var(--glass-tint), 0.06);
    backdrop-filter: blur(0.75rem);
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
  }

  .mobile-alerts-btn:hover {
    background: rgba(var(--glass-tint), 0.12);
    border-color: var(--link-color);
    color: var(--link-color);
    transform: translateY(-1px);
  }

  .mobile-alerts-btn:active {
    transform: translateY(0);
  }

  .mobile-alerts-btn-active {
    background: var(--btn-tertiary);
    color: var(--brand);
    border-color: rgba(var(--brand-rgb), 0.45);
  }

  .mobile-alerts-badge {
    position: absolute;
    top: -2px;
    inset-inline-end: -2px;
    min-width: 1.125rem;
    height: 1.125rem;
    padding: 0 4px;
    border-radius: var(--radius-full);
    background: var(--brand);
    color: var(--bg-primary);
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1.2rem;
    text-align: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  @media (max-width: 768px) {
    .mobile-header {
      display: flex;
    }
  }

  :global(html[data-app-layout='mobile']) .mobile-header {
    display: flex;
  }

  @media (orientation: landscape) and (max-height: 600px) {
    :global(html[data-app-layout='mobile']) .mobile-header {
      min-height: 2.75rem;
      padding: var(--space-xs) var(--space-sm);
    }

    :global(html[data-app-layout='mobile']) .mobile-menu-btn,
    :global(html[data-app-layout='mobile']) .mobile-alerts-btn {
      width: 38px;
      height: 38px;
    }

    :global(html[data-app-layout='mobile']) .mobile-header-logo {
      height: 22px;
    }
  }

  @media (max-width: 480px) {
    .mobile-header {
      min-height: 3.25rem;
      padding: var(--space-sm);
    }

    .mobile-menu-btn {
      width: 42px;
      height: 42px;
    }

    .mobile-header-logo {
      height: 24px;
    }

    .mobile-alerts-btn {
      width: 42px;
      height: 42px;
    }
  }
</style>
