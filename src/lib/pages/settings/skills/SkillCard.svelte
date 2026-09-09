<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { SkillResponse } from "../../../types/skill.js";
  import { isArtifactsSkill } from "../../../types/skill.js";

  interface Props {
    skill: SkillResponse;
    toggling?: boolean;
    onedit?: (skill: SkillResponse) => void;
    ondelete?: (skill: SkillResponse) => void;
    ontoggle?: (skill: SkillResponse, active: boolean) => void;
  }

  let { skill, toggling = false, onedit, ondelete, ontoggle }: Props = $props();

  const toolCount = $derived(skill.tools_config?.mcp_server_ids?.length ?? 0);
  const knowledgeCount = $derived(skill.knowledge_files?.length ?? 0);
  const isArtifacts = $derived(isArtifactsSkill(skill));
</script>

<!-- ".skill-card" — user-settings.html -->
<article class="skill-card" class:skill-card--inactive={!skill.is_active}>
  <div class="skill-card-top">
    <div class="skill-card-header">
      <div class="skill-icon-block">
        <span class="emoji-circle" aria-hidden="true">
          {#if skill.avatar}
            {skill.avatar}
          {:else if isArtifacts}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M3 9h18M9 21V9"></path>
            </svg>
          {:else}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"
              ></path>
            </svg>
          {/if}
        </span>
        <div class="skill-title-group">
          <span class="skill-name" title={skill.name}>{skill.name}</span>
          <span class="skill-slug">{skill.identifier}</span>
        </div>
      </div>

      <!-- ".toggle-pill" — the activation switch -->
      <button
        type="button"
        class="toggle-pill"
        class:toggle-pill--off={!skill.is_active}
        role="switch"
        aria-checked={skill.is_active}
        aria-label={$_("userSkills.card.toggleAria", {
          values: { name: skill.name },
        })}
        disabled={toggling}
        onclick={() => ontoggle?.(skill, !skill.is_active)}
      >
        <span class="toggle-knob"></span>
      </button>
    </div>

    <span class="skill-desc">
      {skill.description || $_("userSkills.card.noDescription")}
    </span>

    <div class="skill-tags">
      {#if skill.is_builtin}
        <span class="skill-tag skill-tag--builtin"
          >{$_("userSkills.badges.builtin")}</span
        >
      {/if}
      {#if isArtifacts}
        <span class="skill-tag skill-tag--builtin"
          >{$_("userSkills.badges.artifacts")}</span
        >
      {/if}
      {#if skill.instructions}
        <span class="skill-tag">{$_("userSkills.badges.instructions")}</span>
      {/if}
      {#if knowledgeCount > 0}
        <span class="skill-tag">
          {$_("userSkills.badges.files", { values: { count: knowledgeCount } })}
        </span>
      {/if}
      {#if skill.tools_config?.web_search}
        <span class="skill-tag">{$_("userSkills.badges.webSearch")}</span>
      {/if}
      {#if toolCount > 0}
        <span class="skill-tag">
          {$_("userSkills.badges.tools", { values: { count: toolCount } })}
        </span>
      {/if}
    </div>
  </div>

  <!-- ".skill-card-footer" -->
  <div class="skill-card-footer">
    {#if skill.is_builtin}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2.75"
          y="6.1"
          width="8.5"
          height="6.15"
          rx="1"
          stroke="currentColor"
          stroke-width="1.1"
          fill="none"
        />
        <path
          d="M4.65 6.1V4.15a2.35 2.35 0 0 1 4.7 0V6.1"
          stroke="currentColor"
          stroke-width="1.1"
          fill="none"
        />
      </svg>
      <span>{$_("userSkills.card.managedByPlatform")}</span>
    {:else}
      <button class="footer-btn" type="button" onclick={() => onedit?.(skill)}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8.5 1.5 11 4 4 11H1.5V8.5z"
            stroke="currentColor"
            stroke-width="1.1"
            fill="none"
            stroke-linejoin="round"
          />
        </svg>
        {$_("userSkills.card.edit")}
      </button>
      <button
        class="footer-btn footer-btn--danger"
        type="button"
        onclick={() => ondelete?.(skill)}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l.5-7.5"
            stroke="currentColor"
            stroke-width="1.1"
            fill="none"
          />
        </svg>
        {$_("userSkills.card.delete")}
      </button>
    {/if}
  </div>
</article>

<style>
  /* ===== ".skill-card" from user-settings.html. Colours come from the --us-*
     block UserSettings.svelte declares on ".us-page". ===== */

  /* app.css paints every bare <button> as a glass pill; the two controls here
     are flat. Scoped to this component so its class rules out-rank the reset. */
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

  .skill-card {
    /* 450px in the mockup; shrinks rather than overflowing a narrow panel. */
    width: 450px;
    max-width: 100%;
    border-radius: 12px;
    background: var(--us-surface);
    box-shadow:
      inset 0 0 0 1px var(--us-border),
      var(--us-card-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(229, 231, 235, 1);
  }

  .skill-card--inactive {
    opacity: 0.62;
  }

  .skill-card-top {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    flex-grow: 1;
  }

  .skill-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .skill-icon-block {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .emoji-circle {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--us-mint);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
    color: var(--us-mint-fg);
    flex-shrink: 0;
  }

  .emoji-circle svg {
    display: block;
  }

  .skill-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .skill-name {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--us-title);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-slug {
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.3;
    color: var(--us-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---------------- ".toggle-pill" ---------------- */
  .toggle-pill {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: var(--us-cta);
    display: flex;
    padding: 2px;
    justify-content: flex-end;
    align-items: center;
    flex-shrink: 0;
    transition:
      background-color 140ms ease,
      justify-content 140ms ease;
  }

  .toggle-pill--off {
    background: var(--gx-org-toggle-off);
    justify-content: flex-start;
  }

  .toggle-pill:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toggle-knob {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: var(--us-card-shadow);
  }

  .skill-desc {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-body);
  }

  /* ---------------- ".builtin-tag" ---------------- */
  .skill-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .skill-tag {
    border-radius: 6px;
    background: var(--us-track);
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: var(--us-body);
    text-transform: uppercase;
    width: fit-content;
  }

  .skill-tag--builtin {
    background: var(--us-mint);
    color: var(--us-mint-fg);
  }

  /* ---------------- ".skill-card-footer" ---------------- */
  .skill-card-footer {
    background: var(--us-field-bg);
    border-top: 1px solid var(--us-border);
    display: flex;
    gap: 6px;
    padding: 12px 20px;
    align-items: center;
  }

  .skill-card-footer > svg {
    display: block;
    color: var(--us-muted);
    flex-shrink: 0;
  }

  .skill-card-footer > span {
    font-size: 12px;
    font-weight: 500;
    color: var(--us-muted);
  }

  .footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--us-accent);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .footer-btn:hover {
    background: var(--us-tint);
  }

  .footer-btn svg {
    display: block;
    flex-shrink: 0;
  }

  .footer-btn--danger {
    color: var(--us-danger);
  }

  .footer-btn--danger:hover {
    background: var(--us-danger-bg);
  }
</style>
