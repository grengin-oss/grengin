<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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
    /**
     * "default" keeps the app-wide underline tabs; "segmented" is the
     * pill-in-a-track switcher the Organization design uses.
     */
    variant?: "default" | "segmented";
  }

let {
  tabs,
  defaultTab,
  currentTab = $bindable(),
  tabListLabel = "Tabs",
  onTabChange,
  variant = "default",
}: AdminTabsProps & { currentTab: string } = $props();

let availableTabIds = $derived(tabs.map((tab: TabConfig) => tab.id));
let lastSyncedTab = $state<string | null>(null);
let isInitialized = $state(false);
let tabButtonRefs: Array<HTMLButtonElement | null> = [];

function tabRef(node: HTMLButtonElement, index: number) {
  tabButtonRefs[index] = node;
  return {
    update(newIndex: number) {
      tabButtonRefs[index] = null;
      tabButtonRefs[newIndex] = node;
      index = newIndex;
    },
    destroy() {
      if (tabButtonRefs[index] === node) {
        tabButtonRefs[index] = null;
      }
    },
  };
}

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

function focusTab(index: number): void {
  const count = tabs.length;
  if (!count) return;
  const normalized = ((index % count) + count) % count;
  const targetTab = tabs[normalized];
  if (!targetTab) return;
  setTab(targetTab.id);
  tabButtonRefs[normalized]?.focus();
}

function handleKeydown(event: KeyboardEvent, tab: string, index: number): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setTab(tab);
    return;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    focusTab(index + 1);
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    focusTab(index - 1);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    focusTab(0);
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    focusTab(tabs.length - 1);
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

<div class="tabs" class:tabs--segmented={variant === "segmented"} role="tablist" aria-label={tabListLabel}>
{#each tabs as tab, index (tab.id)}
    <button
      class="tab"
      class:tab--active={currentTab === tab.id}
      role="tab"
      aria-selected={currentTab === tab.id}
      aria-controls={`${tab.id}-panel`}
      id={`tab-${tab.id}`}
      aria-label={tab.ariaLabel ?? tab.label}
      tabindex="0"
      onclick={() => {
        setTab(tab.id);
        tabButtonRefs[index]?.focus();
      }}
      onkeydown={(event) => handleKeydown(event, tab.id, index)}
      use:tabRef={index}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Keep tab list visible in column flex layouts (e.g. admin pages with height: 100%) */
  .tabs {
    flex-shrink: 0;
  }

  /* Segmented switcher (Organization design): pills inside a track. Overrides
     the global .tabs/.tab underline treatment from app.css. */
  .tabs--segmented {
    height: 36px;
    padding: 4px;
    gap: 4px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-track);
    display: inline-flex;
    align-items: center;
    width: auto;
    margin: 0;
  }

  .tabs--segmented .tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 6px 16px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    font-family: var(--gx-font);
    font-size: 13px;
    font-weight: 600;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .tabs--segmented .tab:hover:not(.tab--active) {
    background: transparent;
    color: var(--gx-org-slate-800);
    transform: none;
  }

  .tabs--segmented .tab--active,
  .tabs--segmented .tab[aria-selected="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.0314);
    color: var(--gx-slate-900);
  }

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

    /* The segmented track hugs its pills instead of stretching. */
    .tabs--segmented {
      width: auto;
    }
  }

  @media (max-width: 480px) {
    .tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.875rem;
    }

    .tabs--segmented .tab {
      padding: 6px 14px;
      font-size: 13px;
    }
  }
</style>
