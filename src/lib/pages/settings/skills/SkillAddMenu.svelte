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
  <!-- ".new-skill-btn" — opens the two entry points below. -->
  <button
    class="new-skill-btn"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}
  >
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.75v10.5M1.75 7h10.5" stroke="currentColor" stroke-width="1.6" />
    </svg>
    {label ?? $_("userSkills.createSkill")}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="add-menu__backdrop" onclick={() => (open = false)} role="presentation"></div>
    <div class="add-menu__panel" role="menu">
      <button class="add-menu__item" role="menuitem" onclick={() => choose(onwrite)}>
        <span class="add-menu__icon" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>
          </svg>
        </span>
        <span class="add-menu__text">
          <span class="add-menu__title">{$_("userSkills.addMenu.writeTitle")}</span>
          <span class="add-menu__desc">{$_("userSkills.addMenu.writeDesc")}</span>
        </span>
      </button>
      <button class="add-menu__item" role="menuitem" onclick={() => choose(onimport)}>
        <span class="add-menu__icon" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <path d="M17 8l-5-5-5 5"></path>
            <path d="M12 3v12"></path>
          </svg>
        </span>
        <span class="add-menu__text">
          <span class="add-menu__title">{$_("userSkills.addMenu.importTitle")}</span>
          <span class="add-menu__desc">{$_("userSkills.addMenu.importDesc")}</span>
        </span>
      </button>
    </div>
  {/if}
</div>

<style>
  /* ===== ".new-skill-btn" from user-settings.html, plus the dropdown that
     carries its two entry points. Colours come from the --us-* block
     UserSettings.svelte declares on ".us-page". ===== */

  /* app.css paints every bare <button> as a glass pill; these are flat. */
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

  .add-menu {
    position: relative;
    flex-shrink: 0;
  }

  .new-skill-btn {
    height: 37px;
    border-radius: 8px;
    background: var(--us-cta);
    display: flex;
    gap: 8px;
    padding: 0 16px;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .new-skill-btn:hover {
    background: var(--us-cta-hover);
  }

  .new-skill-btn svg {
    display: block;
    flex-shrink: 0;
  }

  .add-menu__backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .add-menu__panel {
    position: absolute;
    top: calc(100% + 8px);
    inset-inline-end: 0;
    z-index: 41;
    width: 320px;
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-menu-shadow);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .add-menu__item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 8px;
    width: 100%;
    white-space: normal;
    transition: background-color 120ms ease;
  }

  .add-menu__item:hover {
    background: var(--us-hover);
  }

  .add-menu__icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--us-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--us-accent);
    flex-shrink: 0;
  }

  .add-menu__icon svg {
    display: block;
  }

  .add-menu__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .add-menu__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--us-title);
  }

  .add-menu__desc {
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-muted);
  }

  /* Same anchoring problem as the analytics range picker: the 320px panel is
     pinned to the trigger's inline-end, which is correct while the "New Skill"
     button sits at the far side of a wide toolbar. On a phone the toolbar
     stacks and the button moves to the inline-start edge, putting 184px of the
     panel off-screen. Anchor to the start edge and let the width shrink with
     the viewport so it also fits a 320px screen. */
  @media (max-width: 560px) {
    .add-menu__panel {
      inset-inline-end: auto;
      inset-inline-start: 0;
      width: min(320px, calc(100vw - 32px));
    }
  }
</style>
