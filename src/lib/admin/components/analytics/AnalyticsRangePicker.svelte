<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";

  export type DatePreset = "last7" | "last30" | "last90" | "thisMonth" | "custom";

  interface Props {
    preset: DatePreset;
    startDate: string;
    endDate: string;
    onPresetChange: (preset: DatePreset) => void;
    onCustomRangeChange: (start: string, end: string) => void;
  }

  let { preset, startDate, endDate, onPresetChange, onCustomRangeChange }: Props = $props();

  let isOpen = $state(false);
  let wrapEl = $state<HTMLDivElement | null>(null);
  /** Which custom field carries the design's focus ring. */
  let activeField = $state<"start" | "end">("end");

  const PRESETS: { id: DatePreset; labelKey: string }[] = [
    { id: "last7", labelKey: "analytics.filters.presets.last7Days" },
    { id: "last30", labelKey: "analytics.filters.presets.last30Days" },
    { id: "last90", labelKey: "analytics.filters.presets.last90Days" },
    { id: "thisMonth", labelKey: "analytics.filters.presets.thisMonth" },
    { id: "custom", labelKey: "analytics.filters.presets.custom" },
  ];

  const triggerLabel = $derived(
    preset === "custom"
      ? `${formatShort(startDate)} – ${formatShort(endDate)}`
      : $_(PRESETS.find((p) => p.id === preset)?.labelKey ?? PRESETS[0].labelKey),
  );

  function formatShort(value: string): string {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
  }

  function choose(next: DatePreset) {
    onPresetChange(next);
    // The custom panel stays open so the two date fields can be edited.
    if (next !== "custom") isOpen = false;
  }

  function handleWindowClick(event: MouseEvent) {
    if (!isOpen || !wrapEl) return;
    if (!wrapEl.contains(event.target as Node)) isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
      isOpen = false;
      (wrapEl?.querySelector(".date-picker") as HTMLElement | null)?.focus();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="date-picker-wrap" bind:this={wrapEl}>
  <button
    type="button"
    class="date-picker"
    class:date-picker--open={isOpen}
    onclick={() => (isOpen = !isOpen)}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-label={$_("analytics.aria.rangePicker")}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="10.5" rx="2" stroke="currentColor" stroke-width="1.4"/>
      <path d="M2 7h12M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    <span class="date-picker__label">{triggerLabel}</span>
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  {#if isOpen}
    <div class="date-dropdown is-open" role="listbox" aria-label={$_("analytics.aria.dateRangeGroup")}>
      {#each PRESETS as option (option.id)}
        <button
          type="button"
          class="date-item"
          class:date-item--selected={preset === option.id}
          role="option"
          aria-selected={preset === option.id}
          onclick={() => choose(option.id)}
        >
          <span>{$_(option.labelKey)}</span>
          {#if preset === option.id}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 6.4L4.6 9L10 3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {/if}
        </button>
      {/each}

      {#if preset === "custom"}
        <div class="date-custom-panel">
          <span class="date-custom-label">{$_("analytics.filters.rangeFields")}</span>
          <div class="date-custom-row">
            <input
              class="date-custom-input"
              class:date-custom-input--active={activeField === "start"}
              type="date"
              value={startDate}
              max={endDate}
              aria-label={$_("analytics.aria.startDate")}
              onfocus={() => (activeField = "start")}
              onchange={(event) =>
                onCustomRangeChange((event.currentTarget as HTMLInputElement).value, endDate)}
            />
            <span class="date-custom-to">{$_("analytics.filters.to")}</span>
            <input
              class="date-custom-input"
              class:date-custom-input--active={activeField === "end"}
              type="date"
              value={endDate}
              min={startDate}
              aria-label={$_("analytics.aria.endDate")}
              onfocus={() => (activeField = "end")}
              onchange={(event) =>
                onCustomRangeChange(startDate, (event.currentTarget as HTMLInputElement).value)}
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .date-picker-wrap {
    position: relative;
    flex-shrink: 0;
    font-family: var(--gx-font);
  }

  /* Design: 157x37, 12px radius, hairline ring; blue calendar + label. */
  .date-picker {
    width: 157px;
    height: 37px;
    border: 0;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    cursor: pointer;
    transition: box-shadow 120ms ease;
  }

  .date-picker > svg:first-child {
    color: var(--gx-an-blue);
    flex-shrink: 0;
  }

  .date-picker__label {
    flex-grow: 1;
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-blue-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: start;
  }

  .date-picker > svg:last-child {
    color: var(--gx-an-chip-fg);
    flex-shrink: 0;
  }

  .date-picker:hover {
    box-shadow: inset 0 0 0 1px var(--gx-an-blue-label);
    transform: none;
  }

  .date-picker--open {
    box-shadow:
      inset 0 0 0 1.5px var(--gx-an-blue),
      var(--gx-an-drop-shadow);
  }

  .date-picker--open .date-picker__label {
    color: var(--gx-an-blue-label-strong);
  }

  .date-dropdown {
    position: absolute;
    inset-inline-end: 0;
    top: 43px;
    width: 220px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      var(--gx-an-drop-shadow);
    padding: 8px;
    display: flex;
    flex-direction: column;
    z-index: 20;
  }

  .date-item {
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
    font-family: inherit;
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-blue-label);
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .date-item span {
    flex-grow: 1;
    text-align: start;
  }

  .date-item svg {
    flex-shrink: 0;
    color: var(--gx-an-blue);
  }

  .date-item:hover {
    background: var(--gx-an-blue-tint-soft);
    transform: none;
  }

  .date-item--selected {
    background: var(--gx-an-blue-tint-soft);
    font-weight: 600;
    color: var(--gx-an-blue);
  }

  .date-custom-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 4px 4px;
    margin-top: 4px;
    border-top: 1px solid var(--gx-an-ring);
  }

  .date-custom-label {
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-ink);
  }

  .date-custom-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .date-custom-input {
    flex-grow: 1;
    min-width: 0;
    width: 100%;
    height: 27px;
    border: 0;
    border-radius: 6px;
    background: var(--gx-an-input-bg);
    box-shadow: none;
    padding: 0 8px;
    font-family: inherit;
    font-weight: 500;
    font-size: 12px;
    color: var(--gx-an-blue-label);
  }

  .date-custom-input--active {
    box-shadow: inset 0 0 0 1px var(--gx-an-blue);
  }

  .date-custom-to {
    font-weight: 500;
    font-size: 12px;
    color: var(--gx-ink);
    flex-shrink: 0;
  }

  .date-picker:focus-visible,
  .date-item:focus-visible,
  .date-custom-input:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }
</style>
