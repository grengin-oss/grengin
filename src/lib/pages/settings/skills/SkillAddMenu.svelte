<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";

  interface Props {
    /** Optional label override for the primary button (defaults to userSkills.createSkill). */
    label?: string;
    onwrite?: () => void;
    onimport?: () => void;
  }

  let { label, onwrite, onimport }: Props = $props();

  let open = $state(false);

  function choose(fn?: () => void) {
    open = false;
    fn?.();
  }
</script>

<div class="add-menu">
  <button
    class="btn btn--primary"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={(e) => { e.stopPropagation(); open = !open; }}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M5 12h14"></path>
    </svg>
    {label ?? $_("userSkills.createSkill")}
    <svg class="add-menu__caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="add-menu__backdrop" onclick={() => (open = false)} role="presentation"></div>
    <div class="add-menu__panel" role="menu">
      <button class="add-menu__item" role="menuitem" onclick={() => choose(onwrite)}>
        <span class="add-menu__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>
          </svg>
        </span>
        <span class="add-menu__title">{$_("userSkills.addMenu.writeTitle")}</span>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <span
          class="add-menu__info"
          role="note"
          tabindex="0"
          aria-label={$_("userSkills.addMenu.writeDesc")}
          data-tip={$_("userSkills.addMenu.writeDesc")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
          </svg>
        </span>
      </button>
      <button class="add-menu__item" role="menuitem" onclick={() => choose(onimport)}>
        <span class="add-menu__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5"></path><path d="M12 3v12"></path>
          </svg>
        </span>
        <span class="add-menu__title">{$_("userSkills.addMenu.importTitle")}</span>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <span
          class="add-menu__info"
          role="note"
          tabindex="0"
          aria-label={$_("userSkills.addMenu.importDesc")}
          data-tip={$_("userSkills.addMenu.importDesc")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>
          </svg>
        </span>
      </button>
    </div>
  {/if}
</div>

<style>
  .add-menu {
    position: relative;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-lg);
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .btn--primary {
    background: var(--brand, #4079c5);
    color: #fff;
  }

  .btn--primary:hover {
    filter: brightness(1.1);
  }

  .add-menu__caret {
    margin-left: 2px;
    opacity: 0.85;
  }

  .add-menu__backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .add-menu__panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 41;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-xs);
    background: var(--bg-primary, #14161c);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    animation: menu-in 0.14s ease;
  }

  .add-menu__item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .add-menu__item:hover {
    background: rgba(var(--glass-tint), 0.08);
  }

  .add-menu__icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-md);
    background: rgba(99, 102, 241, 0.14);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.22);
  }

  .add-menu__title {
    flex: 1;
    min-width: 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Info icon + hover tooltip (replaces the always-visible description) */
  .add-menu__info {
    position: relative;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    color: var(--text-secondary);
    cursor: help;
    outline: none;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .add-menu__info:hover,
  .add-menu__info:focus-visible {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.12);
  }

  .add-menu__info::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 8px);
    right: -4px;
    z-index: 50;
    width: max-content;
    max-width: 220px;
    padding: var(--space-xs) var(--space-sm);
    background: #0b0d12;
    color: var(--text-primary);
    font-size: 0.72rem;
    font-weight: 500;
    line-height: 1.4;
    text-align: left;
    white-space: normal;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-sm);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .add-menu__info:hover::after,
  .add-menu__info:focus-visible::after {
    opacity: 1;
    transform: translateY(0);
  }

  @keyframes menu-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
