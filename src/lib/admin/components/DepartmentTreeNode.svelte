<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department } from "../types.js";
  import DepartmentTreeNode from './DepartmentTreeNode.svelte';
  import { formatCurrency } from "$lib/utils/format.js";
  import { _ } from "svelte-i18n";

  interface Props {
    department: Department;
    allDepartments?: Department[];
    onSelect: (dept: Department) => void;
    selectedId?: string;
    shouldExpandOnInitialRender?: boolean;
    initialExpandedDepartmentIds?: Set<string>;
    /** Search mode: every branch stays open so matches are reachable. */
    forceExpanded?: boolean;
    onMove?: (deptId: string, newParentId: string | null) => void;
    onEdit?: (dept: Department) => void;
    onDelete?: (dept: Department) => void;
    /** Renders the design's "Add sub-department" row under an expanded branch. */
    onAddChild?: (parent: Department) => void;
    canManage?: boolean;
    /** Nesting depth inside the rendered tree (0 = root row). */
    level?: number;
  }

  let {
    department,
    allDepartments = [],
    onSelect,
    selectedId,
    shouldExpandOnInitialRender = false,
    initialExpandedDepartmentIds = new Set<string>(),
    forceExpanded = false,
    onMove,
    onEdit,
    onDelete,
    onAddChild,
    canManage = false,
    level = 0,
  }: Props = $props();

  let isExpanded = $state(shouldExpandOnInitialRender);
  let isDragOver = $state(false);
  let menuOpen = $state(false);
  const hasChildren = $derived((department.children?.length ?? 0) > 0);
  const expanded = $derived(forceExpanded || isExpanded);

  /** Design step: one 24px spacer per level (24 / 48 / 72 …). */
  const indent = $derived(level * 24);

  const initial = $derived((department.name?.trim()?.[0] ?? "?").toUpperCase());

  const budgetStatus = $derived.by(() => {
    const usagePercent = department.budget_allocated > 0
      ? (department.budget_used / department.budget_allocated) * 100
      : 0;

    if (usagePercent >= 100) return 'exceeded';
    if (usagePercent >= 80) return 'warning';
    return 'ok';
  });

  function toggleExpand() {
    isExpanded = !expanded;
  }

  function handleSelect() {
    onSelect(department);
  }

  function handleNodeKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      handleSelect();
    }
  }

  function handleDragStart(e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', department.id);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;

    const draggedId = e.dataTransfer?.getData('text/plain');
    if (draggedId && draggedId !== department.id && onMove) {
      const draggedDept = allDepartments.find(d => d.id === draggedId);
      if (draggedDept && !isDescendant(draggedId, department.id)) {
        onMove(draggedId, department.id);
      }
    }
  }

  function isDescendant(ancestorId: string, descendantId: string): boolean {
    let current = allDepartments.find(d => d.id === descendantId);
    while (current) {
      if (current.parent_id === ancestorId) return true;
      current = allDepartments.find(d => d.id === current!.parent_id);
    }
    return false;
  }

  function getChildrenContainerId() {
    return `department-children-${department.id}`;
  }

  function getBudgetStatusDescription() {
    return $_(`admin.departments.budgetStatus.${budgetStatus}`);
  }

  function getMemberCountLabel() {
    return $_('admin.departments.memberCount', { values: { count: department.member_count } });
  }

  function getTreeItemLabel() {
    return `${department.name}, ${getMemberCountLabel()}, ${getBudgetStatusDescription()}`;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function handleWindowClick() {
    if (menuOpen) menuOpen = false;
  }

  // Expand this node only from initial, precomputed selected path.
  $effect(() => {
    if (shouldExpandOnInitialRender && department.children?.length) {
      isExpanded = true;
    }
  });
</script>

<svelte:window onclick={handleWindowClick} />

<div class="department-node" role="presentation">
  <div
    class="tree-row"
    class:tree-row--sel={selectedId === department.id}
    class:tree-row--drag={isDragOver}
    draggable="true"
    ondragstart={handleDragStart}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="treeitem"
    aria-label={getTreeItemLabel()}
    aria-level={level + 1}
    aria-selected={selectedId === department.id}
    aria-expanded={hasChildren ? expanded : undefined}
    tabindex="0"
    onclick={handleSelect}
    onkeydown={handleNodeKeydown}
  >
    {#if indent > 0}
      <span class="tree-row__indent" style="width: {indent}px" aria-hidden="true"></span>
    {/if}

    {#if hasChildren}
      <button
        type="button"
        class="tree-row__toggle"
        class:tree-row__toggle--closed={!expanded}
        onclick={(e) => { e.stopPropagation(); toggleExpand(); }}
        onkeydown={(e) => e.stopPropagation()}
        aria-controls={getChildrenContainerId()}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? $_("admin.departments.collapseDepartment")
            : $_("admin.departments.expandDepartment")
        }
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d={expanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"}
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    {:else}
      <span class="tree-row__toggle tree-row__toggle--empty" aria-hidden="true"></span>
    {/if}

    <span class="tree-row__inner">
      <span class="tree-avatar" aria-hidden="true">{initial}</span>
      <span class="tree-text">
        <span class="tree-name" title={department.name}>{department.name}</span>
        <span class="tree-meta">
          {getMemberCountLabel()}
          &nbsp;·&nbsp;
          {formatCurrency(department.budget_used)} / {formatCurrency(department.budget_allocated)}
        </span>
      </span>
      <span class="tree-trailing">
        <span class={`tree-dot tree-dot--${budgetStatus}`} aria-hidden="true"></span>
        <span class="sr-only">{getBudgetStatusDescription()}</span>
        {#if canManage && (onEdit || onDelete)}
          <span class="tree-menu">
            <button
              type="button"
              class="tree-kebab"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={$_('admin.organization.departmentActions', { values: { name: department.name } })}
              onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
              onkeydown={(e) => e.stopPropagation()}
            >
              <i></i><i></i><i></i>
            </button>
            {#if menuOpen}
              <div class="tree-menu__list" role="menu">
                {#if onEdit}
                  <button
                    type="button"
                    role="menuitem"
                    onclick={(e) => { e.stopPropagation(); closeMenu(); onEdit?.(department); }}
                  >
                    {$_('admin.departments.editDepartment')}
                  </button>
                {/if}
                {#if onDelete}
                  <button
                    type="button"
                    role="menuitem"
                    class="danger"
                    onclick={(e) => { e.stopPropagation(); closeMenu(); onDelete?.(department); }}
                  >
                    {$_('admin.departments.deleteDepartment')}
                  </button>
                {/if}
              </div>
            {/if}
          </span>
        {/if}
      </span>
    </span>
  </div>

  {#if expanded && hasChildren}
    <div
      class="children"
      id={getChildrenContainerId()}
      role="group"
      aria-label={`${department.name} ${$_('admin.departments.childDepartments')}`}
      style="--branch-x: {level === 0 ? 20 : 28 + 24 * level}px; --branch-end: {canManage && onAddChild ? '11px' : '23px'}"
    >
      {#each department.children ?? [] as child (child.id)}
        <DepartmentTreeNode
          department={child}
          {allDepartments}
          {onSelect}
          {selectedId}
          shouldExpandOnInitialRender={initialExpandedDepartmentIds.has(child.id)}
          {initialExpandedDepartmentIds}
          {forceExpanded}
          {onMove}
          {onEdit}
          {onDelete}
          {canManage}
          level={level + 1}
          {onAddChild}
        />
      {/each}

      {#if canManage && onAddChild}
        <button
          type="button"
          class="tree-add"
          style="padding-inline-start: {28 + 24 * (level + 1)}px"
          onclick={(e) => { e.stopPropagation(); onAddChild?.(department); }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <span>{$_('admin.organization.addSubDepartment')}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .department-node {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: var(--gx-font);
  }

  /* Branch guide: one rail per expanded branch, dropping from the parent's own
     chevron column (design x = 19 / 52 / 77) so it never crosses the child
     rows' arrows, and stopping inside the last item of the branch. */
  .children {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .children::before {
    content: "";
    position: absolute;
    inset-inline-start: var(--branch-x);
    top: -4px;
    bottom: var(--branch-end);
    width: 1px;
    background: var(--gx-org-tree-line);
    pointer-events: none;
  }

  .tree-row {
    position: relative;
    min-height: 48px;
    border-radius: 8px;
    background: transparent;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
    width: 100%;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .tree-row:hover {
    background: var(--gx-org-row-hover);
  }

  .tree-row--sel,
  .tree-row--sel:hover {
    background: var(--gx-org-sel);
  }

  .tree-row--drag {
    background: var(--gx-org-sel-hover);
    outline: 1px dashed var(--gx-org-brand-alt);
    outline-offset: -1px;
  }

  .tree-row:focus-visible {
    outline: 2px solid var(--gx-org-brand-alt);
    outline-offset: -2px;
  }

  .tree-row__toggle {
    width: 16px;
    height: 12px;
    padding: 0;
    border: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    flex-shrink: 0;
    background: transparent;
    box-shadow: none;
    color: var(--gx-slate-500);
    cursor: pointer;
  }

  .tree-row__toggle--closed {
    color: var(--gx-slate-400);
  }

  .tree-row__toggle:hover {
    color: var(--gx-org-slate-800);
    background: transparent;
    transform: none;
  }

  .tree-row__toggle--empty {
    cursor: default;
  }

  .tree-row__indent {
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
    background: var(--gx-org-blue-tint);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-blue-fg);
  }

  /* inline-size containment keeps the label column out of the row's
     intrinsic width, so the tree's min-content width is driven by the indent
     plus this 92px floor — deeper branches scroll sideways instead of
     shrinking the labels away. */
  .tree-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 92px;
    contain: inline-size;
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
    gap: 12px;
    align-items: center;
    flex-shrink: 0;
  }

  .tree-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tree-dot--ok {
    background: var(--gx-org-brand-alt);
  }

  .tree-dot--warning {
    background: var(--gx-org-warn);
  }

  .tree-dot--exceeded {
    background: var(--gx-org-danger);
  }

  /* "Add sub-department" action closing an expanded branch (design: 12/600
     brand-alt label with a 10px plus, indented to the child column). */
  .tree-add {
    display: flex;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    padding: 4px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    box-shadow: none;
    font-family: inherit;
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-org-brand-alt);
    cursor: pointer;
    justify-content: flex-start;
    text-align: start;
    transition: background-color 120ms ease;
  }

  .tree-add:hover {
    background: var(--gx-org-row-hover);
    color: var(--gx-org-brand);
    transform: none;
  }

  .tree-add svg {
    flex-shrink: 0;
  }

  .tree-menu {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tree-kebab {
    width: 10px;
    height: 18px;
    padding: 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    cursor: pointer;
  }

  .tree-kebab:hover {
    background: var(--gx-org-track);
    transform: none;
  }

  .tree-kebab i {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: var(--gx-slate-400);
  }

  .tree-menu__list {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-end: 0;
    z-index: 20;
    min-width: 168px;
    padding: 4px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-hair),
      0 8px 20px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
  }

  .tree-menu__list button {
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    box-shadow: none;
    display: flex;
    justify-content: flex-start;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--gx-org-slate-800);
    cursor: pointer;
    text-align: start;
  }

  .tree-menu__list button:hover {
    background: var(--gx-org-track);
    transform: none;
  }

  .tree-menu__list button.danger {
    color: var(--gx-org-danger);
  }

  .tree-menu__list button.danger:hover {
    background: var(--gx-org-danger-bg);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
