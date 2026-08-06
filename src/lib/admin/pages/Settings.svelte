<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminTabs from "../components/AdminTabs.svelte";
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
      label: $_("admin.settings.tabs.oauth"),
      ariaLabel: $_("admin.settings.tabs.oauthAria"),
    },
  ] as const;

  const DEFAULT_TAB: TabId = "oauth";
  // State
  let currentTab = $state<TabId>(DEFAULT_TAB);
</script>

<div class="settings-container">
  <PageHeader
    title={$_('admin.settings.title')}
    subtitle={$_('admin.settings.subtitle')}
  />

  <AdminTabs
    tabs={TABS}
    defaultTab={DEFAULT_TAB}
    tabListLabel={$_("admin.tabListLabels.settings")}
    bind:currentTab
  />

  <!-- Tab content with proper ARIA -->
  <div
    class="settings-content"
    role="tabpanel"
    id={`${currentTab}-panel`}
    aria-labelledby={currentTab}
    tabindex="-1"
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
    overflow-y: auto;
  }

  /* Tab content */
  .settings-content {
    padding: var(--space-sm);
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: var(--radius-lg);
    outline: none;
  }

  .settings-content:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .settings-container {
      padding: var(--space-xl);
    }
  }

  @media (max-width: 480px) {
    .settings-container {
      padding: var(--space-lg);
    }
  }
</style>
