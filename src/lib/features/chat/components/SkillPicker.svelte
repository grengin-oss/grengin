<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { listSkills, listConversationSkills, linkSkill, unlinkSkill } from "../../../api/skills.js";
  import type { SkillResponse } from "../../../types/skill.js";
  import { ApiError } from "../../../api/client.js";
  import { toast } from "../../../components/Toaster.svelte";

  interface Props {
    /** Active conversation id, or null for a not-yet-created chat. */
    conversationId?: string | null;
    /** Skills selected before the conversation exists; linked on first send. Bindable. */
    pendingSkillIds?: string[];
    /** Render the built-in trigger button. Set false to control open externally (e.g. from a menu). */
    showTrigger?: boolean;
    /** Open state — bindable so a parent (like the + menu) can drive it. */
    open?: boolean;
  }

  let {
    conversationId = null,
    pendingSkillIds = $bindable([]),
    showTrigger = true,
    open = $bindable(false),
  }: Props = $props();
  let loading = $state(false);
  let available = $state<SkillResponse[]>([]);
  let linkedIds = $state<string[]>([]);
  let busyId = $state<string | null>(null);

  // Which ids are currently selected depends on whether the conversation exists yet.
  const selectedIds = $derived(conversationId ? linkedIds : pendingSkillIds);
  const selectedCount = $derived(selectedIds.length);

  const triggerLabel = $derived(
    selectedCount > 0
      ? $_("chat.skills.countSelected", { values: { count: selectedCount } })
      : $_("chat.skills.label"),
  );

  async function loadAvailable() {
    loading = true;
    try {
      const res = await listSkills({ is_active: true });
      available = res.skills ?? [];
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
      linkedIds = links.map((l) => l.skill.id);
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

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(".skill-picker")) open = false;
  }

  $effect(() => {
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });
</script>

<div class="skill-picker">
  {#if showTrigger}
    <button
      type="button"
      class="skill-trigger"
      class:active={selectedCount > 0}
      onclick={(e) => {
        e.stopPropagation();
        open = !open;
      }}
      title={$_("chat.skills.tooltip")}
      aria-label={$_("chat.skills.tooltip")}
      aria-expanded={open}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"></path>
      </svg>
      <span class="skill-trigger__label">{triggerLabel}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chev" class:open>
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
  {/if}

  {#if open}
    <div class="skill-menu">
      <div class="skill-menu__head">
        <span>{$_("chat.skills.menuTitle")}</span>
      </div>

      {#if loading}
        <div class="skill-menu__state">{$_("chat.skills.loading")}</div>
      {:else if available.length === 0}
        <div class="skill-menu__state">{$_("chat.skills.empty")}</div>
      {:else}
        <div class="skill-list">
          {#each available as skill (skill.id)}
            {@const on = selectedIds.includes(skill.id)}
            <button
              type="button"
              class="skill-item"
              class:selected={on}
              disabled={busyId === skill.id}
              onclick={() => toggle(skill)}
            >
              <span class="skill-item__avatar">{skill.avatar ?? "✨"}</span>
              <span class="skill-item__meta">
                <span class="skill-item__name">
                  {skill.name}
                  {#if skill.is_builtin}
                    <span class="skill-item__tag">{$_("chat.skills.builtin")}</span>
                  {/if}
                </span>
                {#if skill.description}
                  <span class="skill-item__desc">{skill.description}</span>
                {/if}
              </span>
              <span class="skill-switch" class:on>
                <span class="skill-switch__thumb"></span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .skill-picker {
    position: relative;
    display: inline-flex;
  }

  .skill-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-full, 999px);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .skill-trigger:hover {
    color: var(--text-primary);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .skill-trigger.active {
    color: #c4b5fd;
    border-color: rgba(139, 92, 246, 0.4);
    background: rgba(139, 92, 246, 0.12);
  }

  .skill-trigger__label {
    white-space: nowrap;
  }

  .chev {
    transition: transform 0.15s ease;
  }
  .chev.open {
    transform: rotate(180deg);
  }

  .skill-menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 320px;
    max-height: 360px;
    overflow-y: auto;
    background: var(--bg-primary, #14161c);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    z-index: 50;
    padding: 6px;
  }

  .skill-menu__head {
    padding: 8px 10px 6px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
  }

  .skill-menu__state {
    padding: 16px 10px;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .skill-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .skill-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .skill-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .skill-item:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .skill-item__avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }

  .skill-item__meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .skill-item__name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .skill-item__tag {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 999px;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.16);
  }

  .skill-item__desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-switch {
    flex-shrink: 0;
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    transition: background 0.15s ease;
  }

  .skill-switch.on {
    background: var(--brand, #4079c5);
  }

  .skill-switch__thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }

  .skill-switch.on .skill-switch__thumb {
    transform: translateX(14px);
  }
</style>
