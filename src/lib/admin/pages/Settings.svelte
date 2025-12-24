<script lang="ts">
  import { onMount } from "svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import AiEngines from "../components/AiEngines.svelte";

  let currentTab = $state<string>("ai-engines");
  let hasNavigatedFromDefault = $state<boolean>(false);
  let hasCreatedHistoryEntries = $state<boolean>(false);

  function getTabFromHash(): string {
    const hash = window.location.hash.slice(1); // Remove the '#'
    if (hash === "ai-engines") return "ai-engines";
    return "ai-engines"; // Default to ai-engines
  }

  function handleTabClick(tab: string) {
    const previousTab = currentTab;

    // If clicking the same tab, do nothing
    if (previousTab === tab) {
      return;
    }

    currentTab = tab;
    const hash = "ai-engines";

    // Replace history (don't create new entries)
    history.replaceState(null, "", `#${hash}`);
    hasNavigatedFromDefault = true;
  }

  function handleHashChange() {
    const newTab = getTabFromHash();
    hasNavigatedFromDefault = newTab !== "ai-engines";
    currentTab = newTab;
  }

  onMount(() => {
    // If no hash in URL, redirect to default tab (ai-engines)
    if (!window.location.hash) {
      window.location.hash = "ai-engines";
      currentTab = "ai-engines";
    } else {
      // Set initial tab from URL hash
      currentTab = getTabFromHash();

      // If starting on a non-default tab, mark as navigated
      if (currentTab !== "ai-engines") {
        hasNavigatedFromDefault = true;
        hasCreatedHistoryEntries = true;
      }
    }

    // Listen for hash changes (browser back/forward)
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  });
</script>

<div class="settings-container">
  <PageHeader
    title="Settings"
    subtitle="Configure system settings and integrations"
  />

  <!-- Tab navigation for settings sub-pages -->
  <div class="settings-tabs">
    <button
      class="settings-tab"
      class:active={currentTab === "ai-engines"}
      onclick={() => handleTabClick("ai-engines")}
    >
      AI Engines
    </button>
  </div>

  <div class="settings-content">
    {#if currentTab === "ai-engines"}
      <AiEngines />
    {:else}
      <p class="settings-note">
        Please select a settings category from the tabs above.
      </p>
    {/if}
  </div>
</div>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
  }
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
    transition: all 0.2s ease;
    font-weight: 500;
    font-size: 0.9375rem;
    cursor: pointer;
  }

  .settings-tab:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.03);
  }

  .settings-tab.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  .settings-content {
    padding: var(--space-xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .settings-content p {
    font-size: 1rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-lg);
  }

  .settings-note {
    font-size: 0.9375rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  @media (max-width: 768px) {
    .settings-tabs {
      overflow-x: auto;
    }

    .settings-tab {
      white-space: nowrap;
    }
  }
</style>

