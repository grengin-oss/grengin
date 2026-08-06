<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import { tick } from "svelte";
  import Modal from "../Modal.svelte";
  import type { Department, User } from "../../types.js";

  interface Props {
    isOpen: boolean;
    user: User | null;
    /** Flat list of selectable teams (administered departments). */
    departments: Department[];
    isSubmitting?: boolean;
    onConfirm: (departmentId: string) => void;
    onClose: () => void;
  }

  let {
    isOpen = $bindable(),
    user,
    departments,
    isSubmitting = false,
    onConfirm,
    onClose,
  }: Props = $props();

  let selectedDepartmentId = $state("");
  let query = $state("");
  let listOpen = $state(false);
  let highlightedIndex = $state(-1);
  let inputEl = $state<HTMLInputElement | null>(null);
  const descriptionId = "assign-team-description";
  const listboxId = "assign-team-listbox";

  const selectedDepartment = $derived(
    departments.find((d) => d.id === selectedDepartmentId) ?? null,
  );

  // Filter by the typed query. When the query still matches the current
  // selection (or is empty), show the whole list so the user can re-browse.
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selectedDepartment && query === selectedDepartment.name)) {
      return departments;
    }
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  });

  // Reset to the user's current team each time the modal opens for a user.
  let lastUserId = $state<string | null>(null);
  $effect(() => {
    if (isOpen && user && user.id !== lastUserId) {
      selectedDepartmentId = user.department_id ?? "";
      const current = departments.find((d) => d.id === user.department_id);
      query = current?.name ?? "";
      listOpen = false;
      highlightedIndex = -1;
      lastUserId = user.id;
    }
    if (!isOpen) {
      lastUserId = null;
    }
  });

  // Resolve the effective team: an explicit pick, or an exact typed name match
  // (so confirming works even if the user types the full name without clicking).
  const effectiveDepartmentId = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const exact = departments.find((d) => d.name.toLowerCase() === q);
    return exact?.id ?? selectedDepartmentId;
  });

  const canConfirm = $derived(
    !!effectiveDepartmentId &&
      effectiveDepartmentId !== (user?.department_id ?? "") &&
      !isSubmitting,
  );

  function openList() {
    if (isSubmitting) return;
    listOpen = true;
    highlightedIndex = filtered.findIndex((d) => d.id === selectedDepartmentId);
  }

  function selectDepartment(dept: Department) {
    selectedDepartmentId = dept.id;
    query = dept.name;
    listOpen = false;
    highlightedIndex = -1;
  }

  function onInput() {
    listOpen = true;
    highlightedIndex = 0;
    // Typing a fresh query invalidates a prior selection until re-picked.
    if (selectedDepartment && query !== selectedDepartment.name) {
      selectedDepartmentId = "";
    }
  }

  async function moveHighlight(delta: number) {
    if (!listOpen) {
      openList();
      await tick();
    }
    const count = filtered.length;
    if (count === 0) return;
    const next = highlightedIndex < 0 ? 0 : highlightedIndex + delta;
    highlightedIndex = ((next % count) + count) % count;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter") {
      if (listOpen && highlightedIndex >= 0 && filtered[highlightedIndex]) {
        event.preventDefault();
        selectDepartment(filtered[highlightedIndex]);
      }
    } else if (event.key === "Escape") {
      if (listOpen) {
        event.stopPropagation();
        listOpen = false;
      }
    }
  }

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(effectiveDepartmentId);
  }
</script>

<Modal {isOpen} title={$_("admin.organization.assignModalTitle")} onclose={onClose} {descriptionId}>
  <form
    class="assign-team-form"
    onsubmit={(e) => {
      e.preventDefault();
      handleConfirm();
    }}
  >
    <p id={descriptionId} class="assign-team-description">
      {$_("admin.organization.assignModalDescription", {
        values: { name: user?.name || user?.email || "" },
      })}
    </p>

    <label class="assign-team-label" for="assign-team-input">
      {$_("admin.common.department")}
    </label>

    <div class="assign-team-combobox">
      <div class="assign-team-input-wrap">
        <input
          bind:this={inputEl}
          id="assign-team-input"
          class="filter-input"
          type="text"
          autocomplete="off"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && highlightedIndex >= 0
            ? `assign-team-option-${highlightedIndex}`
            : undefined}
          placeholder={$_("admin.organization.selectTeamPlaceholder")}
          bind:value={query}
          disabled={isSubmitting}
          oninput={onInput}
          onfocus={openList}
          onkeydown={onKeydown}
          onblur={() => setTimeout(() => (listOpen = false), 120)}
        />
        <svg
          class="assign-team-chevron"
          class:open={listOpen}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {#if listOpen}
        <ul class="assign-team-list" id={listboxId} role="listbox">
          {#if filtered.length === 0}
            <li class="assign-team-empty" role="presentation">
              {$_("admin.users.noUsersFound")}
            </li>
          {:else}
            {#each filtered as dept, index (dept.id)}
              <li
                id={`assign-team-option-${index}`}
                class="assign-team-option"
                class:highlighted={index === highlightedIndex}
                class:selected={dept.id === selectedDepartmentId}
                role="option"
                aria-selected={dept.id === selectedDepartmentId}
                onmousedown={(e) => {
                  e.preventDefault();
                  selectDepartment(dept);
                }}
                onmouseenter={() => (highlightedIndex = index)}
              >
                {dept.name}
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>

    <div class="assign-team-actions">
      <button type="button" class="btn-secondary" onclick={onClose} disabled={isSubmitting}>
        {$_("admin.organization.cancel")}
      </button>
      <button type="submit" class="btn-primary" disabled={!canConfirm}>
        {isSubmitting ? $_("admin.common.saving") : $_("admin.organization.confirmAssign")}
      </button>
    </div>
  </form>
</Modal>

<style>
  .assign-team-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .assign-team-description {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }

  .assign-team-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .assign-team-combobox {
    display: flex;
    flex-direction: column;
  }

  .assign-team-input-wrap {
    position: relative;
  }

  .assign-team-input-wrap .filter-input {
    width: 100%;
    padding-inline-end: 2.25rem;
  }

  .assign-team-chevron {
    position: absolute;
    top: 50%;
    inset-inline-end: 0.75rem;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
    transition: transform 0.2s ease;
  }

  .assign-team-chevron.open {
    transform: translateY(-50%) rotate(180deg);
  }

  /* In-flow (not absolute) so the options are never clipped by the modal's
     scroll container — the modal grows/scrolls to fit them instead. */
  .assign-team-list {
    margin: var(--space-xs) 0 0 0;
    max-height: 220px;
    overflow-y: auto;
    padding: var(--space-xs);
    list-style: none;
    background: var(--glass-bg-dark);
    border: 1px solid var(--glass-stroke-light);
    border-radius: var(--radius-md);
    box-shadow: var(--glass-shadow-dark);
  }

  .assign-team-option {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 0.9375rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  .assign-team-option.highlighted {
    background: var(--btn-tertiary);
  }

  .assign-team-option.selected {
    color: var(--brand);
    font-weight: 600;
  }

  .assign-team-empty {
    padding: var(--space-sm) var(--space-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .assign-team-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }
</style>
