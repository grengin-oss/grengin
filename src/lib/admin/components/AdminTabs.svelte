<script lang="ts">
  import { onMount } from "svelte";

  type TabConfig = {
    id: string;
    label: string;
    ariaLabel?: string;
  };

  interface AdminTabsProps {
    tabs: TabConfig[];
    defaultTab: string;
    currentTab?: string;
    tabListLabel?: string;
    onTabChange?: (tab: string) => void;
  }

  let {
    tabs,
    defaultTab,
    currentTab = $bindable(),
    tabListLabel = "Tabs",
    onTabChange,
  }: AdminTabsProps & { currentTab: string } = $props();

  let availableTabIds = $derived(tabs.map((tab: TabConfig) => tab.id));
  let lastSyncedTab = $state<string | null>(null);
  let isInitialized = $state(false);

  function normalizeTab(tab: string | null): string {
    if (!tab) return defaultTab;
    const normalized = tab.toLowerCase();
    return availableTabIds.includes(normalized) ? normalized : defaultTab;
  }

  function getTabFromQuery(): string {
    const params = new URLSearchParams(window.location.search);
    return normalizeTab(params.get("tab"));
  }

  function syncQueryToUrl(tab: string, replace = false): void {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);

    if (replace) {
      history.replaceState(null, "", url.toString());
    } else {
      history.pushState(null, "", url.toString());
    }
  }

  function setTab(tab: string): void {
    if (currentTab === tab) return;
    currentTab = tab;
    syncQueryToUrl(tab);
    lastSyncedTab = tab;
    onTabChange?.(tab);
  }

  function handleKeydown(event: KeyboardEvent, tab: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setTab(tab);
    }
  }

  function handlePopState(): void {
    const tab = getTabFromQuery();
    currentTab = tab;
    lastSyncedTab = tab;
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get("tab");
    const normalizedTab = normalizeTab(rawTab);

    currentTab = normalizedTab;
    lastSyncedTab = normalizedTab;

    const shouldReplace =
      !rawTab || rawTab.toLowerCase() !== normalizedTab ||
      !availableTabIds.includes(rawTab.toLowerCase());

    if (shouldReplace) {
      syncQueryToUrl(normalizedTab, true);
    }

    window.addEventListener("popstate", handlePopState);
    isInitialized = true;

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });

  $effect(() => {
    if (!isInitialized) return;
    if (!availableTabIds.includes(currentTab)) {
      currentTab = defaultTab;
      syncQueryToUrl(defaultTab, true);
      lastSyncedTab = defaultTab;
      onTabChange?.(defaultTab);
      return;
    }

    if (currentTab !== lastSyncedTab) {
      syncQueryToUrl(currentTab);
      lastSyncedTab = currentTab;
      onTabChange?.(currentTab);
    }
  });
</script>

<div class="tabs" role="tablist" aria-label={tabListLabel}>
  {#each tabs as tab (tab.id)}
    <button
      class="tab"
      class:tab--active={currentTab === tab.id}
      role="tab"
      aria-selected={currentTab === tab.id}
      aria-controls={`${tab.id}-panel`}
      aria-label={tab.ariaLabel ?? tab.label}
      tabindex={currentTab === tab.id ? 0 : -1}
      onclick={() => setTab(tab.id)}
      onkeydown={(event) => handleKeydown(event, tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  @media (max-width: 768px) {
    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      width: 100%;
    }

    .tab {
      white-space: nowrap;
    }
  }

  @media (max-width: 480px) {
    .tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.875rem;
    }
  }
</style>
