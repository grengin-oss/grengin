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

<article class="skill-card" class:skill-card--inactive={!skill.is_active}>
  <div class="skill-card__top">
    <div
      class="skill-card__avatar"
      class:skill-card__avatar--builtin={skill.is_builtin}
    >
      {#if skill.avatar}
        {skill.avatar}
      {:else if isArtifacts}
        <svg
          width="22"
          height="22"
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
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"></path>
        </svg>
      {/if}
    </div>

    <div class="skill-card__heading">
      <h3 class="skill-card__name">{skill.name}</h3>
      <code class="skill-card__id">{skill.identifier}</code>
    </div>

    <!-- Activation switch -->
    <button
      type="button"
      class="switch"
      class:switch--on={skill.is_active}
      role="switch"
      aria-checked={skill.is_active}
      aria-label={$_("userSkills.card.toggleAria", {
        values: { name: skill.name },
      })}
      disabled={toggling}
      onclick={() => ontoggle?.(skill, !skill.is_active)}
    >
      <span class="switch__thumb"></span>
    </button>
  </div>

  <p class="skill-card__desc">
    {skill.description || $_("userSkills.card.noDescription")}
  </p>

  <div class="skill-card__badges">
    {#if skill.is_builtin}
      <span class="badge badge--builtin">{$_("userSkills.badges.builtin")}</span
      >
    {/if}
    {#if isArtifacts}
      <span class="badge badge--artifacts"
        >{$_("userSkills.badges.artifacts")}</span
      >
    {/if}
    {#if skill.instructions}
      <span class="badge">{$_("userSkills.badges.instructions")}</span>
    {/if}
    {#if knowledgeCount > 0}
      <span class="badge">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          ></path><path d="M14 2v6h6"></path>
        </svg>
        {$_("userSkills.badges.files", { values: { count: knowledgeCount } })}
      </span>
    {/if}
    {#if skill.tools_config?.web_search}
      <span class="badge">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"
          ></path>
        </svg>
        {$_("userSkills.badges.webSearch")}
      </span>
    {/if}
    {#if toolCount > 0}
      <span class="badge"
        >{$_("userSkills.badges.tools", { values: { count: toolCount } })}</span
      >
    {/if}
  </div>

  <div class="skill-card__actions">
    {#if skill.is_builtin}
      <span class="skill-card__locked">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="4" y="11" width="16" height="10" rx="2"></rect><path
            d="M8 11V7a4 4 0 0 1 8 0v4"
          ></path>
        </svg>
        {$_("userSkills.card.managedByPlatform")}
      </span>
    {:else}
      <button class="link-btn" onclick={() => onedit?.(skill)}>
        {$_("userSkills.card.edit")}
      </button>
      <button
        class="link-btn link-btn--danger"
        onclick={() => ondelete?.(skill)}
      >
        {$_("userSkills.card.delete")}
      </button>
    {/if}
  </div>
</article>

<style>
  .skill-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid var(--gx-category);
    border-radius: var(--radius-lg);
    transition:
      border-color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .skill-card:hover {
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  .skill-card--inactive {
    opacity: 0.62;
  }

  .skill-card__top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .skill-card__avatar {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    line-height: 1;
    border-radius: var(--radius-md);
    background: rgba(99, 102, 241, 0.14);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.22);
  }

  .skill-card__avatar--builtin {
    background: rgba(16, 185, 129, 0.14);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.22);
  }

  .skill-card__heading {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .skill-card__name {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-card__id {
    align-self: flex-start;
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
    font-family: "SF Mono", "Fira Code", monospace;
    color: var(--text-secondary);
    /* Override the global `code` chrome (bg / shadow / large padding) */
    background: rgba(var(--glass-tint), 0.06);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 1px 6px;
    border-radius: 5px;
  }

  .skill-card__desc {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.5em;
  }

  .skill-card__badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px var(--space-sm);
    border-radius: var(--radius-full);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    background: rgba(var(--glass-tint), 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .badge--builtin {
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.24);
  }

  .badge--artifacts {
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.16);
    border-color: rgba(139, 92, 246, 0.28);
  }

  .skill-card__actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: auto;
    padding-top: var(--space-xs);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .skill-card__locked {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .link-btn {
    padding: 0;
    background: none;
    border: none;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--brand, #4079c5);
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .link-btn:hover {
    opacity: 0.75;
  }

  .link-btn--danger {
    color: #f87171;
  }

  /* Switch */
  .switch {
    flex-shrink: 0;
    position: relative;
    width: 38px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.16);
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .switch--on {
    background: var(--brand, #4079c5);
  }

  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .switch--on .switch__thumb {
    transform: translateX(16px);
  }
</style>
