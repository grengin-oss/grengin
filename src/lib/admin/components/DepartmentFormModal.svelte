<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import type { Department } from "../types.js";
  import Modal from "./Modal.svelte";
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  
  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; description: string; parent_id: string | null; admin_ids: string[] }) => Promise<void>;
    department?: Department | null;
    allDepartments: Department[];
    mode: 'create' | 'edit';
    /** Preselects the parent when creating from a branch's "Add sub-department". */
    presetParentId?: string | null;
  }
  
  let {
    isOpen,
    onClose,
    onSubmit,
    department = null,
    allDepartments,
    mode,
    presetParentId = null,
  }: Props = $props();
  
  let formData = $state({
    name: '',
    description: '',
    parent_id: null as string | null,
    admin_ids: [] as string[],
  });

  let nameInput = $state<HTMLInputElement | null>(null);
  
  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);
  
  $effect(() => {
    if (isOpen) {
      if (mode === 'edit' && department) {
        formData = {
          name: department.name,
          description: department.description,
          parent_id: department.parent_id,
          admin_ids: [...department.admin_ids],
        };
      } else {
        formData = {
          name: '',
          description: '',
          parent_id: presetParentId,
          admin_ids: [],
        };
      }
      formErrors = {};
      tick().then(() => {
        nameInput?.focus({ preventScroll: true });
      });
    }
  });
  
  const availableParents = $derived(
    allDepartments.filter(d => {
      if (mode === 'edit' && department) {
        return d.id !== department.id && !isDescendant(department.id, d.id);
      }
      return true;
    })
  );
  
  function isDescendant(ancestorId: string, descendantId: string): boolean {
    let current = allDepartments.find(d => d.id === descendantId);
    while (current) {
      if (current.parent_id === ancestorId) return true;
      current = allDepartments.find(d => d.id === current!.parent_id);
    }
    return false;
  }
  
  function validateForm(): boolean {
    formErrors = {};
    
    if (!formData.name.trim()) {
      formErrors.name = $_('admin.departments.nameRequired');
    }
    
    return Object.keys(formErrors).length === 0;
  }
  
  async function handleSubmit() {
    if (!validateForm()) return;
    
    isSubmitting = true;
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Failed to submit department:', error);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Modal 
  {isOpen}
  onclose={onClose}
  variant="organization"
  title={mode === 'create' ? $_('admin.departments.createDepartment') : $_('admin.departments.editDepartment')}
>
  <form class="department-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
    <div class="form-fields">
    <div class="form-group">
      <label for="name">
        {$_('admin.common.name')} <span class="required">*</span>
      </label>
      <input
        id="name"
        type="text"
        bind:value={formData.name}
        placeholder={$_('admin.departments.namePlaceholder')}
        class:error={formErrors.name}
        disabled={isSubmitting}
        bind:this={nameInput}
      />
      {#if formErrors.name}
        <span class="error-message">{formErrors.name}</span>
      {/if}
    </div>
    
    <div class="form-group">
      <label for="description">
        {$_('admin.departments.description')}
      </label>
      <input
        id="description"
        type="text"
        bind:value={formData.description}
        placeholder={$_('admin.departments.descriptionPlaceholder')}
        disabled={isSubmitting}
      />
    </div>
    
    <div class="form-group">
      <label for="parent">
        {$_('admin.departments.parentDepartment')}
      </label>
      <select
        id="parent"
        bind:value={formData.parent_id}
        disabled={isSubmitting}
      >
        <option value={null}>{$_('admin.departments.noneTopLevel')}</option>
        {#each availableParents as parent}
          <option value={parent.id}>{parent.name}</option>
        {/each}
      </select>
    </div>
    </div>

    <div class="form-actions">
      <button 
        type="button" 
        class="btn-secondary" 
        onclick={onClose}
        disabled={isSubmitting}
      >
        {$_('common.cancel')}
      </button>
      <button 
        type="submit" 
        class="btn-primary"
        disabled={isSubmitting}
      >
        {isSubmitting ? (mode === 'create' ? $_('admin.common.creating') : $_('admin.common.saving')) : (mode === 'create' ? $_('admin.common.create') : $_('common.save'))}
      </button>
    </div>
  </form>
</Modal>

<style>
  /* app.css gives every button backdrop-filter: blur(); on the flat
     Organization surfaces that repaints the 1px hairlines behind them
     (the tab-row ring, the tree's branch rails), so switch it off. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Organization design (organization.html .edit-modal): 424px card, 24px
     rhythm, 37px fields. The Modal shell paints the card itself. */
  .department-form {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 0;
    font-family: var(--gx-font);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-self: stretch;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-self: stretch;
    margin: 0;
  }

  .form-group label {
    display: flex;
    align-items: center;
    gap: 2px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-slate-900);
  }

  .required {
    color: var(--gx-org-danger);
  }

  .form-group input,
  .form-group select {
    width: 100%;
    height: 37px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    padding: 10px 14px;
    font-family: inherit;
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-slate-900);
    transition: box-shadow 120ms ease;
  }

  .form-group input::placeholder {
    color: var(--gx-slate-400);
  }

  .form-group select {
    appearance: none;
    -webkit-appearance: none;
    padding-inline-end: 36px;
    cursor: pointer;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='7' viewBox='0 0 14 7' fill='none'%3E%3Cpath d='M1 1l6 5 6-5' stroke='%230f172a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
  }

  :global([dir="rtl"]) .form-group select {
    background-position: left 14px center;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--gx-org-brand-alt);
  }

  .form-group input.error {
    box-shadow: inset 0 0 0 1px var(--gx-org-danger);
  }

  .form-group input:disabled,
  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    font-size: 12px;
    line-height: 130%;
    color: var(--gx-org-danger);
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    align-self: stretch;
  }

  .btn-secondary,
  .btn-primary {
    height: 35px;
    border: 0;
    border-radius: 8px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition: background-color 120ms ease;
  }

  .btn-secondary {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-slate-500);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--gx-org-track);
    transform: none;
  }

  .btn-primary {
    background: var(--gx-org-brand);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-org-brand-hover);
    transform: none;
  }

  .btn-secondary:disabled,
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
