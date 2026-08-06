<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { MergedToolResult } from "../../../types/toolCall";
  import { _ } from "svelte-i18n";

  interface Props {
    mergedWebSearch: MergedToolResult;
  }

  let { mergedWebSearch }: Props = $props();

  // Determine tool status based on the status field
  const isCompleted = $derived(mergedWebSearch.status === 'completed');
  const isRunning = $derived(mergedWebSearch.status === 'running');
  const hasResults = $derived(
    mergedWebSearch.web_search?.results &&
      mergedWebSearch.web_search?.results.length > 0,
  );

  // Get the latest result title while running
  const latestResultTitle = $derived(
    hasResults && mergedWebSearch.web_search?.results
      ? mergedWebSearch.web_search?.results[
          mergedWebSearch.web_search?.results.length - 1
        ]?.title
      : null,
  );

  let isExpanded = $state(false);

  function toggleExpanded() {
    // Allow expanding when we have web search data (even if still in progress)
    if (hasResults) {
      isExpanded = !isExpanded;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && hasResults) {
      e.preventDefault();
      isExpanded = !isExpanded;
    }
  }
</script>

<div class="tool-call-container">
  <button
    class="tool-call-toggle"
    class:completed={isCompleted}
    class:running={isRunning}
    class:clickable={hasResults}
    onclick={toggleExpanded}
    onkeydown={handleKeyDown}
    disabled={!hasResults}
    aria-expanded={isExpanded}
  >
    {#if isCompleted}
      <svg
        class="status-icon check"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="var(--brand-green)"
          stroke="var(--brand-green)"
        ></circle>
        <polyline points="8 12 11 15 16 9" stroke="white"></polyline>
      </svg>
    {:else if isRunning}
      <div class="spinner-small"></div>
    {/if}

    <span class="toggle-text">
      {#if isCompleted}
        {$_("chat.toolCalls.searchedTheWeb")}
      {:else if isRunning && latestResultTitle}
        {latestResultTitle}
      {:else}
        {$_("chat.toolCalls.searching")}
      {/if}
    </span>

    <svg
      class="chevron"
      class:rotated={isExpanded}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6,9 12,15 18,9"></polyline>
    </svg>
  </button>

  {#if isExpanded && mergedWebSearch.web_search}
    <div class="tool-details">
      {#if mergedWebSearch.web_search?.query}
        <div class="search-query">
          <svg
            class="globe-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            ></path>
          </svg>
          <span class="query-text">{mergedWebSearch.web_search?.query}</span>
        </div>
      {/if}

      {#if hasResults}
        <div class="sources-list">
          <div class="sources-count">
            {mergedWebSearch.web_search?.results.length}
            {$_("chat.toolCalls.results")}
          </div>
          {#each mergedWebSearch.web_search?.results || [] as result}
            {@const urlObj = new URL(result.url)}
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              class="source-item"
            >
              <div class="source-favicon">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`}
                  alt=""
                  loading="lazy"
                  onerror={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    img.style.display = "none";
                  }}
                />
              </div>
              <div class="source-content">
                <div class="source-title">{result.title}</div>
                <div class="source-domain">{urlObj.hostname}</div>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-call-container {
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.75rem;
    background: var(--surface-elevated);
    overflow: hidden;
  }

  .tool-call-toggle {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: default;
    transition: all 0.2s ease;
  }

  .tool-call-toggle.clickable {
    cursor: pointer;
  }

  .tool-call-toggle.clickable:hover {
    background: var(--surface-subtle);
  }

  .tool-call-toggle.completed {
    color: var(--text-primary);
  }

  .status-icon {
    flex-shrink: 0;
  }

  .status-icon.check {
    color: var(--brand-green);
  }

  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--glass-stroke-light);
    border-top-color: var(--text-secondary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .toggle-text {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .chevron {
    flex-shrink: 0;
    transition: transform 0.2s ease;
    color: var(--text-tertiary);
    margin-left: auto;
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  .tool-details {
    padding: 0 1rem 1rem 1rem;
    border-top: 1px solid var(--glass-stroke-light);
    animation: slideDown 0.2s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 500px;
    }
  }

  .search-query {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    margin: 0.75rem 0;
    background: var(--surface-subtle);
    border-radius: 0.5rem;
    border-left: 3px solid var(--color-accent-primary);
  }

  .globe-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  .query-text {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sources-count {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
  }

  .source-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.625rem;
    text-decoration: none;
    color: var(--text-primary);
    border-radius: 0.5rem;
    transition: background 0.15s ease;
  }

  .source-item:hover {
    background: var(--surface-subtle);
  }

  .source-favicon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
  }

  .source-favicon img {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .source-content {
    flex: 1;
    min-width: 0;
  }

  .source-title {
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--text-primary);
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .source-domain {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    line-height: 1.3;
  }

  @media (max-width: 768px) {
    .tool-call-toggle {
      padding: 0.625rem 0.875rem;
      font-size: 0.8125rem;
    }

    .tool-details {
      padding: 0 0.875rem 0.875rem 0.875rem;
    }

    .search-query {
      padding: 0.625rem 0.75rem;
    }

    .source-item {
      padding: 0.5rem;
    }
  }
</style>
