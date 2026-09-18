<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  The "Aggregated" bucket picker that sits at the end of a chart card's tab row
  (design: usage-analytics-overview.html, ".aggregated-group"). It only reports
  the choice — the owning page turns it into the `granularity` query parameter
  on GET /admin/analytics/timeseries and refetches.

  `options` is the set the current date range can actually be cut into, so a
  bucket that would be meaningless (monthly over a week) or unreadable (hourly
  over a quarter) is offered but disabled rather than silently missing.
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { Granularity } from "../../../api/admin/analytics.js";

  interface Props {
    /** The bucket currently in force — always one of `options`. */
    granularity: Granularity;
    /** Buckets that make sense for the selected range; the rest render disabled. */
    options: Granularity[];
    onChange: (next: Granularity) => void;
    /** Greyed out while a fetch is in flight. */
    disabled?: boolean;
  }

  let { granularity, options, onChange, disabled = false }: Props = $props();

  const ALL: { id: Granularity; labelKey: string }[] = [
    { id: "hour", labelKey: "analytics.filters.hour" },
    { id: "day", labelKey: "analytics.filters.day" },
    { id: "week", labelKey: "analytics.filters.week" },
    { id: "month", labelKey: "analytics.filters.month" },
  ];

  let isOpen = $state(false);
  let wrapEl = $state<HTMLDivElement | null>(null);

  const triggerLabel = $derived(
    $_(ALL.find((o) => o.id === granularity)?.labelKey ?? ALL[1].labelKey),
  );

  function choose(next: Granularity) {
    isOpen = false;
    if (next !== granularity) onChange(next);
  }

  function handleWindowClick(event: MouseEvent) {
    if (!isOpen || !wrapEl) return;
    if (!wrapEl.contains(event.target as Node)) isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
      isOpen = false;
      (wrapEl?.querySelector(".aggregated-trigger") as HTMLElement | null)?.focus();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="aggregated-group">
  <span class="aggregated-label" id="aggregated-label"
    >{$_("analytics.filters.aggregated")}</span
  >
  <div class="aggregated-wrap" bind:this={wrapEl}>
    <button
      type="button"
      class="aggregated-trigger"
      class:aggregated-trigger--open={isOpen}
      {disabled}
      onclick={() => (isOpen = !isOpen)}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-labelledby="aggregated-label"
    >
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
        <rect x="0.5" y="1.5" width="11" height="11.33" rx="1.5" stroke="currentColor" />
        <line x1="0.5" y1="5" x2="11.5" y2="5" stroke="currentColor" />
      </svg>
      <span class="aggregated-trigger__label">{triggerLabel}</span>
      <svg width="8" height="4" viewBox="0 0 8 4" fill="none" aria-hidden="true">
        <path d="M1 1l3 2 3-2" stroke="currentColor" fill="none" />
      </svg>
    </button>

    {#if isOpen}
      <div
        class="aggregated-dropdown"
        role="listbox"
        aria-labelledby="aggregated-label"
      >
        {#each ALL as option (option.id)}
          {@const available = options.includes(option.id)}
          <button
            type="button"
            class="aggregated-item"
            class:aggregated-item--selected={granularity === option.id}
            role="option"
            aria-selected={granularity === option.id}
            disabled={!available}
            title={available ? undefined : $_("analytics.filters.bucketUnavailable")}
            onclick={() => choose(option.id)}
          >
            <span>{$_(option.labelKey)}</span>
            {#if granularity === option.id}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="none" />
                <path d="M4.3 7.2l1.8 1.8 3.6-4" stroke="currentColor" stroke-width="1.2" fill="none" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Transcribed from the design's ".aggregated-*" block. app.css paints every
     bare <button> as a glass pill, so both controls reset that first. */
  .aggregated-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .aggregated-label {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-ink);
    white-space: nowrap;
  }

  .aggregated-wrap {
    position: relative;
  }

  .aggregated-trigger {
    min-width: 124px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    gap: 8px;
    padding: 0 12px;
    align-items: center;
    box-sizing: border-box;
    cursor: pointer;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: box-shadow 120ms ease;
  }

  .aggregated-trigger:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--gx-an-blue-label);
    transform: none;
  }

  .aggregated-trigger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .aggregated-trigger > svg:first-child {
    color: var(--gx-an-blue);
    flex-shrink: 0;
  }

  .aggregated-trigger__label {
    flex-grow: 1;
    font-family: inherit;
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-blue-label-strong);
    white-space: nowrap;
    text-align: start;
  }

  .aggregated-trigger > svg:last-child {
    color: var(--gx-an-chip-fg);
    flex-shrink: 0;
  }

  .aggregated-trigger--open {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-an-blue),
      var(--gx-an-drop-shadow);
  }

  .aggregated-dropdown {
    position: absolute;
    inset-inline-end: 0;
    top: 34px;
    width: 140px;
    border-radius: 12px;
    background: var(--gx-surface);
    box-shadow:
      inset 0 0 0 1px var(--gx-an-ring),
      var(--gx-an-drop-shadow);
    padding: 8px;
    display: flex;
    flex-direction: column;
    z-index: 20;
  }

  .aggregated-item {
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
    box-sizing: border-box;
    font-family: inherit;
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-blue-label);
    cursor: pointer;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .aggregated-item:hover:not(:disabled) {
    background: var(--gx-blue-soft);
    transform: none;
  }

  .aggregated-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .aggregated-item--selected {
    background: var(--gx-blue-soft);
    font-weight: 600;
    color: var(--gx-an-blue);
  }

  .aggregated-item span {
    flex-grow: 1;
    text-align: start;
  }

  .aggregated-item svg {
    flex-shrink: 0;
    color: var(--gx-an-blue);
  }

  .aggregated-trigger:focus-visible,
  .aggregated-item:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }
</style>
