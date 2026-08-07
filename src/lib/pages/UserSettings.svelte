<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../admin/components/PageHeader.svelte";
  import AppearanceSettings from "./settings/AppearanceSettings.svelte";
  import BackendSettings from "./settings/BackendSettings.svelte";
  import UserIntegrations from "./settings/UserIntegrations.svelte";
  import UserPromptSettings from "./settings/UserPromptSettings.svelte";
  import UserSkills from "./settings/UserSkills.svelte";
  import { loadNamespaces } from "$lib/i18n/index.js";

  type TabId = "appearance" | "backend" | "skills" | "integrations" | "promptSettings";

  interface TabConfig {
    id: TabId;
    label: string;
    ariaLabel: string;
  }

  const TABS: TabConfig[] = $derived([
    {
      id: "appearance",
      label: $_("userSettings.tabs.appearance"),
      ariaLabel: $_("userSettings.tabs.appearanceAria"),
    },
    {
      id: "backend",
      label: $_("userSettings.tabs.backend"),
      ariaLabel: $_("userSettings.tabs.backendAria"),
    },
    {
      id: "skills",
      label: $_("userSettings.tabs.skills"),
      ariaLabel: $_("userSettings.tabs.skillsAria"),
    },
    {
      id: "integrations",
      label: $_("userSettings.tabs.integrations"),
      ariaLabel: $_("userSettings.tabs.integrationsAria"),
    },
    {
      id: "promptSettings",
      label: $_("userSettings.tabs.promptSettings"),
      ariaLabel: $_("userSettings.tabs.promptSettingsAria"),
    },
  ]);

  const DEFAULT_TAB: TabId = "appearance";
  const availableTabIds = $derived(TABS.map((t) => t.id));

  let currentTab = $state<TabId>(DEFAULT_TAB);

  function getTabFromQuery(): TabId {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");

    if (!tabParam) return DEFAULT_TAB;

    const candidate = tabParam as TabId;
    return availableTabIds.includes(candidate) ? candidate : DEFAULT_TAB;
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

  onMount(() => {
    // Ensure settings namespace is loaded for translations
    loadNamespaces(['settings']);
    
    const initialTab = getTabFromQuery();
    currentTab = initialTab;

    if (!window.location.search.includes("tab=")) {
      syncQueryToUrl(initialTab, true);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });
</script>

<div class="settings-container">
  <PageHeader
    title={$_("userSettings.title")}
    subtitle={$_("userSettings.subtitle")}
  />

  <div class="tabs" role="tablist" aria-label="User settings tabs">
    {#each TABS as tab (tab.id)}
      <button
        class="tab"
        class:tab--active={currentTab === tab.id}
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

  <div
    class="settings-content"
    role="tabpanel"
    id={`${currentTab}-panel`}
    aria-labelledby={currentTab}
    tabindex="0"
  >
    {#if currentTab === "appearance"}
      <AppearanceSettings />
    {:else if currentTab === "backend"}
      <BackendSettings />
    {:else if currentTab === "skills"}
      <UserSkills />
    {:else if currentTab === "integrations"}
      <UserIntegrations />
    {:else if currentTab === "promptSettings"}
      <UserPromptSettings />
    {/if}
  </div>
</div>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    gap: var(--space-lg);
    overflow: hidden;
  }

  .tabs {
    flex-shrink: 0;
  }

  .settings-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-sm);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    outline: none;
  }

  @media (max-width: 768px) {
    .settings-container {
      padding: var(--space-xl);
    }

    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }

    .tab {
      white-space: nowrap;
    }
  }

  @media (orientation: landscape) and (max-height: 600px) {
    :global(html[data-app-layout='mobile']) .settings-container {
      padding: var(--space-md);
      gap: var(--space-sm);
    }

    :global(html[data-app-layout='mobile']) .settings-content {
      padding: var(--space-xs);
    }
  }

  @media (max-width: 480px) {
    .settings-container {
      padding: var(--space-lg);
    }

    .tab {
      padding: var(--space-sm) var(--space-md);
      font-size: 0.875rem;
    }
  }
</style>
