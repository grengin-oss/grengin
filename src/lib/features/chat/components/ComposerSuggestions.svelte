<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  Inline suggestion popover for the composer's "/" command and "@" mention
  menus. Purely presentational: the composer owns trigger detection, the item
  list and keyboard navigation (Arrow/Enter/Tab/Esc), and passes the active
  index down. This renders rows and reports hover/click back up.
-->

<script lang="ts">
  import type { ComposerSuggestion } from "../composerTriggers";

  interface Props {
    open: boolean;
    items: ComposerSuggestion[];
    activeIndex: number;
    /** Section label, e.g. "Commands" or "Mentions". */
    label: string;
    /** Shown when the query matches nothing. */
    emptyLabel: string;
    onhover: (index: number) => void;
    onselect: (item: ComposerSuggestion) => void;
  }

  let { open, items, activeIndex, label, emptyLabel, onhover, onselect }: Props =
    $props();
</script>

{#if open}
  <div class="cs-popover" role="listbox" aria-label={label}>
    <div class="cs-head">{label}</div>
    {#if items.length === 0}
      <div class="cs-empty" role="status">{emptyLabel}</div>
    {:else}
      {#each items as item, i (item.id)}
        <button
          type="button"
          class="cs-row"
          class:is-active={i === activeIndex}
          role="option"
          aria-selected={i === activeIndex}
          onmousemove={() => onhover(i)}
          onmousedown={(e) => {
            // Keep the textarea focused — mousedown steals focus otherwise.
            e.preventDefault();
            onselect(item);
          }}
        >
          <span class="cs-icon" aria-hidden="true">{item.icon ?? "/"}</span>
          <span class="cs-text">
            <span class="cs-title">{item.title}</span>
            {#if item.subtitle}
              <span class="cs-sub" title={item.subtitle}>{item.subtitle}</span>
            {/if}
          </span>
          {#if item.selected !== undefined}
            <span
              class="cs-state"
              class:cs-state--on={item.selected}
              aria-hidden="true"
            ></span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
{/if}

<style>
  /* Anchored just above the composer card by the parent's relative wrapper. */
  .cs-popover {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    z-index: 60;
    width: min(420px, 100%);
    max-height: 280px;
    overflow-y: auto;
    padding: 6px;
    border-radius: 12px;
    background: var(--gx-cx-panel, var(--gx-surface, #fff));
    border: 1px solid var(--gx-cx-border, rgba(0, 0, 0, 0.08));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  }

  .cs-head {
    font-family: var(--gx-font);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--gx-cx-sub);
    padding: 4px 8px;
  }

  .cs-empty {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
    padding: 8px;
  }

  .cs-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .cs-row.is-active {
    background: var(--gx-cx-tag-bg, rgba(0, 0, 0, 0.05));
  }

  .cs-icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 6px;
    background: var(--gx-cx-tag-bg, rgba(0, 0, 0, 0.05));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: var(--gx-cx-ink);
  }

  .cs-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex-grow: 1;
  }

  .cs-title {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-cx-ink);
  }

  .cs-sub {
    font-family: var(--gx-font);
    font-size: 11px;
    color: var(--gx-cx-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A small on/off dot for toggle rows (skills, MCP servers). */
  .cs-state {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--gx-cx-toggle-off, rgba(0, 0, 0, 0.2));
  }

  .cs-state--on {
    background: var(--gx-cx-toggle-on, #2bb673);
  }
</style>
