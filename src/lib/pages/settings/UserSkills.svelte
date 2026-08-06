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
  import { listMySkills, listSkills, deleteMySkill, updateMySkill } from "../../api/skills.js";
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
          const hay = `${s.name} ${s.description ?? ""} ${s.identifier}`.toLowerCase();
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

  const FILTERS: { id: Filter; label: string }[] = $derived([
    { id: "all", label: $_("userSkills.filters.all") },
    { id: "mine", label: $_("userSkills.filters.mine") },
    { id: "builtin", label: $_("userSkills.filters.builtin") },
  ]);

  async function loadSkills() {
    loading = true;
    try {
      const [mine, catalog] = await Promise.all([
        listMySkills().catch(() => ({ skills: [], total: 0, limit: 0, offset: 0 })),
        listSkills().catch(() => ({ skills: [], total: 0, limit: 0, offset: 0 })),
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

<div class="skills-page">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar__left">
      <div class="segmented" role="tablist">
        {#each FILTERS as f (f.id)}
          <button
            class="segment"
            class:segment--active={filter === f.id}
            role="tab"
            aria-selected={filter === f.id}
            onclick={() => (filter = f.id)}
          >
            {f.label}
          </button>
        {/each}
      </div>

      <div class="search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path>
        </svg>
        <input
          class="search__input"
          type="text"
          bind:value={search}
          placeholder={$_("userSkills.searchPlaceholder")}
        />
      </div>
    </div>

    <SkillAddMenu onwrite={openWrite} onimport={openImport} />
  </div>

  <!-- Built-in highlight banner -->
  {#if !loading && builtinCount > 0 && filter !== "mine"}
    <div class="banner">
      <div class="banner__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M9 21V9"></path>
        </svg>
      </div>
      <div class="banner__text">
        <strong>{$_("userSkills.banner.title")}</strong>
        <span>{$_("userSkills.banner.body")}</span>
      </div>
    </div>
  {/if}

  <!-- Grid -->
  {#if loading}
    <LoadingSpinner size="md" text={$_("userSkills.loading")} />
  {:else if visibleSkills.length === 0}
    <div class="empty">
      <div class="empty__glyph">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z"></path>
        </svg>
      </div>
      <h3 class="empty__title">{$_("userSkills.empty.title")}</h3>
      <p class="empty__body">{$_("userSkills.empty.body")}</p>
      <div class="empty__actions">
        <button class="btn btn--primary" onclick={openWrite}>{$_("userSkills.addMenu.writeTitle")}</button>
        <button class="btn btn--ghost" onclick={openImport}>{$_("userSkills.addMenu.importTitle")}</button>
      </div>
    </div>
  {:else}
    <div class="grid">
      {#each visibleSkills as skill (skill.id)}
        <SkillCard
          {skill}
          toggling={togglingId === skill.id}
          onedit={openEdit}
          ondelete={(s) => (deleteTarget = s)}
          ontoggle={handleToggle}
        />
      {/each}
    </div>
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
      {$_("userSkills.delete.message", { values: { name: deleteTarget?.name ?? "" } })}
    </p>
    <div class="delete-actions">
      <button class="btn btn--ghost" onclick={() => (deleteTarget = null)} disabled={deleting}>
        {$_("userSkills.delete.cancel")}
      </button>
      <button class="btn btn--danger" onclick={confirmDelete} disabled={deleting}>
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
  .skills-page {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .toolbar__left {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .segmented {
    display: inline-flex;
    gap: var(--space-2xs);
    padding: var(--space-2xs);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
  }

  .segment {
    padding: var(--space-xs) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .segment:hover:not(.segment--active) {
    color: var(--text-primary);
  }

  .segment--active {
    background: rgba(var(--glass-tint), 0.12);
    color: var(--text-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    height: 40px;
    padding: 0 var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    min-width: 220px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .search:focus-within {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .search svg { flex-shrink: 0; opacity: 0.7; }

  /* Neutralize global input chrome so it blends into the .search pill. */
  .search__input {
    flex: 1;
    min-width: 0;
    width: auto;
    padding: 0;
    background: none;
    border: none;
    border-radius: 0;
    outline: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  .search__input:focus {
    background: none;
    box-shadow: none;
  }

  .search__input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: linear-gradient(
      120deg,
      rgba(139, 92, 246, 0.1),
      rgba(99, 102, 241, 0.06)
    );
    border: 1px solid rgba(139, 92, 246, 0.22);
    border-radius: var(--radius-lg);
  }

  .banner__icon {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: rgba(139, 92, 246, 0.16);
    color: #c4b5fd;
  }

  .banner__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .banner__text strong {
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-sm);
    padding: var(--space-3xl) var(--space-lg);
  }

  .empty__glyph {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: rgba(var(--glass-tint), 0.05);
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }

  .empty__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty__body {
    margin: 0 0 var(--space-md);
    font-size: 0.875rem;
    color: var(--text-secondary);
    max-width: 420px;
  }

  .empty__actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: center;
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
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--brand, #4079c5);
    color: #fff;
  }

  .btn--primary:hover:not(:disabled) {
    filter: brightness(1.1);
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
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .delete-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .delete-message {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  @media (max-width: 768px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar__left {
      flex-direction: column;
      align-items: stretch;
    }

    .search {
      min-width: 0;
    }

    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
