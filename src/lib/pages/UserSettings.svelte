<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import UserIntegrations from "./settings/UserIntegrations.svelte";
  import UserPromptSettings from "./settings/UserPromptSettings.svelte";
  import UserSkills from "./settings/UserSkills.svelte";
  import { loadNamespaces } from "$lib/i18n/index.js";
  import { setPageTitle } from "../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("userSettings.title"));
  });

  type TabId = "skills" | "integrations" | "promptSettings";

  interface TabConfig {
    id: TabId;
    label: string;
    ariaLabel: string;
  }

  const TABS: TabConfig[] = $derived([
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

  const DEFAULT_TAB: TabId = "skills";
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
    loadNamespaces(["settings"]);

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

<div class="us-page">
  <!-- ".header-container" -->
  <div class="header-container">
    <div class="title-block">
      <span class="page-title">{$_("userSettings.title")}</span>
      <span class="page-sub">{$_("userSettings.subtitle")}</span>
    </div>

    <!-- ".tab-bar" -->
    <div class="tab-bar" role="tablist" aria-label={$_("userSettings.title")}>
      {#each TABS as tab (tab.id)}
        <button
          class="us-tab"
          type="button"
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
  </div>

  <!-- ".tab-panel" — one panel at a time; each renders its own 32px stack. -->
  <div
    class="tab-panel"
    role="tabpanel"
    id={`${currentTab}-panel`}
    aria-label={TABS.find((t) => t.id === currentTab)?.label}
    tabindex="0"
  >
    {#if currentTab === "skills"}
      <UserSkills />
    {:else if currentTab === "integrations"}
      <UserIntegrations />
    {:else if currentTab === "promptSettings"}
      <UserPromptSettings />
    {/if}
  </div>
</div>

<style>
  /* ===== user-settings.html, transcribed. The mockup's :root block lives here,
     page-local, rather than in app.css: values an existing --gx-* token already
     carries reuse it (so the dark scheme follows for free), and the handful it
     does not carry are literals with a dark override below.

     These custom properties are inherited by UserSkills / UserIntegrations /
     UserPromptSettings, which only ever render inside this page. ===== */
  .us-page {
    --us-surface: var(--gx-card); /* #fff */
    --us-border: var(--gx-an-grid); /* rgb(229,231,235) */
    --us-table-border: var(--gx-org-hair-soft); /* #E6E7EB */
    /* Ink for the selected tab / segment, in every tab strip on the page. */
    --us-tab-active: var(--gx-org-primary-500); /* #427AC6 */
    --us-title: var(--gx-an-strong); /* rgb(31,41,55) */
    --us-body: var(--gx-an-chip-fg); /* rgb(75,85,99) */
    --us-muted: rgb(156, 163, 175);
    --us-field-bg: var(--gx-an-field-bg); /* rgb(249,250,251) */
    --us-track: var(--gx-an-insight-bg); /* rgb(243,244,246) */
    --us-hover: var(--gx-cx-row-hover); /* rgb(249,250,251) */

    /* The mockup's --cta / --cta-hover. Filled blue with white text, so dark
       mode borrows the app's own CTA pair rather than lightening in place. */
    --us-cta: rgb(59, 103, 189);
    --us-cta-hover: rgb(48, 86, 159);
    /* Same blue as ink on a tint, where a lighter dark-mode value is correct. */
    --us-accent: var(--gx-tx-chip-icon-fg); /* rgb(59,103,189) */
    --us-tint: rgb(238, 244, 252);

    --us-mint: rgb(238, 251, 246);
    --us-mint-fg: rgb(46, 168, 117);

    --us-ok: var(--gx-org-brand-alt); /* #2B916B */
    --us-ok-tint: var(--gx-org-brand-alt-tint); /* #F1F8F4 */
    --us-warn: var(--gx-an-amber); /* rgb(217,119,6) */
    --us-warn-bg: var(--gx-amber-soft); /* rgb(251,241,222) */
    --us-danger: var(--gx-org-danger); /* rgb(220,38,38) */
    --us-danger-bg: var(--gx-org-danger-bg); /* rgb(254,242,242) */

    --us-card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.0588);
    --us-menu-shadow: 0 10px 24px 0 rgba(0, 0, 0, 0.0784);
    --us-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  @media (prefers-color-scheme: dark) {
    .us-page {
      --us-muted: var(--gx-org-slate-350);
      --us-cta: var(--gx-org-primary-500);
      --us-cta-hover: var(--gx-ac-cta-hover);
      --us-tint: var(--gx-org-primary-tint);
      --us-mint: var(--gx-sk-built-bg);
      --us-mint-fg: var(--gx-sk-built-fg);
      --us-card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.4);
      --us-menu-shadow: 0 10px 24px 0 rgba(0, 0, 0, 0.5);
    }
  }

  /* app.css paints every bare <button> as a glass pill. The tabs below are
     flat, so strip that here and let each rule paint its own skin. Each child
     component repeats this reset for its own controls — the reset has to stay
     scoped per component so class rules keep out-ranking it. */
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
    white-space: nowrap;
    cursor: pointer;
    transition: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:focus-visible {
    outline: 2px solid var(--us-cta);
    outline-offset: 2px;
  }

  /* ---------------- ".main" ---------------- */
  .us-page {
    display: flex;
    flex-direction: column;
    gap: 32px;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    padding: 40px 48px;
    background: var(--gx-page);
    font-family: var(--gx-font);
    color: var(--us-title);
  }

  /* ---------------- ".header-container" ---------------- */
  .header-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .title-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .page-title {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.5px;
    color: var(--us-title);
  }

  .page-sub {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-body);
  }

  /* ---------------- ".tab-bar" ---------------- */
  .tab-bar {
    /* 338px in the mockup; fit-content lets longer locales grow instead of
       clipping, and min-width pins the English width to the design. */
    width: fit-content;
    min-width: 338px;
    max-width: 100%;
    height: 41px;
    border-radius: 10px;
    background: var(--us-track);
    display: flex;
    gap: 4px;
    padding: 4px;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .us-tab {
    flex: 1 1 0;
    border-radius: 8px;
    padding: 8px 16px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .us-tab[aria-selected="true"] {
    background: var(--us-surface);
    box-shadow: var(--us-card-shadow);
    color: var(--us-tab-active);
  }

  /* ---------------- ".tab-panel" ---------------- */
  .tab-panel {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-self: stretch;
    outline: none;
  }

  @media (max-width: 768px) {
    .us-page {
      padding: 24px 20px;
      gap: 24px;
    }

    .tab-bar {
      min-width: 0;
      width: 100%;
    }

    .page-title {
      font-size: 24px;
    }
  }
</style>
