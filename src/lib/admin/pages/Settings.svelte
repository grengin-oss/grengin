<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import OAuthProviders from "./advanced/OAuthProviders.svelte";

  // Tab configuration
  type TabId = "oauth";

  interface TabConfig {
    id: TabId;
    label: string;
    ariaLabel: string;
  }

  const TABS: TabConfig[] = [
    {
      id: "oauth",
      label: "OAuth",
      ariaLabel: "OAuth providers configuration",
    },
  ] as const;

  const DEFAULT_TAB: TabId = "oauth";
  const availableTabIds = TABS.map((t) => t.id);

  // State
  let currentTab = $state<TabId>(DEFAULT_TAB);

  // URL utilities
  function getTabFromQuery(): TabId {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");

    if (!tabParam) return DEFAULT_TAB;

    const normalized = tabParam.toLowerCase() as TabId;
    return availableTabIds.includes(normalized) ? normalized : DEFAULT_TAB;
  }

  function syncQueryToUrl(tab: TabId, replace = false): void {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);

    if (replace) {
      history.replaceState(null, "", url.toString());
    } else {
      history.pushState(null, "", url.toString());
    }
  }

  // Event handlers
  function handleTabClick(tab: TabId): void {
    if (currentTab === tab) return;
    currentTab = tab;
    syncQueryToUrl(tab);
  }

  function handleKeydown(event: KeyboardEvent, tab: TabId): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTabClick(tab);
    }
  }

  function handlePopState(): void {
    currentTab = getTabFromQuery();
  }

  // Initialize on mount
  onMount(() => {
    // Set initial tab from URL or default
    const initialTab = getTabFromQuery();
    currentTab = initialTab;

    // Ensure URL is synced (add ?tab= if missing)
    if (!window.location.search.includes("tab=")) {
      syncQueryToUrl(initialTab, true);
    }

    // Listen for browser back/forward
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });
</script>

<div class="settings-container">
  <PageHeader
    title={$_('admin.settings.title')}
    subtitle={$_('admin.settings.subtitle')}
  />

  <!-- Tab navigation with proper ARIA -->
  <div class="settings-tabs" role="tablist" aria-label="Settings tabs">
    {#each TABS as tab (tab.id)}
      <button
        class="settings-tab"
        class:active={currentTab === tab.id}
        role="tab"
        aria-selected={currentTab === tab.id}
        aria-controls={`${tab.id}-panel`}
        aria-label={tab.ariaLabel}
        tabindex={currentTab === tab.id ? 0 : -1}
        onclick={() => handleTabClick(tab.id)}
        onkeydown={(e) => handleKeydown(e, tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content with proper ARIA -->
  <div
    class="settings-content"
    role="tabpanel"
    id={`${currentTab}-panel`}
    aria-labelledby={currentTab}
    tabindex="0"
  >
    {#if currentTab === "oauth"}
      <OAuthProviders />
    {/if}
  </div>
</div>

<style>
  /* Container */
  .settings-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
  }

  /* Tab navigation */
  .settings-tabs {
    display: flex;
    gap: var(--space-sm);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: var(--space-2xl);
    flex-wrap: wrap;
  }

  .settings-tab {
    padding: var(--space-md) var(--space-lg);
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    transition:
      color 0.2s ease,
      background-color 0.2s ease,
      border-color 0.2s ease;
    font-weight: 500;
    font-size: 0.9375rem;
    cursor: pointer;
    outline: none;
    position: relative;
  }

  .settings-tab:hover:not(.active) {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.03);
  }

  .settings-tab:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .settings-tab.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  /* Tab content */
  .settings-content {
    padding: var(--space-sm);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    outline: none;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .settings-container {
      padding: var(--space-xl);
    }

    .settings-tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }

    .settings-tab {
      white-space: nowrap;
    }
  }

  @media (max-width: 480px) {
    .settings-container {
      padding: var(--space-lg);
    }

    .settings-tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.875rem;
    }
  }
</style>
