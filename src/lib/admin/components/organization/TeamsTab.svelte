<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { departmentsStore, usersStore } from "../../stores/index.js";
  import type { Department, User } from "../../types.js";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import DepartmentTreeNode from "../DepartmentTreeNode.svelte";
  import DepartmentDetailsPanel from "../DepartmentDetailsPanel.svelte";
  import DepartmentFormModal from "../DepartmentFormModal.svelte";
  import UnassignedPanel from "./UnassignedPanel.svelte";
  import { toast } from "$lib/components/Toaster.svelte";
  import { ApiError } from "$lib/api/client.js";
  import { getLocalizedError } from "$lib/utils/errorLocalization.js";
  import { formatCurrency } from "$lib/utils/format.js";
  import { _ } from "svelte-i18n";
  import { permissionsStore } from "$lib/features/auth/index.js";

  interface Props {
    /** Controlled by the Organization header's contextual "Create Department" button. */
    showCreateModal?: boolean;
    /** Feature flag — hides the Unassigned node when off (default on). */
    showUnassignedNode?: boolean;
    /** Opens the shared team picker for a user. */
    onAssignTeam?: (user: User) => void;
  }

  let {
    showCreateModal = $bindable(false),
    showUnassignedNode = true,
    onAssignTeam,
  }: Props = $props();

  const SELECTED_DEPARTMENT_QUERY_KEY = "departmentId";
  const store = $derived($departmentsStore);
  /** Selection is id-only; full row comes from store via $derived (no sync effect). */
  let selectedDepartmentId = $state<string | null>(null);
  let unassignedSelected = $state(false);
  let requestedDepartmentId = $state<string | null>(null);
  let initialExpandedDepartmentIds = $state<Set<string>>(new Set());
  let hasAppliedInitialExpansion = $state(false);
  let hasResolvedInitialSelection = $state(false);
  let treeQuery = $state("");

  const selectedDepartment = $derived.by((): Department | null => {
    const id = selectedDepartmentId;
    if (!id) return null;
    const fromAdmin = store.administeredDepartments.find((d) => d.id === id);
    if (fromAdmin) return fromAdmin;
    return findDepartmentInTree(store.departmentsTree, id);
  });

  /** Parent preset by the tree's "Add sub-department" row. */
  let createParentId = $state<string | null>(null);
  let showEditModal = $state(false);
  let editingDepartment = $state<Department | null>(null);
  /** Narrow layout only: collapsible org tree (CSS gates visibility of toggle + collapsed body). */
  let mobileTreeExpanded = $state(true);
  const canManageDepartments = $derived(permissionsStore.canManageDepartments());
  const canManageUsers = $derived(permissionsStore.canManageUsers());

  // ---- KPI figures (all live values, no placeholders) ----
  const departmentCount = $derived(countDepartments(store.departmentsTree));
  const treeDepth = $derived(measureDepth(store.departmentsTree));
  const totalPeople = $derived(usersStore.peopleTotal);
  const unassignedCount = $derived(usersStore.unassignedCount);
  /** Root allocations only — child budgets are carved out of their parent's. */
  const budgetAllocated = $derived(
    store.departmentsTree.reduce((sum, dept) => sum + (dept.budget_allocated ?? 0), 0),
  );
  const peopleInTeams = $derived(
    store.departmentsTree.reduce((sum, dept) => sum + (dept.total_member_count ?? 0), 0),
  );

  /** Tree filtered by the STRUCTURE search box; a parent survives if a descendant matches. */
  const visibleTree = $derived(filterTree(store.departmentsTree, treeQuery.trim().toLowerCase()));
  const isSearchingTree = $derived(treeQuery.trim().length > 0);

  // ---- STRUCTURE tree scrolling: the design draws its own 6px bars ----
  const MIN_THUMB = 28;
  let treeListElement = $state<HTMLDivElement | null>(null);
  let treeScroll = $state({
    v: { visible: false, offset: 0, size: 0 },
    h: { visible: false, offset: 0, size: 0 },
  });

  function measureAxis(track: number, content: number, position: number) {
    if (content <= track + 1) return { visible: false, offset: 0, size: 0 };
    const size = Math.max(MIN_THUMB, (track * track) / content);
    const offset = ((track - size) * position) / (content - track);
    return { visible: true, offset, size };
  }

  /** Pointer-drag on a thumb scrolls the list, like a native scrollbar. */
  function startThumbDrag(axis: 'v' | 'h', event: PointerEvent) {
    const el = treeListElement;
    if (!el) return;
    event.preventDefault();
    const startPointer = axis === 'v' ? event.clientY : event.clientX;
    const startScroll = axis === 'v' ? el.scrollTop : el.scrollLeft;
    const track = axis === 'v' ? el.clientHeight : el.clientWidth;
    const content = axis === 'v' ? el.scrollHeight : el.scrollWidth;
    const thumb = axis === 'v' ? treeScroll.v.size : treeScroll.h.size;
    const travel = track - thumb;
    if (travel <= 0) return;
    const ratio = (content - track) / travel;
    const thumbEl = event.currentTarget as HTMLElement;
    thumbEl.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = (axis === 'v' ? moveEvent.clientY : moveEvent.clientX) - startPointer;
      const next = startScroll + delta * ratio;
      if (axis === 'v') el.scrollTop = next;
      else el.scrollLeft = next;
    };
    const onUp = () => {
      thumbEl.releasePointerCapture(event.pointerId);
      thumbEl.removeEventListener('pointermove', onMove);
      thumbEl.removeEventListener('pointerup', onUp);
      thumbEl.removeEventListener('pointercancel', onUp);
    };
    thumbEl.addEventListener('pointermove', onMove);
    thumbEl.addEventListener('pointerup', onUp);
    thumbEl.addEventListener('pointercancel', onUp);
  }

  function syncTreeScrollbars() {
    const el = treeListElement;
    if (!el) return;
    treeScroll = {
      v: measureAxis(el.clientHeight, el.scrollHeight, el.scrollTop),
      h: measureAxis(el.clientWidth, el.scrollWidth, el.scrollLeft),
    };
  }

  /** Deepest nesting level in the tree (1 = roots only) — the footer copy. */
  function measureDepth(departments: Department[]): number {
    let deepest = 0;
    for (const dept of departments) {
      deepest = Math.max(deepest, 1 + measureDepth(dept.children ?? []));
    }
    return deepest;
  }

  function countDepartments(departments: Department[]): number {
    return departments.reduce(
      (sum, dept) => sum + 1 + countDepartments(dept.children ?? []),
      0,
    );
  }

  function filterTree(departments: Department[], query: string): Department[] {
    if (!query) return departments;
    const matches: Department[] = [];
    for (const dept of departments) {
      const children = filterTree(dept.children ?? [], query);
      if (dept.name.toLowerCase().includes(query) || children.length > 0) {
        matches.push({ ...dept, children });
      }
    }
    return matches;
  }

  function findDepartmentInTree(
    departments: Department[],
    departmentId: string
  ): Department | null {
    for (const department of departments) {
      if (department.id === departmentId) {
        return department;
      }
      if (department.children?.length) {
        const nestedMatch = findDepartmentInTree(department.children, departmentId);
        if (nestedMatch) {
          return nestedMatch;
        }
      }
    }
    return null;
  }

  function syncSelectedDepartmentToUrl(departmentId: string | null) {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(SELECTED_DEPARTMENT_QUERY_KEY);
    if (departmentId) {
      if (current !== departmentId) {
        url.searchParams.set(SELECTED_DEPARTMENT_QUERY_KEY, departmentId);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } else if (current != null) {
      url.searchParams.delete(SELECTED_DEPARTMENT_QUERY_KEY);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  function getExpandedPathIds(
    department: Department | null,
    allDepartments: Department[]
  ): Set<string> {
    const expandedIds = new Set<string>();
    if (!department) return expandedIds;

    const byId = new Map(allDepartments.map((d) => [d.id, d]));
    let current: Department | undefined = department;

    while (current && current.parent_id) {
      expandedIds.add(current.parent_id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }

    return expandedIds;
  }

  // Thumb geometry follows the rendered tree, the filter and the panel size.
  $effect(() => {
    const el = treeListElement;
    if (!el) return;
    void visibleTree;
    void unassignedCount;
    syncTreeScrollbars();
    const observer = new ResizeObserver(syncTreeScrollbars);
    observer.observe(el);
    const rows = el.firstElementChild;
    if (rows) observer.observe(rows);
    return () => observer.disconnect();
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    requestedDepartmentId = params.get(SELECTED_DEPARTMENT_QUERY_KEY);
    departmentsStore.fetchDepartmentsTree();
    departmentsStore.fetchAdministeredDepartments();
    usersStore.fetchUnassignedUsers();
  });

  $effect(() => {
    if (store.error) {
      const errorMessage = store.error instanceof ApiError
        ? getLocalizedError(store.error, 'description', $_)
        : store.error.message;
      toast.error(errorMessage || $_('admin.departments.failedToFetch'));
      departmentsStore.clearError();
    }
  });

  // Initial selection + one-shot URL expansion path
  $effect(() => {
    if (!hasResolvedInitialSelection && store.departmentsTree.length > 0 && !store.loading) {
      let picked: Department | null = null;
      if (requestedDepartmentId) {
        picked = findDepartmentInTree(store.departmentsTree, requestedDepartmentId);
      }
      if (!picked) {
        picked = store.departmentsTree[0];
      }
      selectedDepartmentId = picked.id;
      hasResolvedInitialSelection = true;
      syncSelectedDepartmentToUrl(selectedDepartmentId);
    }

    if (
      !hasAppliedInitialExpansion &&
      requestedDepartmentId &&
      selectedDepartmentId === requestedDepartmentId &&
      store.administeredDepartments.length > 0
    ) {
      const dept =
        store.administeredDepartments.find((d) => d.id === selectedDepartmentId) ??
        findDepartmentInTree(store.departmentsTree, selectedDepartmentId);
      if (dept) {
        initialExpandedDepartmentIds = getExpandedPathIds(dept, store.administeredDepartments);
        hasAppliedInitialExpansion = true;
      }
    }
  });

  function handleSelectDepartment(dept: Department) {
    unassignedSelected = false;
    selectedDepartmentId = dept.id;
    syncSelectedDepartmentToUrl(dept.id);
  }

  function handleSelectUnassigned() {
    unassignedSelected = true;
    selectedDepartmentId = null;
    syncSelectedDepartmentToUrl(null);
  }

  function handleCloseDetails() {
    selectedDepartmentId = null;
    unassignedSelected = false;
    syncSelectedDepartmentToUrl(null);
  }

  function openCreateModal() {
    createParentId = null;
    showCreateModal = true;
  }

  function handleAddSubDepartment(parent: Department) {
    createParentId = parent.id;
    showCreateModal = true;
  }

  function openEditModal(dept: Department) {
    editingDepartment = dept;
    showEditModal = true;
  }

  async function handleCreateDepartment(data: {
    name: string;
    description: string;
    parent_id: string | null;
    admin_ids: string[]
  }) {
    try {
      await departmentsStore.createDepartment(data);
      toast.success($_('admin.departments.departmentCreated'));
      showCreateModal = false;
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to create department';
      toast.error(errorMessage);
      throw error;
    }
  }

  async function handleUpdateDepartment(data: {
    name: string;
    description: string;
    parent_id: string | null;
    admin_ids: string[]
  }) {
    if (!editingDepartment) return;

    try {
      await departmentsStore.updateDepartment(editingDepartment.id, data);
      toast.success($_('admin.departments.departmentUpdated'));
      showEditModal = false;
      editingDepartment = null;
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to update department';
      toast.error(errorMessage);
      throw error;
    }
  }

  async function handleDeleteDepartment(dept: Department) {
    try {
      await departmentsStore.deleteDepartment(dept.id);
      toast.success($_('admin.departments.departmentDeleted'));
      selectedDepartmentId = null;
      syncSelectedDepartmentToUrl(null);
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to delete department';
      toast.error(errorMessage);
    }
  }

  async function handleMoveDepartment(deptId: string, newParentId: string | null) {
    try {
      await departmentsStore.moveDepartment(deptId, newParentId);
      toast.success($_('admin.departments.departmentMoved'));
    } catch (error) {
      const errorMessage = error instanceof ApiError
        ? getLocalizedError(error, 'description', $_)
        : 'Failed to move department';
      toast.error(errorMessage);
    }
  }
</script>

<div class="teams-tab">
  <!-- ===================== KPI row ===================== -->
  <div class="kpi-row">
    <div class="kpi">
      <span class="kpi__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M4 21h16M9 8h1m3 0h1M9 12h1m3 0h1M9 16h1m3 0h1M14 21v-4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4M20 21V9a1 1 0 0 0-1-1h-5"/>
        </svg>
      </span>
      <span class="kpi__text">
        <span class="kpi__value">{departmentCount}</span>
        <span class="kpi__label">{$_('admin.organization.kpiDepartments')}</span>
      </span>
    </div>
    <div class="kpi">
      <span class="kpi__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </span>
      <span class="kpi__text">
        <span class="kpi__value">{totalPeople}</span>
        <span class="kpi__label">{$_('admin.organization.kpiTotalPeople')}</span>
      </span>
    </div>
    <div class="kpi">
      <span class="kpi__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 11h6"/>
        </svg>
      </span>
      <span class="kpi__text">
        <span class="kpi__value">{unassignedCount}</span>
        <span class="kpi__label">{$_('admin.organization.unassigned')}</span>
      </span>
    </div>
    <div class="kpi">
      <span class="kpi__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      </span>
      <span class="kpi__text">
        <span class="kpi__value">{formatCurrency(budgetAllocated)}</span>
        <span class="kpi__label">{$_('admin.organization.kpiBudgetAllocated')}</span>
      </span>
    </div>
  </div>

  <!-- ===================== split ===================== -->
  <div class="split">
    <section
      class="structure"
      class:mobile-tree-collapsed={!mobileTreeExpanded}
      aria-label={$_('admin.departments.organizationStructure')}
    >
      <div class="structure__head">
        <span class="structure__title">{$_('admin.organization.structure')}</span>
        <button
          type="button"
          class="structure__toggle"
          onclick={() => (mobileTreeExpanded = !mobileTreeExpanded)}
          aria-expanded={mobileTreeExpanded}
          aria-controls="departments-tree-panel"
          aria-label={mobileTreeExpanded
            ? $_("admin.departments.collapseOrganizationTree")
            : $_("admin.departments.expandOrganizationTree")}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="structure__body" id="departments-tree-panel">
        <label class="tree-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.75" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={$_('admin.organization.findDepartmentPlaceholder')}
            aria-label={$_('admin.organization.findDepartmentPlaceholder')}
            autocomplete="off"
            bind:value={treeQuery}
          />
        </label>

        {#if store.loading && store.departmentsTree.length === 0}
          <div class="tree-state">
            <LoadingSpinner />
            <p>{$_('admin.departments.loading')}</p>
          </div>
        {:else if store.departmentsTree.length === 0}
          <div class="tree-state">
            <p class="tree-state__title">{$_('admin.departments.noDepartments')}</p>
            <p>{$_('admin.departments.noDepartmentsDescription')}</p>
            {#if canManageDepartments}
              <button type="button" class="btn-primary" onclick={openCreateModal}>
                {$_('admin.departments.createDepartment')}
              </button>
            {/if}
          </div>
        {:else if visibleTree.length === 0}
          <div class="tree-state">
            <p>{$_('admin.organization.noDepartmentsMatch')}</p>
          </div>
        {:else}
          <div class="tree-scroll">
            <div
              class="tree-list"
              bind:this={treeListElement}
              onscroll={syncTreeScrollbars}
            >
              <div
                class="tree-rows"
                role="tree"
                aria-label={$_('admin.departments.organizationStructure')}
              >
            {#each visibleTree as dept (dept.id)}
              <DepartmentTreeNode
                department={dept}
                allDepartments={store.administeredDepartments}
                onSelect={handleSelectDepartment}
                selectedId={selectedDepartment?.id}
                shouldExpandOnInitialRender={initialExpandedDepartmentIds.has(dept.id)}
                {initialExpandedDepartmentIds}
                forceExpanded={isSearchingTree}
                onMove={handleMoveDepartment}
                onEdit={openEditModal}
                onDelete={handleDeleteDepartment}
                onAddChild={handleAddSubDepartment}
                canManage={canManageDepartments}
              />
            {/each}

            {#if showUnassignedNode}
              <button
                type="button"
                class="tree-row unassigned-row"
                class:tree-row--sel={unassignedSelected}
                onclick={handleSelectUnassigned}
                aria-pressed={unassignedSelected}
              >
                <span class="tree-row__toggle"></span>
                <span class="tree-row__inner">
                  <span class="tree-avatar tree-avatar--unassigned" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <line x1="17" y1="8" x2="22" y2="13"/>
                      <line x1="22" y1="8" x2="17" y2="13"/>
                    </svg>
                  </span>
                  <span class="tree-text">
                    <span class="tree-name">{$_('admin.organization.unassigned')}</span>
                    <span class="tree-meta">{$_('admin.organization.unassignedCaption')}</span>
                  </span>
                  <span class="tree-trailing">
                    <span class="tree-count">{unassignedCount}</span>
                  </span>
                </span>
              </button>
            {/if}
              </div>
            </div>
            {#if treeScroll.v.visible}
              <div class="tree-scrollbar tree-scrollbar--v" aria-hidden="true">
                <div
                  class="tree-scrollbar__thumb"
                  style="top: {treeScroll.v.offset}px; height: {treeScroll.v.size}px"
                  onpointerdown={(event) => startThumbDrag('v', event)}
                ></div>
              </div>
            {/if}
          </div>
        {/if}

        <div class="tree-footer-block">
          {#if treeScroll.h.visible}
            <div class="tree-scrollbar tree-scrollbar--h" aria-hidden="true">
              <div
                class="tree-scrollbar__thumb"
                style="left: {treeScroll.h.offset}px; width: {treeScroll.h.size}px"
                onpointerdown={(event) => startThumbDrag('h', event)}
              ></div>
            </div>
          {/if}
          <span class="tree-footer">
            {$_('admin.organization.treeFooter', {
              values: {
                departments: departmentCount,
                levels: treeDepth,
                people: peopleInTeams,
              },
            })}
          </span>
        </div>
      </div>
    </section>

    {#if unassignedSelected}
      <section
        class="detail"
        aria-live="polite"
        aria-label={$_('admin.organization.unassigned')}
      >
        <UnassignedPanel
          users={usersStore.unassignedUsers}
          loading={usersStore.isUnassignedLoading}
          canAssign={canManageUsers}
          onClose={handleCloseDetails}
          onAssign={(user) => onAssignTeam?.(user)}
        />
      </section>
    {:else if selectedDepartment}
      <section
        class="detail"
        aria-live="polite"
        aria-label={$_('admin.departments.details')}
      >
        <DepartmentDetailsPanel
          department={selectedDepartment}
          allDepartments={store.administeredDepartments}
          onClose={handleCloseDetails}
          onEdit={openEditModal}
          onDelete={handleDeleteDepartment}
        />
      </section>
    {:else}
      <section
        class="detail detail--placeholder"
        aria-live="polite"
        aria-label={$_('admin.departments.selectDepartment')}
      >
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21V8l9-5 9 5v13"/>
              <path d="M9 21v-6h6v6"/>
            </svg>
          </span>
          <div class="empty-text">
            <span class="empty-title">{$_('admin.departments.selectDepartment')}</span>
            <span class="empty-body">{$_('admin.departments.selectDepartmentDescription')}</span>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

{#if showCreateModal}
  <DepartmentFormModal
    isOpen={showCreateModal}
    onClose={() => { showCreateModal = false; createParentId = null; }}
    onSubmit={handleCreateDepartment}
    allDepartments={store.administeredDepartments}
    presetParentId={createParentId}
    mode="create"
  />
{/if}

{#if showEditModal && editingDepartment}
  <DepartmentFormModal
    isOpen={showEditModal}
    onClose={() => { showEditModal = false; editingDepartment = null; }}
    onSubmit={handleUpdateDepartment}
    department={editingDepartment}
    allDepartments={store.administeredDepartments}
    mode="edit"
  />
{/if}

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .teams-tab {
    display: flex;
    flex-direction: column;
    gap: 28px;
    width: 100%;
    flex-grow: 1;
    min-height: 0;
    font-family: var(--gx-font);
  }

  /* ---------------- KPI row ---------------- */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .kpi {
    min-height: 73px;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 16px;
    padding: 16px;
    align-items: center;
  }

  .kpi__icon {
    width: 40px;
    align-self: stretch;
    border-radius: 8px;
    background: var(--gx-org-kpi-icon-bg);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    color: var(--gx-org-kpi-icon-fg);
  }

  .kpi__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .kpi__value {
    font-weight: 700;
    font-size: 20px;
    line-height: 100%;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .kpi__label {
    font-weight: 400;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-slate-500);
  }

  /* ---------------- split ---------------- */
  .split {
    display: flex;
    gap: 8px;
    align-items: stretch;
    align-self: stretch;
    flex-grow: 1;
    height: 639px;
  }

  .structure {
    width: 361px;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-org-hair-soft),
      var(--gx-org-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
  }

  .structure__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .structure__title {
    flex-grow: 1;
    font-weight: 700;
    font-size: 12px;
    line-height: 100%;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  .structure__toggle {
    display: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-track);
    color: var(--gx-slate-500);
    cursor: pointer;
    box-shadow: none;
    flex-shrink: 0;
  }

  .structure__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex-grow: 1;
    min-height: 0;
  }

  .tree-search {
    height: 38px;
    border-radius: 8px;
    background: var(--gx-org-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-org-hair-soft);
    display: flex;
    gap: 10px;
    padding: 0 12px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    color: var(--gx-org-slate-350);
  }

  .tree-search:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-brand-alt);
  }

  .tree-search input {
    flex-grow: 1;
    min-width: 0;
    width: 100%;
    height: auto;
    border: 0;
    outline: none;
    padding: 0;
    background: transparent;
    font-family: inherit;
    font-weight: 400;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-slate-800);
    box-shadow: none;
  }

  .tree-search input::placeholder {
    color: var(--gx-org-slate-350);
  }

  /* The scroller lives inside a positioned shell so the design's own 6px
     scrollbars can sit over the gutter instead of scrolling with the rows. */
  .tree-scroll {
    position: relative;
    display: flex;
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
  }

  .tree-list {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    flex-grow: 1;
    min-height: 0;
    min-width: 0;
    padding-right: 21px;
    overflow: auto;
    scrollbar-width: none;
  }

  .tree-list::-webkit-scrollbar {
    display: none;
  }

  /* max-content keeps deep branches on one line and scrolls sideways instead
     of crushing the name/meta column. */
  .tree-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: stretch;
    min-width: min-content;
  }

  .tree-scrollbar {
    position: absolute;
    border-radius: 3px;
    background: var(--gx-org-track);
    pointer-events: none;
  }

  .tree-scrollbar--v {
    top: 0;
    inset-inline-end: 0;
    width: 6px;
    height: 100%;
  }

  .tree-scrollbar--h {
    position: relative;
    height: 6px;
    align-self: stretch;
  }

  .tree-scrollbar__thumb {
    position: absolute;
    border-radius: 3px;
    background: var(--gx-org-thumb);
    pointer-events: auto;
    cursor: default;
    touch-action: none;
  }

  .tree-scrollbar--v .tree-scrollbar__thumb {
    inset-inline-start: 0;
    width: 6px;
  }

  .tree-scrollbar--h .tree-scrollbar__thumb {
    top: 0;
    height: 6px;
  }

  .tree-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-grow: 1;
    padding: 32px 12px;
    text-align: center;
  }

  .tree-state p {
    margin: 0;
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .tree-state__title {
    font-weight: 700;
    font-size: 14px !important;
    color: var(--gx-slate-900) !important;
  }

  .btn-primary {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-primary:hover {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  /* Unassigned row reuses the tree-row shape (styles duplicated locally because
     the real rows live in DepartmentTreeNode's own scope). */
  .tree-row {
    min-height: 48px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
    align-self: stretch;
    width: 100%;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: none;
    text-align: start;
    justify-content: flex-start;
    transition: background-color 120ms ease;
  }

  .tree-row:hover {
    background: var(--gx-org-row-hover);
    transform: none;
  }

  .tree-row--sel,
  .tree-row--sel:hover {
    background: var(--gx-org-sel);
  }

  .tree-row:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: -2px;
  }

  .unassigned-row {
    margin-top: 4px;
  }

  .tree-row__toggle {
    width: 16px;
    flex-shrink: 0;
  }

  .tree-row__inner {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-grow: 1;
    min-width: 0;
  }

  .tree-avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--gx-org-brand-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-org-brand);
  }

  .tree-avatar--unassigned {
    background: var(--gx-org-track);
    color: var(--gx-slate-500);
  }

  .tree-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .tree-name {
    font-weight: 700;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-org-slate-800);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-meta {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-slate-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-trailing {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tree-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--gx-org-brand-tint);
    color: var(--gx-org-brand);
    font-size: 11px;
    font-weight: 700;
  }

  /* Design: 12px/0 strip holding the horizontal bar and the caption. */
  .tree-footer-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
    padding-top: 12px;
    flex-shrink: 0;
  }

  .tree-footer {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-slate-400);
  }

  /* ---------------- detail panel shell ---------------- */
  .detail {
    align-self: stretch;
    overflow: hidden;
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
  }

  .detail--placeholder {
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 48px 24px;
    justify-content: center;
    align-items: center;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-slate-500);
  }

  .empty-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    text-align: center;
  }

  .empty-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .empty-body {
    font-weight: 400;
    font-size: 13px;
    line-height: 130%;
    color: var(--gx-slate-500);
  }

  @media (max-width: 1024px) {
    .teams-tab {
      gap: 20px;
    }

    .split {
      flex-direction: column;
      height: auto;
      min-height: 0;
    }

    .structure {
      width: 100%;
      max-height: 60vh;
    }

    .structure__toggle {
      display: flex;
    }

    .structure.mobile-tree-collapsed .structure__body {
      display: none;
    }

    .detail {
      min-height: 420px;
    }
  }
</style>
