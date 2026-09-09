<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "../../admin/components/LoadingSpinner.svelte";
  import Modal from "../../admin/components/Modal.svelte";
  import SkillCard from "./skills/SkillCard.svelte";
  import SkillEditor from "./skills/SkillEditor.svelte";
  import SkillImportModal from "./skills/SkillImportModal.svelte";
  import SkillAddMenu from "./skills/SkillAddMenu.svelte";
  import {
    listMySkills,
    listSkills,
    deleteMySkill,
    updateMySkill,
  } from "../../api/skills.js";
  import type { SkillResponse } from "../../types/skill.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";

  type Filter = "all" | "mine" | "builtin";

  let loading = $state(true);
  let mySkills = $state<SkillResponse[]>([]);
  let catalogSkills = $state<SkillResponse[]>([]);

  let filter = $state<Filter>("all");
  let search = $state("");

  let editorOpen = $state(false);
  let editingSkill = $state<SkillResponse | null>(null);

  // "New skill" split menu — two entry points: write in-app vs. import a file.
  let importOpen = $state(false);

  let deleteTarget = $state<SkillResponse | null>(null);
  let deleting = $state(false);
  let togglingId = $state<string | null>(null);

  // Built-in skills come from the catalog; user skills come from /me/skills.
  // De-duplicate by id (a user skill may also appear in the catalog).
  const allSkills = $derived.by(() => {
    const map = new Map<string, SkillResponse>();
    for (const s of catalogSkills) map.set(s.id, s);
    for (const s of mySkills) map.set(s.id, s); // user copy wins (has latest state)
    return [...map.values()];
  });

  const builtinCount = $derived(allSkills.filter((s) => s.is_builtin).length);

  const visibleSkills = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return allSkills
      .filter((s) => {
        if (filter === "mine" && s.is_builtin) return false;
        if (filter === "builtin" && !s.is_builtin) return false;
        if (q) {
          const hay =
            `${s.name} ${s.description ?? ""} ${s.identifier}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Built-in first, then alphabetical.
        if (a.is_builtin !== b.is_builtin) return a.is_builtin ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  });

  // The design splits the grid into a "Built-in" and a "My Skills" section,
  // each with its own count badge.
  const visibleBuiltin = $derived(visibleSkills.filter((s) => s.is_builtin));
  const visibleMine = $derived(visibleSkills.filter((s) => !s.is_builtin));

  const searching = $derived(search.trim().length > 0);
  const showBuiltinSection = $derived(
    filter !== "mine" && visibleBuiltin.length > 0,
  );
  const showMineSection = $derived(filter !== "builtin");
  // Only offer the two "get started" placeholders when nothing is filtered out —
  // with an active search an empty section means "no matches", not "none yet".
  const showPlaceholders = $derived(visibleMine.length === 0 && !searching);

  const FILTERS: { id: Filter; label: string }[] = $derived([
    { id: "all", label: $_("userSkills.filters.all") },
    { id: "mine", label: $_("userSkills.filters.mine") },
    { id: "builtin", label: $_("userSkills.filters.builtin") },
  ]);

  async function loadSkills() {
    loading = true;
    try {
      const [mine, catalog] = await Promise.all([
        listMySkills().catch(() => ({
          skills: [],
          total: 0,
          limit: 0,
          offset: 0,
        })),
        listSkills().catch(() => ({
          skills: [],
          total: 0,
          limit: 0,
          offset: 0,
        })),
      ]);
      mySkills = mine.skills ?? [];
      catalogSkills = catalog.skills ?? [];
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userSkills.messages.loadFailed")
          : $_("userSkills.messages.loadFailed");
      toast.error(message);
    } finally {
      loading = false;
    }
  }

  function openWrite() {
    editingSkill = null;
    editorOpen = true;
  }

  function openImport() {
    importOpen = true;
  }

  function openEdit(skill: SkillResponse) {
    editingSkill = skill;
    editorOpen = true;
  }

  function upsertSkill(saved: SkillResponse) {
    const idx = mySkills.findIndex((s) => s.id === saved.id);
    if (idx >= 0) mySkills[idx] = saved;
    else mySkills = [saved, ...mySkills];
  }

  function handleSaved(saved: SkillResponse) {
    editorOpen = false;
    editingSkill = null;
    upsertSkill(saved);
  }

  function handleImported(saved: SkillResponse) {
    importOpen = false;
    upsertSkill(saved);
  }

  async function handleToggle(skill: SkillResponse, active: boolean) {
    if (skill.is_builtin) {
      // Built-ins are read-only here — nudge the user instead of silently failing.
      toast.error($_("userSkills.messages.builtinReadOnly"));
      return;
    }
    togglingId = skill.id;
    try {
      const updated = await updateMySkill(skill.id, { is_active: active });
      const idx = mySkills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) mySkills[idx] = updated;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userSkills.messages.toggleFailed")
          : $_("userSkills.messages.toggleFailed");
      toast.error(message);
    } finally {
      togglingId = null;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await deleteMySkill(deleteTarget.id);
      mySkills = mySkills.filter((s) => s.id !== deleteTarget!.id);
      toast.success($_("userSkills.messages.deleted"));
      deleteTarget = null;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.description || $_("userSkills.messages.deleteFailed")
          : $_("userSkills.messages.deleteFailed");
      toast.error(message);
    } finally {
      deleting = false;
    }
  }

  onMount(loadSkills);
</script>

<div class="skills-panel">
  <!-- ".toolbar" -->
  <div class="toolbar">
    <div class="left-controls">
      <!-- ".filter-segment" -->
      <div
        class="filter-segment"
        role="tablist"
        aria-label={$_("userSkills.filters.all")}
      >
        {#each FILTERS as f (f.id)}
          <button
            class="seg-btn"
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onclick={() => (filter = f.id)}
          >
            {f.label}
          </button>
        {/each}
      </div>

      <!-- ".search-input" -->
      <div class="search-input">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r="5"
            stroke="currentColor"
            stroke-width="1.3"
          />
          <path d="m13 13-2.3-2.3" stroke="currentColor" stroke-width="1.3" />
        </svg>
        <input
          type="text"
          bind:value={search}
          placeholder={$_("userSkills.searchPlaceholder")}
          aria-label={$_("userSkills.searchPlaceholder")}
        />
      </div>
    </div>

    <SkillAddMenu onwrite={openWrite} onimport={openImport} />
  </div>

  {#if loading}
    <LoadingSpinner size="md" text={$_("userSkills.loading")} />
  {:else}
    <!-- ".settings-section" — Built-in -->
    {#if showBuiltinSection}
      <section class="settings-section">
        <div class="section-title-row">
          <span class="section-title">{$_("userSkills.filters.builtin")}</span>
          <span class="count-badge">{visibleBuiltin.length}</span>
        </div>

        <!-- ".builtin-banner" -->
        <div class="builtin-banner">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="9"
              cy="9"
              r="7.2"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="M9 8.1v3.9M9 5.6v.01"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          <div class="builtin-banner-text">
            <span class="builtin-banner-title"
              >{$_("userSkills.banner.title")}</span
            >
            <span class="builtin-banner-desc"
              >{$_("userSkills.banner.body")}</span
            >
          </div>
        </div>

        <div class="skill-grid">
          {#each visibleBuiltin as skill (skill.id)}
            <SkillCard
              {skill}
              toggling={togglingId === skill.id}
              onedit={openEdit}
              ondelete={(s) => (deleteTarget = s)}
              ontoggle={handleToggle}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- ".settings-section" — My Skills -->
    {#if showMineSection}
      <section class="settings-section">
        <div class="section-title-row">
          <span class="section-title">{$_("userSkills.filters.mine")}</span>
          <span class="count-badge">{visibleMine.length}</span>
        </div>

        {#if visibleMine.length > 0}
          <div class="skill-grid">
            {#each visibleMine as skill (skill.id)}
              <SkillCard
                {skill}
                toggling={togglingId === skill.id}
                onedit={openEdit}
                ondelete={(s) => (deleteTarget = s)}
                ontoggle={handleToggle}
              />
            {/each}
          </div>
        {:else if showPlaceholders}
          <!-- ".placeholder-grid" — the two entry points for a first skill. -->
          <div class="placeholder-grid">
            <button class="placeholder-card" type="button" onclick={openWrite}>
              <span class="placeholder-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1.75v12.5M1.75 8h12.5"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                </svg>
              </span>
              <span class="placeholder-title"
                >{$_("userSkills.addMenu.writeTitle")}</span
              >
              <span class="placeholder-desc"
                >{$_("userSkills.addMenu.writeDesc")}</span
              >
            </button>
            <button class="placeholder-card" type="button" onclick={openImport}>
              <span class="placeholder-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1.75v9M4.5 7.25 8 10.75l3.5-3.5M2.25 12.75h11.5"
                    stroke="currentColor"
                    stroke-width="1.4"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span class="placeholder-title"
                >{$_("userSkills.addMenu.importTitle")}</span
              >
              <span class="placeholder-desc"
                >{$_("userSkills.addMenu.importDesc")}</span
              >
            </button>
          </div>
        {:else}
          <p class="empty-hint">{$_("userSkills.empty.body")}</p>
        {/if}
      </section>
    {/if}

    {#if !showBuiltinSection && !showMineSection}
      <p class="empty-hint">
        {builtinCount === 0
          ? $_("userSkills.empty.title")
          : $_("userSkills.empty.body")}
      </p>
    {/if}
  {/if}
</div>

<SkillEditor
  open={editorOpen}
  scope="user"
  skill={editingSkill}
  onclose={() => (editorOpen = false)}
  onsaved={handleSaved}
/>

<SkillImportModal
  open={importOpen}
  scope="user"
  existingSkills={mySkills}
  onclose={() => (importOpen = false)}
  onimported={handleImported}
/>

<Modal
  isOpen={!!deleteTarget}
  title={$_("userSkills.delete.title")}
  onclose={() => (deleteTarget = null)}
>
  <div class="delete-body">
    <p class="delete-message">
      {$_("userSkills.delete.message", {
        values: { name: deleteTarget?.name ?? "" },
      })}
    </p>
    <div class="delete-actions">
      <button
        class="btn btn--ghost"
        onclick={() => (deleteTarget = null)}
        disabled={deleting}
      >
        {$_("userSkills.delete.cancel")}
      </button>
      <button
        class="btn btn--danger"
        onclick={confirmDelete}
        disabled={deleting}
      >
        {#if deleting}
          <span class="btn-spinner"></span>
          {$_("userSkills.delete.deleting")}
        {:else}
          {$_("userSkills.delete.confirm")}
        {/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  /* ===== user-settings.html, Skills panel. Colours come from the --us-* block
     UserSettings.svelte declares on ".us-page"; this file only lays out. ===== */

  /* app.css paints every bare control as a glass pill; every control here is
     flat. The reset stays scoped to this component so its own class rules keep
     out-ranking it. */
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

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--us-cta);
    outline-offset: 2px;
  }

  input {
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    font-family: var(--gx-font);
    color: inherit;
    transition: none;
  }

  input:focus {
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .skills-panel {
    display: flex;
    flex-direction: column;
    gap: 32px;
    align-self: stretch;
  }

  /* ---------------- ".toolbar" ---------------- */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .left-controls {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* ---------------- ".filter-segment" ---------------- */
  .filter-segment {
    border-radius: 8px;
    background: var(--us-track);
    display: flex;
    gap: 2px;
    padding: 3px;
    flex-shrink: 0;
  }

  .seg-btn {
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--us-body);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .seg-btn[aria-selected="true"] {
    background: var(--us-surface);
    box-shadow: var(--us-card-shadow);
    color: var(--us-tab-active);
  }

  /* ---------------- ".search-input" ---------------- */
  .search-input {
    width: 240px;
    height: 37px;
    border-radius: 8px;
    background: var(--us-surface);
    box-shadow: inset 0 0 0 1px var(--us-border);
    display: flex;
    gap: 8px;
    padding: 0 14px;
    align-items: center;
  }

  .search-input:focus-within {
    box-shadow: inset 0 0 0 1px var(--us-cta);
  }

  .search-input svg {
    display: block;
    color: var(--us-muted);
    flex-shrink: 0;
  }

  .search-input input {
    font-size: 14px;
    line-height: 1.2;
    flex-grow: 1;
    min-width: 0;
    color: var(--us-title);
  }

  .search-input input::placeholder {
    color: var(--us-muted);
    opacity: 1;
  }

  /* ---------------- ".settings-section" ---------------- */
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
  }

  .section-title-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--us-title);
  }

  .count-badge {
    border-radius: 10px;
    background: var(--us-track);
    padding: 2px 6px;
    font-family: var(--us-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--us-body);
  }

  /* ---------------- ".builtin-banner" ---------------- */
  .builtin-banner {
    /* "border-radius: 0 8px 8px 0" + a 3px accent edge, logical so the edge
       moves to the right under dir="rtl". */
    border-radius: 8px;
    border-start-start-radius: 0;
    border-end-start-radius: 0;
    background: var(--us-ok-tint);
    border-inline-start: 3px solid var(--us-ok);
    display: flex;
    gap: 12px;
    padding: 16px;
  }

  .builtin-banner svg {
    display: block;
    color: var(--us-ok);
    flex-shrink: 0;
  }

  .builtin-banner-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .builtin-banner-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--us-ok);
  }

  .builtin-banner-desc {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--us-ok);
  }

  /* ---------------- ".skill-card" grid ---------------- */
  /* Cards are 450px in the mockup; they wrap once the panel is wider. */
  .skill-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-self: stretch;
  }

  /* ---------------- ".placeholder-grid" ---------------- */
  .placeholder-grid {
    display: flex;
    gap: 20px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .placeholder-card {
    flex: 1 1 280px;
    border-radius: 12px;
    background: var(--us-field-bg);
    outline: 1.5px dashed var(--us-border);
    outline-offset: -1.5px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
    justify-content: center;
    align-items: center;
    text-align: center;
    white-space: normal;
    transition:
      background-color 120ms ease,
      outline-color 120ms ease;
  }

  .placeholder-card:hover {
    background: var(--us-hover);
    outline-color: var(--us-cta);
  }

  .placeholder-icon {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--us-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--us-accent);
    flex-shrink: 0;
  }

  .placeholder-icon svg {
    display: block;
  }

  .placeholder-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--us-title);
  }

  .placeholder-desc {
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--us-muted);
  }

  .empty-hint {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--us-muted);
    max-width: 630px;
  }

  /* ---------------- delete dialog (app dialog styling) ---------------- */
  .delete-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .delete-message {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
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

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn--ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-secondary);
  }

  .btn--ghost:hover:not(:disabled) {
    background: rgba(var(--glass-tint), 0.05);
    color: var(--text-primary);
  }

  .btn--danger {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-spinner {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: btn-spin 0.7s linear infinite;
    margin-inline-end: var(--space-xs);
  }

  @keyframes btn-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .toolbar {
      align-items: stretch;
    }

    .search-input {
      width: 100%;
    }
  }
</style>
