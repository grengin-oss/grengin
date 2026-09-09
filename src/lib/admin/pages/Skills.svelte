<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import Modal from "../components/Modal.svelte";
  import SkillEditor from "../../pages/settings/skills/SkillEditor.svelte";
  import SkillImportModal from "../../pages/settings/skills/SkillImportModal.svelte";
  import { listAdminSkills, updateAdminSkill, deleteAdminSkill } from "../../api/admin/skills.js";
  import type { SkillResponse } from "../../types/skill.js";
  import { ApiError } from "../../api/client.js";
  import { toast } from "../../components/Toaster.svelte";
  import { loadNamespaces } from "$lib/i18n/index.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("adminSkills.title"));
  });

  /** ".filter-toggle" — the four tabs beside the search box. */
  type SkillFilter = "all" | "built-in" | "custom" | "enabled";

  let loading = $state(true);
  let skills = $state<SkillResponse[]>([]);
  let search = $state("");
  let filter = $state<SkillFilter>("all");
  let togglingId = $state<string | null>(null);

  // Shared editor / import components (scope="admin"), dressed in this page's
  // dialog skin via variant="skills".
  let editorOpen = $state(false);
  let editing = $state<SkillResponse | null>(null);
  let importOpen = $state(false);

  // Delete state
  let deleteTarget = $state<SkillResponse | null>(null);
  let deleting = $state(false);

  /* ---- ".stat-bar": counts read the whole catalog, not the filtered view ---- */
  const totalCount = $derived(skills.length);
  const enabledCount = $derived(skills.filter((s) => s.is_active).length);
  const builtinCount = $derived(skills.filter((s) => s.is_builtin).length);
  const customCount = $derived(skills.filter((s) => !s.is_builtin).length);

  /** Search + filter, then built-ins first and alphabetical inside each group. */
  const visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return skills
      .filter((s) => {
        if (q && !`${s.name} ${s.description ?? ""} ${s.identifier}`.toLowerCase().includes(q)) {
          return false;
        }
        if (filter === "built-in") return s.is_builtin;
        if (filter === "custom") return !s.is_builtin;
        if (filter === "enabled") return s.is_active;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const visibleBuiltin = $derived(visible.filter((s) => s.is_builtin));
  const visibleCustom = $derived(visible.filter((s) => !s.is_builtin));

  /** The design keeps the "create" tile out of a filtered or searched view. */
  const showAddCard = $derived(
    (filter === "all" || filter === "custom") && search.trim().length === 0,
  );
  const showBuiltinSection = $derived(filter !== "custom" && visibleBuiltin.length > 0);
  const showCustomSection = $derived(
    filter !== "built-in" && (visibleCustom.length > 0 || showAddCard),
  );

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
    // The shared editor + import dialogs render labels from the `settings`
    // namespace (userSkills.*), so ensure it is loaded on the admin route too.
    loadNamespaces(["settings"]);
    load();
  });
</script>

<!-- ".skill-icon" glyph when a skill carries no avatar emoji. -->
{#snippet skillGlyph(builtin: boolean)}
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {#if builtin}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    {:else}
      <path d="M12 2l2.4 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.5z" />
    {/if}
  </svg>
{/snippet}

<!-- ".skill-card" — one card, both sections. -->
{#snippet skillCard(skill: SkillResponse)}
  <article class="skill-card" data-skill-status={skill.is_active ? "enabled" : "disabled"}>
    <div class="skill-card-top">
      <div class="skill-card-head">
        <span
          class="skill-icon"
          class:skill-icon--built={skill.is_builtin}
          class:skill-icon--custom={!skill.is_builtin}
          aria-hidden="true"
        >
          {#if skill.avatar}
            {skill.avatar}
          {:else}
            {@render skillGlyph(skill.is_builtin)}
          {/if}
        </span>
        <button
          type="button"
          class="skill-toggle"
          class:skill-toggle--on={skill.is_active}
          class:skill-toggle--off={!skill.is_active}
          role="switch"
          aria-checked={skill.is_active}
          aria-label={$_("adminSkills.card.toggleAria", { values: { name: skill.name } })}
          disabled={togglingId === skill.id}
          onclick={() => handleToggle(skill, !skill.is_active)}
        >
          <span class="skill-toggle-handle"></span>
        </button>
      </div>
      <div class="skill-title-group">
        <span class="skill-name" title={skill.name}>{skill.name}</span>
        <span class="skill-slug">{skill.identifier}</span>
      </div>
      <p class="skill-desc">
        {skill.description || $_("adminSkills.card.noDescription")}
      </p>
      <span
        class="skill-tag"
        class:skill-tag--built={skill.is_builtin}
        class:skill-tag--custom={!skill.is_builtin}
      >
        {skill.is_builtin
          ? $_("adminSkills.tags.builtin")
          : $_("adminSkills.tags.custom")}
      </span>
    </div>

    <div class="skill-card-footer">
      {#if skill.is_builtin}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" stroke-width="1.1" fill="none" />
          <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" stroke-width="1.1" fill="none" />
        </svg>
        <span>{$_("adminSkills.card.managedByPlatform")}</span>
      {:else}
        <span>{$_("adminSkills.sections.customNote")}</span>
        <span class="skill-action">
          <button
            class="skill-icon-btn"
            type="button"
            onclick={() => openEdit(skill)}
            aria-label={$_("adminSkills.card.edit")}
            title={$_("adminSkills.card.edit")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M8.5 1.5 11 4 4 11H1.5V8.5z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            class="skill-icon-btn skill-icon-btn--danger"
            type="button"
            onclick={() => (deleteTarget = skill)}
            aria-label={$_("adminSkills.card.delete")}
            title={$_("adminSkills.card.delete")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M2.5 3.5h8M5 3.5V2h3v1.5M3.5 3.5 4 11h5l.5-7.5" stroke="currentColor" stroke-width="1.1" fill="none" />
            </svg>
          </button>
        </span>
      {/if}
    </div>
  </article>
{/snippet}

<div class="admin-skills-container">
  <PageHeader title={$_("adminSkills.title")} subtitle={$_("adminSkills.subtitle")}>
    {#snippet children()}
      <div class="header-actions">
        <button class="ghost-btn" type="button" onclick={openImport}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 9.5V2M4 5l3-3 3 3M2 10v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{$_("adminSkills.import")}</span>
        </button>
        <button class="cta-btn" type="button" onclick={openWrite}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span>{$_("adminSkills.addNew")}</span>
        </button>
      </div>
    {/snippet}
  </PageHeader>

  <!-- ".stat-bar" -->
  <div class="stat-bar">
    <div class="stat-item">
      <span class="stat-icon stat-icon--blue" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h9M2 8h6M2 12h9" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </span>
      <div class="stat-details">
        <span class="stat-value">{loading ? "—" : totalCount}</span>
        <span class="stat-label">{$_("adminSkills.stats.total")}</span>
      </div>
    </div>
    <div class="stat-div"></div>
    <div class="stat-item">
      <span class="stat-icon stat-icon--green" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" />
          <path d="m5.3 8 1.8 1.8L10.7 6" stroke="currentColor" stroke-width="1.3" fill="none" />
        </svg>
      </span>
      <div class="stat-details">
        <span class="stat-value">{loading ? "—" : enabledCount}</span>
        <span class="stat-label">{$_("adminSkills.stats.enabled")}</span>
      </div>
    </div>
    <div class="stat-div"></div>
    <div class="stat-item">
      <span class="stat-icon stat-icon--zinc" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </span>
      <div class="stat-details">
        <span class="stat-value">{loading ? "—" : builtinCount}</span>
        <span class="stat-label">{$_("adminSkills.stats.builtin")}</span>
      </div>
    </div>
    <div class="stat-div"></div>
    <div class="stat-item">
      <span class="stat-icon stat-icon--zinc" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </span>
      <div class="stat-details">
        <span class="stat-value">{loading ? "—" : customCount}</span>
        <span class="stat-label">{$_("adminSkills.stats.custom")}</span>
      </div>
    </div>
  </div>

  <!-- ".toolbar" -->
  <div class="toolbar">
    <div class="search-row">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.2" stroke="currentColor" stroke-width="1.3" />
        <path d="m11.3 11.3-2-2" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <input
        type="text"
        bind:value={search}
        placeholder={$_("adminSkills.searchPlaceholder")}
        aria-label={$_("adminSkills.searchPlaceholder")}
      />
    </div>
    <div class="filter-toggle" role="group" aria-label={$_("adminSkills.filters.label")}>
      {#each ["all", "built-in", "custom", "enabled"] as const as mode (mode)}
        <button
          class="filter-tab"
          type="button"
          aria-pressed={filter === mode}
          onclick={() => (filter = mode)}
        >
          {$_("adminSkills.filters." + (mode === "built-in" ? "builtin" : mode))}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <!-- ".skill-grid" placeholder while the catalog loads. -->
    <div class="skill-grid" aria-busy="true" aria-label={$_("adminSkills.loading")}>
      {#each [0, 1, 2] as i (i)}
        <div class="skel-card">
          <div class="skel-head">
            <span class="skel-box skel-icon"></span>
            <span class="skel-box skel-switch"></span>
          </div>
          <span class="skel-box skel-line" style="width:55%"></span>
          <span class="skel-box skel-line skel-line--sm" style="width:35%"></span>
          <span class="skel-box skel-line" style="width:90%"></span>
          <span class="skel-box skel-line" style="width:70%"></span>
        </div>
      {/each}
    </div>
  {:else}
    {#if showBuiltinSection}
      <!-- ".skill-section" — built-in -->
      <section class="skill-section">
        <div class="section-header">
          <div class="section-header-left">
            <span class="header-badge header-badge--built" aria-hidden="true">
              <span class="header-badge__mark header-badge__mark--square"></span>
            </span>
            <h2 class="section-title">{$_("adminSkills.sections.builtinTitle")}</h2>
            <span class="count-badge">{visibleBuiltin.length}</span>
          </div>
          <span class="section-right-label">{$_("adminSkills.sections.builtinNote")}</span>
        </div>
        <div class="section-divider"></div>
        <div class="skill-grid">
          {#each visibleBuiltin as skill (skill.id)}
            {@render skillCard(skill)}
          {/each}
        </div>
      </section>
    {/if}

    {#if showCustomSection}
      <!-- ".skill-section" — custom -->
      <section class="skill-section">
        <div class="section-header">
          <div class="section-header-left">
            <span class="header-badge header-badge--custom" aria-hidden="true">
              <span class="header-badge__mark header-badge__mark--round"></span>
            </span>
            <h2 class="section-title">{$_("adminSkills.sections.customTitle")}</h2>
            <span class="count-badge">{visibleCustom.length}</span>
          </div>
          <span class="section-right-label">{$_("adminSkills.sections.customNote")}</span>
        </div>
        <div class="section-divider"></div>
        <div class="skill-grid">
          {#each visibleCustom as skill (skill.id)}
            {@render skillCard(skill)}
          {/each}
          {#if showAddCard}
            <button class="add-skill-card" type="button" onclick={openWrite}>
              <span class="add-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 2v14M2 9h14" stroke="currentColor" stroke-width="1.6" />
                </svg>
              </span>
              <span class="add-copy">
                <span class="add-title">{$_("adminSkills.addCard.title")}</span>
                <span class="add-sub">{$_("adminSkills.addCard.body")}</span>
              </span>
            </button>
          {/if}
        </div>
      </section>
    {/if}

    {#if !showBuiltinSection && !showCustomSection}
      <p class="empty-hint">
        {skills.length === 0 ? $_("adminSkills.empty") : $_("adminSkills.noResults")}
      </p>
    {/if}
  {/if}
</div>

<SkillEditor
  open={editorOpen}
  scope="admin"
  variant="skills"
  skill={editing}
  onclose={() => (editorOpen = false)}
  onsaved={handleSaved}
/>

<SkillImportModal
  open={importOpen}
  scope="admin"
  variant="skills"
  existingSkills={skills}
  onclose={() => (importOpen = false)}
  onimported={handleImported}
/>

<Modal
  variant="mcp-servers"
  isOpen={!!deleteTarget}
  title={$_("adminSkills.delete.title")}
  subtitle={$_("adminSkills.delete.subtitle")}
  onclose={() => (deleteTarget = null)}
>
  {#snippet headerIcon()}
    <span class="del-header-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3.5 5h11M6.5 5V2.8h5V5M4.8 5l.7 10.2h7l.7-10.2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round" />
      </svg>
    </span>
  {/snippet}

  {#snippet children()}
    <p class="delete-message">
      {$_("adminSkills.delete.message", { values: { name: deleteTarget?.name ?? "" } })}
    </p>
  {/snippet}

  {#snippet footer()}
    <div class="delete-footer">
      <button class="sk-btn-cancel" type="button" onclick={() => (deleteTarget = null)} disabled={deleting}>
        {$_("adminSkills.delete.cancel")}
      </button>
      <button class="sk-btn-danger" type="button" onclick={confirmDelete} disabled={deleting}>
        {deleting ? $_("adminSkills.delete.deleting") : $_("adminSkills.delete.confirm")}
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* ===== skills.html, transcribed. Design values that no --gx-* token already
     carried live in app.css as --gx-sk-*. ===== */

  /* app.css paints every bare <button>/<input> as a glass pill — padding, a
     fill, a radius, an inset shadow, a lift on hover. Every control below is
     flat, so strip that once here and let each rule paint its own skin. */
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
  }

  button:hover {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:active {
    transform: none;
    box-shadow: none;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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
    line-height: 100%;
  }

  input:focus {
    background: transparent;
    box-shadow: none;
  }

  /* ".main" */
  .admin-skills-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    height: 100%;
    width: 100%;
    background: var(--gx-page);
    padding: 32px;
    overflow-y: auto;
    font-family: var(--gx-font);
  }

  /* The design spaces the header from the stat bar with the column gap alone. */
  .admin-skills-container :global(.page-header) {
    padding-bottom: 0;
  }

  /* ".header-actions" */
  .header-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
  }

  .ghost-btn,
  .cta-btn {
    height: 37px;
    border-radius: 8px;
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    white-space: nowrap;
    transition: background-color 120ms ease;
  }

  .ghost-btn {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-sk-border);
    color: var(--gx-sk-desc);
  }

  .ghost-btn:hover {
    background: var(--gx-hover-soft);
  }

  .cta-btn {
    background: var(--gx-org-primary-500);
    color: #fff;
  }

  .cta-btn:hover {
    background: var(--gx-ac-cta-hover);
  }

  .ghost-btn:focus-visible,
  .cta-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .ghost-btn svg,
  .cta-btn svg {
    display: block;
    flex-shrink: 0;
  }

  /* ---------------- ".stat-bar" ---------------- */
  .stat-bar {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-sk-border),
      0 1px 3px 0 rgba(0, 0, 0, 0.0314);
    display: flex;
    padding: 16px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .stat-item {
    flex: 1 1 0;
    display: flex;
    gap: 12px;
    padding: 0 16px;
    align-items: center;
    min-width: 0;
  }

  .stat-div {
    width: 1px;
    height: 36px;
    background: var(--gx-sk-chip);
    flex-shrink: 0;
  }

  .stat-icon {
    width: 34px;
    height: 34px;
    border-radius: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    display: block;
  }

  .stat-icon--blue {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-link);
  }

  .stat-icon--green {
    background: var(--gx-sk-built-bg);
    color: var(--gx-sk-built-fg);
  }

  .stat-icon--zinc {
    background: var(--gx-sk-chip);
    color: var(--gx-sk-desc);
  }

  .stat-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stat-value {
    font-weight: 700;
    font-size: 20px;
    line-height: 100%;
    color: var(--gx-sk-ink);
    white-space: nowrap;
  }

  .stat-label {
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-sk-muted);
    white-space: nowrap;
  }

  /* ---------------- ".toolbar" ---------------- */
  .toolbar {
    min-height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    gap: 16px;
    flex-wrap: wrap;
  }

  .search-row {
    width: 320px;
    max-width: 100%;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-sk-border);
    display: flex;
    gap: 8px;
    padding: 0 12px;
    align-items: center;
    flex-shrink: 1;
    color: var(--gx-sk-muted);
    box-sizing: border-box;
  }

  .search-row:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-row svg {
    display: block;
    flex-shrink: 0;
  }

  .search-row input {
    flex-grow: 1;
    min-width: 0;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-sk-ink);
  }

  .search-row input::placeholder {
    color: var(--gx-sk-muted);
    opacity: 1;
  }

  .filter-toggle {
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    padding: 4px;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .filter-tab {
    height: 28px;
    border-radius: 6px;
    padding: 6px 14px;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-sk-muted);
    white-space: nowrap;
    box-sizing: border-box;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .filter-tab[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    color: var(--gx-sk-ink);
  }

  .filter-tab:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- ".skill-section" ---------------- */
  .skill-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    gap: 16px;
  }

  .section-header-left {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .header-badge {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .header-badge--built {
    background: var(--gx-sk-built-bg);
  }

  .header-badge--custom {
    background: var(--gx-blue-soft);
  }

  .header-badge__mark {
    width: 10px;
    height: 10px;
  }

  .header-badge__mark--square {
    border-radius: 2px;
    background: var(--gx-sk-built-fg);
  }

  .header-badge__mark--round {
    border-radius: 50%;
    background: var(--gx-ac-link);
  }

  .section-title {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-sk-ink);
    white-space: nowrap;
  }

  .count-badge {
    border-radius: 12px;
    background: var(--gx-sk-chip);
    padding: 2px 8px;
    font-weight: 600;
    font-size: 11px;
    color: var(--gx-sk-desc);
  }

  .section-right-label {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-sk-muted);
    white-space: nowrap;
  }

  .section-divider {
    height: 1px;
    background: var(--gx-sk-chip);
    align-self: stretch;
  }

  /* The design lays 352px cards across a wrapping row; the same metrics as a
     fill-grid keep three across at the design width and reflow cleanly when the
     catalog or the viewport changes. */
  .skill-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    align-self: stretch;
  }

  /* ---------------- ".skill-card" ---------------- */
  .skill-card {
    min-width: 0;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-sk-border),
      0 1px 3px 0 rgba(0, 0, 0, 0.0314);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: opacity 120ms ease;
  }

  /* A disabled skill reads back but sits quiet. */
  .skill-card[data-skill-status="disabled"] .skill-card-top {
    opacity: 0.62;
  }

  .skill-card-top {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .skill-card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .skill-icon {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    line-height: 1;
    flex-shrink: 0;
  }

  .skill-icon--built {
    background: var(--gx-sk-built-bg);
    color: var(--gx-sk-built-fg);
  }

  .skill-icon--custom {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-link);
  }

  .skill-toggle {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    padding: 2px;
    align-items: center;
    flex-shrink: 0;
    transition: background-color 160ms ease;
  }

  .skill-toggle--on {
    background: var(--gx-ac-link);
    justify-content: flex-end;
  }

  .skill-toggle--off {
    background: var(--gx-sk-border);
    justify-content: flex-start;
  }

  .skill-toggle:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .skill-toggle-handle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.0627);
    flex-shrink: 0;
  }

  .skill-title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .skill-name {
    font-weight: 700;
    font-size: 15px;
    line-height: 1.2;
    color: var(--gx-sk-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-slug {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 12px;
    letter-spacing: -0.2px;
    color: var(--gx-sk-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-desc {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 1.5;
    color: var(--gx-sk-desc);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .skill-tag {
    border-radius: 6px;
    padding: 4px 8px;
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    display: inline-flex;
    align-self: flex-start;
  }

  .skill-tag--built {
    background: var(--gx-sk-built-bg);
    color: var(--gx-ac-dept-fg);
  }

  .skill-tag--custom {
    background: var(--gx-blue-soft);
    color: var(--gx-ac-system-fg);
  }

  .skill-card-footer {
    border-top: 1px solid var(--gx-sk-chip);
    padding: 12px 20px;
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--gx-sk-lock);
    min-width: 0;
  }

  .skill-card-footer svg {
    display: block;
    flex-shrink: 0;
  }

  .skill-card-footer > span {
    font-weight: 400;
    font-size: 12px;
    color: var(--gx-sk-lock);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-action {
    margin-inline-start: auto;
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .skill-icon-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: var(--gx-sk-chip);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-sk-muted);
    flex-shrink: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .skill-icon-btn:hover {
    background: var(--gx-sk-border);
    color: var(--gx-sk-ink);
  }

  .skill-icon-btn--danger:hover {
    background: var(--gx-mcp-err-bg);
    color: var(--gx-mcp-red);
  }

  .skill-icon-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .skill-icon-btn svg {
    display: block;
  }

  /* ---------------- ".add-skill-card" ---------------- */
  .add-skill-card {
    min-height: 190px;
    border-radius: 12px;
    background: var(--gx-blue-soft);
    outline: 1.5px dashed var(--gx-ac-link);
    outline-offset: -1.5px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
    justify-content: center;
    align-items: center;
    white-space: normal;
    transition: background-color 120ms ease;
  }

  .add-skill-card:hover {
    background: var(--gx-sk-add-hover);
  }

  .add-skill-card:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .add-icon {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    background: var(--gx-sk-add-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-ac-link);
    flex-shrink: 0;
  }

  .add-icon svg {
    display: block;
  }

  .add-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
  }

  .add-title {
    font-weight: 700;
    font-size: 14px;
    text-align: center;
    color: var(--gx-ac-system-fg);
  }

  .add-sub {
    max-width: 220px;
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
    color: var(--gx-mcp-scope-fg);
  }

  /* ".empty-hint" */
  .empty-hint {
    margin: 0;
    align-self: stretch;
    text-align: center;
    padding: 32px;
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-sk-muted);
  }

  /* ---------------- first-load placeholder ---------------- */
  .skel-card {
    min-height: 190px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-sk-border),
      0 1px 3px 0 rgba(0, 0, 0, 0.0314);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
  }

  .skel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .skel-box {
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--gx-mcp-skel-a),
      var(--gx-mcp-skel-b),
      var(--gx-mcp-skel-a)
    );
    background-size: 200% 100%;
    animation: skelShimmer 1.3s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes skelShimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skel-box {
      animation: none;
    }
  }

  .skel-icon {
    width: 42px;
    height: 42px;
    border-radius: 8px;
  }

  .skel-switch {
    width: 36px;
    height: 20px;
    border-radius: 10px;
  }

  .skel-line {
    height: 12px;
    border-radius: 4px;
  }

  .skel-line--sm {
    height: 10px;
  }

  /* ---------------- delete confirmation ---------------- */
  /* Opened through Modal's "mcp-servers" variant, whose footer slot is unpadded
     so the page paints its own action bar. */
  .del-header-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--gx-mcp-err-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-mcp-red);
    flex-shrink: 0;
  }

  .delete-message {
    margin: 0;
    padding: 18px 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--gx-sk-desc);
  }

  .delete-footer {
    min-height: 69px;
    background: var(--gx-card);
    border-top: 1px solid var(--gx-sk-m-border);
    display: flex;
    gap: 8px;
    padding: 16px 24px;
    justify-content: flex-end;
    align-items: center;
    box-sizing: border-box;
  }

  .sk-btn-cancel,
  .sk-btn-danger {
    height: 38px;
    border-radius: 9px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    transition: background-color 120ms ease;
  }

  .sk-btn-cancel {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-sk-m-border);
    color: var(--gx-sk-m-mono);
  }

  .sk-btn-cancel:hover:not(:disabled) {
    background: var(--gx-hover-soft);
  }

  .sk-btn-danger {
    background: var(--gx-mcp-deny);
    color: #fff;
  }

  .sk-btn-danger:hover:not(:disabled) {
    background: var(--gx-mcp-red);
  }

  .sk-btn-cancel:focus-visible,
  .sk-btn-danger:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- narrow viewports ---------------- */
  @media (max-width: 900px) {
    /* Four stat tiles will not hold their widths in one row below this. */
    .stat-bar {
      padding: 12px;
      row-gap: 12px;
    }

    .stat-item {
      flex: 1 1 45%;
      padding: 4px 8px;
    }

    .stat-div {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .admin-skills-container {
      padding: 20px 16px;
      gap: 20px;
    }

    .header-actions {
      width: 100%;
    }

    .search-row {
      width: 100%;
    }

    .filter-toggle {
      overflow-x: auto;
    }

    .section-right-label {
      display: none;
    }
  }
</style>
