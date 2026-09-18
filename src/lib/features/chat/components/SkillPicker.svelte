<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  Skill rows for the composer's Tools menu (design: chat-empty-state.html,
  ".tools-skills-box"). This owns the real skill wiring:
    - the catalog comes from GET /skills (active only)
    - with a conversation, toggling calls POST/DELETE /conversations/{id}/skills
    - before the conversation exists, choices are staged in `pendingSkillIds`
      and linked by Chat.svelte on first send
  The component renders rows only — the panel, section label and surrounding
  chrome belong to MessageInput's tools menu.

  The built-in "artifacts" skill is excluded from these rows — see the note on
  `loadAvailable` below.
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    listSkills,
    listConversationSkills,
    linkSkill,
    unlinkSkill,
  } from "../../../api/skills.js";
  import {
    isArtifactsSkill,
    type SkillResponse,
  } from "../../../types/skill.js";
  import { ApiError } from "../../../api/client.js";
  import { toast } from "../../../components/Toaster.svelte";

  interface Props {
    /** Active conversation id, or null for a not-yet-created chat. */
    conversationId?: string | null;
    /** Skills selected before the conversation exists; linked on first send. Bindable. */
    pendingSkillIds?: string[];
    /** How many skills are currently on — read by the Tools chip's badge. Bindable. */
    selectedCount?: number;
  }

  let {
    conversationId = null,
    pendingSkillIds = $bindable([]),
    selectedCount = $bindable(0),
  }: Props = $props();

  let loading = $state(false);
  let available = $state<SkillResponse[]>([]);
  let linkedIds = $state<string[]>([]);
  let busyId = $state<string | null>(null);

  // Which ids are currently selected depends on whether the conversation exists yet.
  const selectedIds = $derived(conversationId ? linkedIds : pendingSkillIds);

  // Publish the count upward so the Tools chip can badge it.
  $effect(() => {
    selectedCount = selectedIds.length;
  });

  /*
   * The built-in "artifacts" skill is deliberately absent from this menu: it
   * gates platform behaviour rather than being a per-conversation choice, and
   * offering it beside ordinary skills confused users. It is filtered out of
   * BOTH lists below — the catalog (so no row renders) and the conversation's
   * linked set (so the Tools chip does not badge a skill with no visible row
   * on a conversation that already has it linked server-side).
   */
  async function loadAvailable() {
    loading = true;
    try {
      const res = await listSkills({ is_active: true });
      available = (res.skills ?? []).filter((skill) => !isArtifactsSkill(skill));
    } catch {
      available = [];
    } finally {
      loading = false;
    }
  }

  async function loadLinked() {
    if (!conversationId) {
      linkedIds = [];
      return;
    }
    try {
      const links = await listConversationSkills(conversationId);
      linkedIds = links
        .filter((l) => !isArtifactsSkill(l.skill))
        .map((l) => l.skill.id);
    } catch {
      linkedIds = [];
    }
  }

  // Reload the linked set whenever the conversation changes.
  let lastConversationId = $state<string | null>(null);
  $effect(() => {
    if (conversationId !== lastConversationId) {
      lastConversationId = conversationId ?? null;
      void loadLinked();
    }
  });

  onMount(loadAvailable);

  async function toggle(skill: SkillResponse) {
    const id = skill.id;
    const isSelected = selectedIds.includes(id);

    // No conversation yet — just stage the selection.
    if (!conversationId) {
      pendingSkillIds = isSelected
        ? pendingSkillIds.filter((s) => s !== id)
        : [...pendingSkillIds, id];
      return;
    }

    busyId = id;
    try {
      if (isSelected) {
        await unlinkSkill(conversationId, id);
        linkedIds = linkedIds.filter((s) => s !== id);
      } else {
        await linkSkill(conversationId, id);
        linkedIds = [...linkedIds, id];
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("chat.skills.updateFailed")
          : $_("chat.skills.updateFailed");
      toast.error(message);
    } finally {
      busyId = null;
    }
  }
</script>

{#if loading}
  <span class="cx-state">{$_("chat.skills.loading")}</span>
{:else if available.length === 0}
  <span class="cx-state">{$_("chat.skills.empty")}</span>
{:else}
  {#each available as skill (skill.id)}
    {@const on = selectedIds.includes(skill.id)}
    <div class="tools-skill-row">
      <span class="skill-emoji" aria-hidden="true">{skill.avatar ?? "✨"}</span>
      <span class="skill-text">
        <span class="skill-title">{skill.name}</span>
        {#if skill.description}
          <span class="skill-sub" title={skill.description}
            >{skill.description}</span
          >
        {/if}
      </span>
      <button
        type="button"
        class="toggle"
        class:toggle--on={on}
        disabled={busyId === skill.id}
        aria-pressed={on}
        aria-label={skill.name}
        onclick={(e) => {
          e.stopPropagation();
          void toggle(skill);
        }}
      ></button>
    </div>
  {/each}
{/if}

<style>
  /* Row geometry, type and the pill toggle are transcribed from the design's
     ".tools-skill-row" / ".toggle". The panel around them lives in
     MessageInput.svelte. */
  .cx-state {
    font-family: var(--gx-font);
    font-size: 12px;
    color: var(--gx-cx-sub);
    padding: 2px 0;
  }

  .tools-skill-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .skill-emoji {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--gx-cx-tag-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .skill-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .skill-title {
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-cx-ink);
  }

  .skill-sub {
    font-family: var(--gx-font);
    font-size: 11px;
    color: var(--gx-cx-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 36x20 track, 16px thumb — app.css's global button rule would otherwise
     add padding, a blur and centering, so all three are reset here. */
  .toggle {
    width: 36px;
    height: 20px;
    min-width: 36px;
    border-radius: 10px;
    border: none;
    background: var(--gx-cx-toggle-off);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 2px;
    box-sizing: border-box;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .toggle::after {
    content: "";
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
  }

  .toggle--on {
    background: var(--gx-cx-toggle-on);
    justify-content: flex-end;
  }

  .toggle:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>
