<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import Modal from "../components/Modal.svelte";
  import SkillCard from "../../pages/settings/skills/SkillCard.svelte";
  import SkillEditor from "../../pages/settings/skills/SkillEditor.svelte";
  import SkillImportModal from "../../pages/settings/skills/SkillImportModal.svelte";
  import SkillAddMenu from "../../pages/settings/skills/SkillAddMenu.svelte";
  import { listAdminSkills, updateAdminSkill, deleteAdminSkill } from "../../api/admin/skills.js";
  import type { SkillResponse } from "../../types/skill.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";
  import { loadNamespaces } from "$lib/i18n/index.js";

  let loading = $state(true);
  let skills = $state<SkillResponse[]>([]);
  let search = $state("");
  let togglingId = $state<string | null>(null);

  // Shared editor / import components (scope="admin").
  let editorOpen = $state(false);
  let editing = $state<SkillResponse | null>(null);
  let importOpen = $state(false);

  // Delete state
  let deleteTarget = $state<SkillResponse | null>(null);
  let deleting = $state(false);

  const visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return skills
      .filter((s) => {
        if (!q) return true;
        return `${s.name} ${s.description ?? ""} ${s.identifier}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.is_builtin !== b.is_builtin) return a.is_builtin ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  });

  function errMsg(error: unknown, key: string): string {
    return error instanceof ApiError ? error.description || $_(key) : $_(key);
  }

  async function load() {
    loading = true;
    try {
      const res = await listAdminSkills();
      skills = res.skills ?? [];
    } catch (error) {
      toast.error(errMsg(error, "adminSkills.messages.loadFailed"));
    } finally {
      loading = false;
    }
  }

  function openWrite() {
    editing = null;
    editorOpen = true;
  }

  function openImport() {
    importOpen = true;
  }

  function openEdit(skill: SkillResponse) {
    editing = skill;
    editorOpen = true;
  }

  function upsertSkill(saved: SkillResponse) {
    const idx = skills.findIndex((s) => s.id === saved.id);
    if (idx >= 0) skills[idx] = saved;
    else skills = [saved, ...skills];
  }

  function handleSaved(saved: SkillResponse) {
    editorOpen = false;
    editing = null;
    upsertSkill(saved);
  }

  function handleImported(saved: SkillResponse) {
    importOpen = false;
    upsertSkill(saved);
  }

  async function handleToggle(skill: SkillResponse, active: boolean) {
    if (skill.is_builtin) {
      toast.error($_("adminSkills.messages.builtinReadOnly"));
      return;
    }
    togglingId = skill.id;
    try {
      const updated = await updateAdminSkill(skill.id, { is_active: active });
      const idx = skills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) skills[idx] = updated;
    } catch (error) {
      toast.error(errMsg(error, "adminSkills.messages.toggleFailed"));
    } finally {
      togglingId = null;
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await deleteAdminSkill(deleteTarget.id);
      skills = skills.filter((s) => s.id !== deleteTarget!.id);
      toast.success($_("adminSkills.messages.deleted"));
      deleteTarget = null;
    } catch (error) {
      toast.error(errMsg(error, "adminSkills.messages.deleteFailed"));
    } finally {
      deleting = false;
    }
  }

  onMount(() => {
    // The shared skill card + editor render labels from the `settings`
    // namespace (userSkills.*), so ensure it is loaded on the admin route too.
    loadNamespaces(["settings"]);
    load();
  });
</script>

<div class="admin-skills-container">
  <PageHeader title={$_("adminSkills.title")} subtitle={$_("adminSkills.subtitle")} />

  <div class="content">
    <div class="toolbar">
      <div class="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path>
        </svg>
        <input class="search__input" type="text" bind:value={search} placeholder={$_("adminSkills.searchPlaceholder")} />
      </div>
      <SkillAddMenu label={$_("adminSkills.createSkill")} onwrite={openWrite} onimport={openImport} />
    </div>

    {#if loading}
      <LoadingSpinner size="md" text={$_("adminSkills.loading")} />
    {:else if visible.length === 0}
      <div class="empty">
        <p>{$_("adminSkills.empty")}</p>
        <div class="empty__actions">
          <button class="btn btn--primary" onclick={openWrite}>{$_("userSkills.addMenu.writeTitle")}</button>
          <button class="btn btn--ghost" onclick={openImport}>{$_("userSkills.addMenu.importTitle")}</button>
        </div>
      </div>
    {:else}
      <div class="grid">
        {#each visible as skill (skill.id)}
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
</div>

<SkillEditor
  open={editorOpen}
  scope="admin"
  skill={editing}
  onclose={() => (editorOpen = false)}
  onsaved={handleSaved}
/>

<SkillImportModal
  open={importOpen}
  scope="admin"
  existingSkills={skills}
  onclose={() => (importOpen = false)}
  onimported={handleImported}
/>

<Modal isOpen={!!deleteTarget} title={$_("adminSkills.delete.title")} onclose={() => (deleteTarget = null)}>
  <div class="delete-body">
    <p class="delete-message">{$_("adminSkills.delete.message", { values: { name: deleteTarget?.name ?? "" } })}</p>
    <div class="delete-actions">
      <button class="btn btn--ghost" onclick={() => (deleteTarget = null)} disabled={deleting}>{$_("adminSkills.delete.cancel")}</button>
      <button class="btn btn--danger" onclick={confirmDelete} disabled={deleting}>
        {#if deleting}<span class="btn-spinner"></span>{$_("adminSkills.delete.deleting")}{:else}{$_("adminSkills.delete.confirm")}{/if}
      </button>
    </div>
  </div>
</Modal>

<style>
  .admin-skills-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  .content {
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
    flex: 1 1 260px;
    max-width: 420px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .search:focus-within {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
  .search svg { flex-shrink: 0; opacity: 0.7; }
  /* Neutralize the global input chrome so the input blends into the .search pill. */
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
  .search__input::placeholder { color: var(--text-secondary); opacity: 0.6; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-3xl);
    color: var(--text-secondary);
  }

  .empty__actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn { display: inline-flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-lg); border: none; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn--primary { background: var(--brand, #4079c5); color: #fff; }
  .btn--primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn--ghost { background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text-secondary); }
  .btn--ghost:hover:not(:disabled) { background: rgba(var(--glass-tint),0.05); color: var(--text-primary); }
  .btn--danger { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
  .btn-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 6px; }

  .delete-body { display: flex; flex-direction: column; gap: var(--space-xl); }
  .delete-message { margin: 0; font-size: 0.9375rem; line-height: 1.6; color: var(--text-secondary); }
  .delete-actions { display: flex; justify-content: flex-end; gap: var(--space-md); }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .admin-skills-container { padding: var(--space-lg); }
    .grid { grid-template-columns: 1fr; }
  }
</style>
