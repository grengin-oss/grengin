<script lang="ts">
  import type { McpAccessType, McpPermission, McpAccessRuleCreatePayload } from '../../types.js';
  import type { Role } from '../../../api/admin/roles.js';
  import type { User, Department } from '../../types.js';
  import Modal from '../Modal.svelte';
  import { _ } from 'svelte-i18n';
  import { untrack } from 'svelte';
  import { getRoles } from '../../../api/admin/roles.js';
  import { getUsers } from '../../../api/admin/users.js';
  import { getDepartmentsTree } from '../../../api/admin/departments.js';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (rule: McpAccessRuleCreatePayload) => void;
    isSubmitting?: boolean;
  }

  let { isOpen = $bindable(), onClose, onAdd, isSubmitting = false }: Props = $props();

  let accessType = $state<McpAccessType>('role');
  let permission = $state<McpPermission>('full');
  let inheritDepartments = $state(true);

  let selectedRoleId = $state('');
  let selectedRoleName = $state('');
  let selectedDepartmentId = $state('');
  let selectedUserId = $state('');

  let roles = $state<Role[]>([]);
  let departments = $state<Department[]>([]);
  let users = $state<User[]>([]);
  let userSearchQuery = $state('');
  let userSearchTimeout: ReturnType<typeof setTimeout> | undefined;

  let loadingRoles = $state(false);
  let loadingDepartments = $state(false);
  let loadingUsers = $state(false);

  let formError = $state('');

  $effect(() => {
    if (isOpen) {
      untrack(() => {
        resetForm();
        loadRoles();
        loadDepartmentsData();
      });
    }
  });

  function resetForm() {
    accessType = 'role';
    permission = 'full';
    inheritDepartments = true;
    selectedRoleId = '';
    selectedRoleName = '';
    selectedDepartmentId = '';
    selectedUserId = '';
    userSearchQuery = '';
    users = [];
    formError = '';
  }

  async function loadRoles() {
    if (loadingRoles) return;
    loadingRoles = true;
    try {
      const response = await getRoles();
      roles = response.roles;
    } catch {
      roles = [];
    } finally {
      loadingRoles = false;
    }
  }

  function flattenDepartments(nodes: Department[], depth: number = 0): Department[] {
    let result: Department[] = [];
    for (const node of nodes) {
      result.push({ ...node, depth });
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenDepartments(node.children, depth + 1));
      }
    }
    return result;
  }

  async function loadDepartmentsData() {
    if (loadingDepartments) return;
    loadingDepartments = true;
    try {
      const response = await getDepartmentsTree();
      departments = flattenDepartments(response.tree);
    } catch {
      departments = [];
    } finally {
      loadingDepartments = false;
    }
  }

  function handleUserSearch() {
    if (userSearchTimeout) clearTimeout(userSearchTimeout);
    if (!userSearchQuery.trim()) {
      users = [];
      return;
    }
    userSearchTimeout = setTimeout(async () => {
      loadingUsers = true;
      try {
        const response = await getUsers({ search: userSearchQuery.trim(), limit: 10 });
        users = response.users;
      } catch {
        users = [];
      } finally {
        loadingUsers = false;
      }
    }, 300);
  }

  function selectRole(role: Role) {
    selectedRoleId = role.id;
    selectedRoleName = role.name;
  }

  function selectUser(user: User) {
    selectedUserId = user.id;
    userSearchQuery = user.email;
    users = [];
  }

  function validate(): boolean {
    formError = '';
    if (accessType === 'role' && !selectedRoleId) {
      formError = $_('admin.mcpAccess.validation.selectRole');
      return false;
    }
    if (accessType === 'department' && !selectedDepartmentId) {
      formError = $_('admin.mcpAccess.validation.selectDepartment');
      return false;
    }
    if (accessType === 'user' && !selectedUserId) {
      formError = $_('admin.mcpAccess.validation.selectUser');
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate() || isSubmitting) return;

    const rule: McpAccessRuleCreatePayload = {
      access_type: accessType,
      permission,
    };

    if (accessType === 'role') {
      rule.role_id = selectedRoleId;
      rule.role_name = selectedRoleName;
    } else if (accessType === 'department') {
      rule.department_id = selectedDepartmentId;
      rule.inherit_departments = inheritDepartments;
    } else if (accessType === 'user') {
      rule.user_id = selectedUserId;
    }

    onAdd(rule);
  }
</script>

<Modal
  title={$_('admin.mcpAccess.addRule')}
  {isOpen}
  onclose={onClose}
>
  {#snippet children()}
    <form class="access-rule-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>

      <div class="form-section">
        <label class="form-label">{$_('admin.mcpAccess.ruleType')}</label>
        <div class="radio-group">
          <label class="radio-option" class:radio-option--active={accessType === 'role'}>
            <input type="radio" name="access_type" value="role" bind:group={accessType} />
            <div class="radio-icon radio-icon--role">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span>{$_('admin.mcpAccess.types.role')}</span>
          </label>
          <label class="radio-option" class:radio-option--active={accessType === 'department'}>
            <input type="radio" name="access_type" value="department" bind:group={accessType} />
            <div class="radio-icon radio-icon--department">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <span>{$_('admin.mcpAccess.types.department')}</span>
          </label>
          <label class="radio-option" class:radio-option--active={accessType === 'user'}>
            <input type="radio" name="access_type" value="user" bind:group={accessType} />
            <div class="radio-icon radio-icon--user">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <span>{$_('admin.mcpAccess.types.user')}</span>
          </label>
        </div>
      </div>

      <div class="form-section">
        {#if accessType === 'role'}
          <label class="form-label" for="role-select">{$_('admin.mcpAccess.selectRole')}</label>
          {#if loadingRoles}
            <div class="select-loading">{$_('common.loading')}</div>
          {:else}
            <select id="role-select" class="form-select" bind:value={selectedRoleId} onchange={() => {
              const r = roles.find(r => r.id === selectedRoleId);
              if (r) selectedRoleName = r.name;
            }}>
              <option value="">{$_('admin.mcpAccess.placeholders.role')}</option>
              {#each roles as role (role.id)}
                <option value={role.id}>{role.name}</option>
              {/each}
            </select>
          {/if}
        {:else if accessType === 'department'}
          <label class="form-label" for="dept-select">{$_('admin.mcpAccess.selectDepartment')}</label>
          {#if loadingDepartments}
            <div class="select-loading">{$_('common.loading')}</div>
          {:else}
            <select id="dept-select" class="form-select" bind:value={selectedDepartmentId}>
              <option value="">{$_('admin.mcpAccess.placeholders.department')}</option>
              {#each departments as dept (dept.id)}
                <option value={dept.id}>
                  {'\u00A0\u00A0\u00A0\u00A0'.repeat(dept.depth)}{dept.name}
                </option>
              {/each}
            </select>
            <label class="checkbox-option">
              <input type="checkbox" bind:checked={inheritDepartments} />
              <span>{$_('admin.mcpAccess.includeSubDepartments')}</span>
            </label>
          {/if}
        {:else if accessType === 'user'}
          <label class="form-label" for="user-search">{$_('admin.mcpAccess.searchUser')}</label>
          <div class="user-search-wrapper">
            <input
              id="user-search"
              type="text"
              class="form-input"
              placeholder={$_('admin.mcpAccess.placeholders.user')}
              bind:value={userSearchQuery}
              oninput={handleUserSearch}
              autocomplete="off"
            />
            {#if loadingUsers}
              <div class="search-spinner-container">
                <span class="search-spinner"></span>
              </div>
            {/if}
            {#if users.length > 0 && !selectedUserId}
              <div class="user-search-results">
                {#each users as user (user.id)}
                  <button
                    type="button"
                    class="user-search-item"
                    onclick={() => selectUser(user)}
                  >
                    <span class="user-search-name">{user.name || user.email}</span>
                    {#if user.name}
                      <span class="user-search-email">{user.email}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="form-section">
        <label class="form-label">{$_('admin.mcpAccess.permission')}</label>
        <div class="permission-options">
          <label class="permission-option" class:permission-option--active={permission === 'full'}>
            <input type="radio" name="permission" value="full" bind:group={permission} />
            <div class="permission-content">
              <span class="permission-name permission-name--full">{$_('admin.mcpAccess.permissions.full')}</span>
              <span class="permission-desc">{$_('admin.mcpAccess.permissions.fullDesc')}</span>
            </div>
          </label>
          <label class="permission-option" class:permission-option--active={permission === 'read_only'}>
            <input type="radio" name="permission" value="read_only" bind:group={permission} />
            <div class="permission-content">
              <span class="permission-name permission-name--read-only">{$_('admin.mcpAccess.permissions.readOnly')}</span>
              <span class="permission-desc">{$_('admin.mcpAccess.permissions.readOnlyDesc')}</span>
            </div>
          </label>
          <label class="permission-option" class:permission-option--active={permission === 'denied'}>
            <input type="radio" name="permission" value="denied" bind:group={permission} />
            <div class="permission-content">
              <span class="permission-name permission-name--denied">{$_('admin.mcpAccess.permissions.denied')}</span>
              <span class="permission-desc">{$_('admin.mcpAccess.permissions.deniedDesc')}</span>
            </div>
          </label>
        </div>
      </div>

      {#if formError}
        <div class="form-error">{formError}</div>
      {/if}

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={onClose} disabled={isSubmitting}>
          {$_('common.cancel')}
        </button>
        <button type="submit" class="btn-accent" disabled={isSubmitting}>
          {#if isSubmitting}
            {$_('admin.mcpAccess.adding')}
          {:else}
            {$_('admin.mcpAccess.addRule')}
          {/if}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .access-rule-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .radio-group {
    display: flex;
    gap: var(--space-sm);
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    padding: var(--space-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
  }

  .radio-option input[type="radio"] {
    display: none;
  }

  .radio-option:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(var(--glass-tint), 0.03);
  }

  .radio-option--active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.06);
  }

  .radio-option span {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .radio-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .radio-icon--role {
    background: rgba(139, 92, 246, 0.12);
    color: #a78bfa;
  }

  .radio-icon--department {
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
  }

  .radio-icon--user {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
  }

  .form-select {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s ease;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6,9 12,15 18,9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }

  .form-select:focus {
    border-color: var(--brand);
  }

  .form-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .form-input:focus {
    border-color: var(--brand);
  }

  .form-input::placeholder {
    color: var(--text-tertiary);
  }

  .select-loading {
    padding: var(--space-sm);
    font-size: 0.8125rem;
    color: var(--text-tertiary);
  }

  .checkbox-option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    margin-top: var(--space-xs);
  }

  .checkbox-option input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .checkbox-option span {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .user-search-wrapper {
    position: relative;
  }

  .search-spinner-container {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .search-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(224, 224, 224, 0.4);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .user-search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-primary);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  }

  .user-search-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    color: var(--text-primary);
  }

  .user-search-item:hover {
    background: rgba(var(--glass-tint), 0.06);
  }

  .user-search-item:last-child {
    border-bottom: none;
  }

  .user-search-name {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .user-search-email {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .permission-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .permission-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-md);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .permission-option input[type="radio"] {
    display: none;
  }

  .permission-option:hover {
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(var(--glass-tint), 0.03);
  }

  .permission-option--active {
    border-color: var(--brand);
    background: rgba(var(--brand-rgb), 0.04);
  }

  .permission-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .permission-name {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .permission-name--full { color: #34d399; }
  .permission-name--read-only { color: #60a5fa; }
  .permission-name--denied { color: #f87171; }

  .permission-desc {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    line-height: 1.4;
  }

  .form-error {
    padding: var(--space-sm) var(--space-md);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-sm);
    color: #f87171;
    font-size: 0.8125rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 640px) {
    .radio-group {
      flex-direction: column;
    }
  }
</style>
