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
  }
  
  let { isOpen, onClose, onSubmit, department = null, allDepartments, mode }: Props = $props();
  
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
          parent_id: null,
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
  title={mode === 'create' ? $_('admin.departments.createDepartment') : $_('admin.departments.editDepartment')}
>
  <form class="department-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
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
      <textarea
        id="description"
        bind:value={formData.description}
        placeholder={$_('admin.departments.descriptionPlaceholder')}
        rows="3"
        disabled={isSubmitting}
      ></textarea>
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
      <span class="help-text">{$_('admin.departments.parentDepartmentHelp')}</span>
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
  .department-form {
    padding: 20px;
  }
  
  .form-group {
    margin-bottom: 20px;
  }
  
  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 6px;
  }
  
  .required {
    color: #ef4444;
  }
  
  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--button-bg);
    transition: border-color 0.2s;
  }
  
  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: var(--btn-secondary);
  }
  
  .form-group input.error {
    border-color: var(--brand-red);
  }
  
  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: var(--btn-quaternary);
    cursor: not-allowed;
    opacity: 0.6;
  }
  
  .error-message {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--brand-red);
  }
  
  .help-text {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--glass-stroke-dark);
  }
  
  .btn-secondary {
    padding: 10px 20px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }
  
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-primary {
    padding: 10px 20px;
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
