<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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

  const typeChoices: { value: McpAccessType; labelKey: string }[] = [
    { value: 'role', labelKey: 'admin.mcpAccess.types.role' },
    { value: 'department', labelKey: 'admin.mcpAccess.types.department' },
    { value: 'user', labelKey: 'admin.mcpAccess.types.user' },
  ];

  const permissionChoices: { value: McpPermission; labelKey: string; descKey: string }[] = [
    { value: 'full', labelKey: 'admin.mcpAccess.permissions.full', descKey: 'admin.mcpAccess.permissions.fullDesc' },
    { value: 'read_only', labelKey: 'admin.mcpAccess.permissions.readOnly', descKey: 'admin.mcpAccess.permissions.readOnlyDesc' },
    { value: 'denied', labelKey: 'admin.mcpAccess.permissions.denied', descKey: 'admin.mcpAccess.permissions.deniedDesc' },
  ];

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

  function selectType(value: McpAccessType) {
    if (accessType === value) return;
    accessType = value;
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
    // Typing again after a pick clears it, so the rule can never carry a user
    // the field no longer names.
    selectedUserId = '';
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

<!-- "MODAL: Add Rule" — mcp-server-detail.html -->
<Modal
  title={$_('admin.mcpAccess.addRule')}
  {isOpen}
  onclose={onClose}
  variant="mcp-access"
>
  {#snippet children()}
    <form
      class="rule-form"
      id="mcp-add-rule-form"
      onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
    >
      <!-- ".type-choices" -->
      <fieldset class="field">
        <legend class="field-label">{$_('admin.mcpAccess.ruleType')}</legend>
        <div class="type-choices">
          {#each typeChoices as choice (choice.value)}
            <button
              class="type-choice"
              type="button"
              data-selected={accessType === choice.value}
              aria-pressed={accessType === choice.value}
              onclick={() => selectType(choice.value)}
            >
              {$_(choice.labelKey)}
            </button>
          {/each}
        </div>
      </fieldset>

      <!-- ".dd-select" — the context picker the chosen type calls for -->
      <div class="field">
        {#if accessType === 'role'}
          <label class="field-label" for="mcp-rule-role">{$_('admin.mcpAccess.selectRole')}</label>
          {#if loadingRoles}
            <div class="field-loading">{$_('common.loading')}</div>
          {:else}
            <select
              id="mcp-rule-role"
              class="dd-select"
              bind:value={selectedRoleId}
              onchange={() => {
                const r = roles.find((r) => r.id === selectedRoleId);
                selectedRoleName = r ? r.name : '';
              }}
            >
              <option value="">{$_('admin.mcpAccess.placeholders.role')}</option>
              {#each roles as role (role.id)}
                <option value={role.id}>{role.name}</option>
              {/each}
            </select>
          {/if}
        {:else if accessType === 'department'}
          <label class="field-label" for="mcp-rule-dept">{$_('admin.mcpAccess.selectDepartment')}</label>
          {#if loadingDepartments}
            <div class="field-loading">{$_('common.loading')}</div>
          {:else}
            <select id="mcp-rule-dept" class="dd-select" bind:value={selectedDepartmentId}>
              <option value="">{$_('admin.mcpAccess.placeholders.department')}</option>
              {#each departments as dept (dept.id)}
                <option value={dept.id}>
                  {'    '.repeat(dept.depth ?? 0)}{dept.name}
                </option>
              {/each}
            </select>
            <label class="check-row">
              <input type="checkbox" bind:checked={inheritDepartments} />
              <span>{$_('admin.mcpAccess.includeSubDepartments')}</span>
            </label>
          {/if}
        {:else}
          <label class="field-label" for="mcp-rule-user">{$_('admin.mcpAccess.searchUser')}</label>
          <div class="user-search">
            <input
              id="mcp-rule-user"
              type="text"
              class="dd-select dd-select--input"
              placeholder={$_('admin.mcpAccess.placeholders.user')}
              bind:value={userSearchQuery}
              oninput={handleUserSearch}
              autocomplete="off"
            />
            {#if loadingUsers}
              <span class="user-search-spinner" aria-hidden="true"></span>
            {/if}
            {#if users.length > 0 && !selectedUserId}
              <div class="user-results">
                {#each users as user (user.id)}
                  <button type="button" class="user-result" onclick={() => selectUser(user)}>
                    <span class="user-result-name">{user.name || user.email}</span>
                    {#if user.name}
                      <span class="user-result-email">{user.email}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ".perm-choice" list -->
      <fieldset class="field">
        <legend class="field-label">{$_('admin.mcpAccess.permission')}</legend>
        <div class="perm-choices">
          {#each permissionChoices as choice (choice.value)}
            <label class="perm-choice" data-selected={permission === choice.value}>
              <input type="radio" name="mcp_rule_permission" value={choice.value} bind:group={permission} />
              <span class="perm-radio"></span>
              <span class="perm-copy">
                <span class="perm-title-row">
                  <span
                    class="perm-dot"
                    class:perm-dot--full={choice.value === 'full'}
                    class:perm-dot--read-only={choice.value === 'read_only'}
                    class:perm-dot--denied={choice.value === 'denied'}
                  ></span>
                  <span class="perm-title">{$_(choice.labelKey)}</span>
                </span>
                <span class="perm-desc">{$_(choice.descKey)}</span>
              </span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if formError}
        <p class="form-error" role="alert">{formError}</p>
      {/if}
    </form>
  {/snippet}

  {#snippet footer()}
    <button class="btn-cancel" type="button" onclick={onClose} disabled={isSubmitting}>
      {$_('common.cancel')}
    </button>
    <button class="btn-primary" type="submit" form="mcp-add-rule-form" disabled={isSubmitting}>
      {isSubmitting ? $_('admin.mcpAccess.adding') : $_('admin.mcpAccess.addRule')}
    </button>
  {/snippet}
</Modal>

<style>
  /* ===== mcp-server-detail.html "MODAL: Add Rule", transcribed. The card
     itself (560px, gradient rule, 32px gutters) is Modal's "mcp-access"
     variant; this sheet is only its contents. ===== */
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
    cursor: pointer;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* Bare element selectors, so the .dd-select skin below still wins. */
  input,
  select {
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

  input:focus,
  select:focus {
    background: transparent;
    box-shadow: none;
  }

  .rule-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-self: stretch;
    width: 100%;
    font-family: var(--gx-font);
  }

  .field {
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .field-label {
    display: block;
    padding: 0;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
    margin-bottom: 8px;
  }

  .field-loading {
    font-size: 13px;
    color: var(--gx-mcp-m-placeholder);
    padding: 10px 13px;
  }

  /* ---------------- ".type-choices" ---------------- */
  .type-choices {
    display: flex;
    gap: 10px;
  }

  .type-choice {
    flex: 1 1 0;
    min-width: 0;
    border-radius: 10px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 12px;
    text-align: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-label);
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease,
      color 120ms ease;
  }

  .type-choice[data-selected="true"] {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-accent);
    background: color-mix(in oklab, var(--gx-tx-accent) 8%, var(--gx-surface));
    color: var(--gx-tx-accent);
  }

  .type-choice:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  /* ---------------- ".dd-select" ---------------- */
  .dd-select {
    width: 100%;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-ring);
    padding: 10px 13px;
    font-family: inherit;
    font-weight: 400;
    font-size: 14px;
    line-height: 1.2;
    color: var(--gx-mcp-m-ink);
    appearance: none;
  }

  .dd-select:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 1px;
  }

  .dd-select--input::placeholder {
    color: var(--gx-mcp-m-placeholder);
  }

  select.dd-select {
    /* Room for the caret the design draws on the right of the field. */
    padding-inline-end: 32px;
    background-image: linear-gradient(
        45deg,
        transparent 50%,
        var(--gx-mcp-m-placeholder) 50%
      ),
      linear-gradient(135deg, var(--gx-mcp-m-placeholder) 50%, transparent 50%);
    background-position:
      right 16px center,
      right 11px center;
    background-size:
      5px 5px,
      5px 5px;
    background-repeat: no-repeat;
  }

  :global([dir="rtl"]) select.dd-select {
    background-position:
      left 11px center,
      left 16px center;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--gx-mcp-m-label);
    cursor: pointer;
  }

  .check-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    accent-color: var(--gx-tx-accent);
    cursor: pointer;
  }

  /* ---------------- user typeahead ---------------- */
  .user-search {
    position: relative;
  }

  .user-search-spinner {
    position: absolute;
    inset-inline-end: 12px;
    top: 50%;
    margin-top: -7px;
    width: 14px;
    height: 14px;
    border: 2px solid var(--gx-mcp-m-ring);
    border-top-color: var(--gx-tx-accent);
    border-radius: 50%;
    animation: user-spin 0.6s linear infinite;
  }

  @keyframes user-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .user-results {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 4px);
    z-index: 2;
    max-height: 200px;
    overflow-y: auto;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow:
      inset 0 0 0 1px var(--gx-mcp-m-ring),
      var(--gx-mcp-panel-shadow);
    display: flex;
    flex-direction: column;
    padding: 4px;
  }

  .user-result {
    display: flex;
    flex-direction: column;
    /* app.css centres every bare button's flex children; these read as text. */
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 6px;
    white-space: normal;
    transition: background-color 120ms ease;
  }

  .user-result:hover {
    background: var(--gx-mcp-m-hair);
  }

  .user-result-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-mcp-m-ink);
  }

  .user-result-email {
    font-size: 11px;
    color: var(--gx-mcp-m-placeholder);
  }

  /* ---------------- ".perm-choice" ---------------- */
  .perm-choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .perm-choice {
    border-radius: 12px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1.5px var(--gx-mcp-m-ring);
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    align-items: center;
    cursor: pointer;
    transition:
      box-shadow 120ms ease,
      background-color 120ms ease;
  }

  .perm-choice input[type="radio"] {
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

  .perm-choice[data-selected="true"] {
    box-shadow: inset 0 0 0 1.5px var(--gx-tx-accent);
    background: color-mix(in oklab, var(--gx-tx-accent) 6%, var(--gx-surface));
  }

  .perm-choice:focus-within {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  .perm-radio {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px var(--gx-mcp-m-ring);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-surface);
  }

  .perm-choice[data-selected="true"] .perm-radio {
    box-shadow: none;
    background: var(--gx-tx-accent);
  }

  .perm-choice[data-selected="true"] .perm-radio::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gx-surface);
  }

  .perm-copy {
    flex-grow: 1;
    min-width: 0;
  }

  .perm-title-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
  }

  .perm-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .perm-dot--full {
    background: var(--gx-mcpd-perm-full);
  }

  .perm-dot--read-only {
    background: var(--gx-mcpd-perm-read);
  }

  .perm-dot--denied {
    background: var(--gx-mcpd-perm-denied);
  }

  .perm-title {
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-ink);
  }

  .perm-desc {
    display: block;
    font-weight: 400;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-m-placeholder);
  }

  .form-error {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--gx-mcp-err-fg);
  }

  /* ---------------- footer actions ---------------- */
  .btn-cancel {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-surface);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-m-cancel-ring);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-mcp-m-cancel-fg);
    transition: background-color 120ms ease;
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-mcp-m-hair);
  }

  .btn-primary {
    height: 33px;
    border-radius: 8px;
    background: var(--gx-vdt-cta);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-surface);
    transition: background-color 120ms ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--gx-mcpd-cta-hover);
  }

  .btn-cancel:focus-visible,
  .btn-primary:focus-visible {
    outline: 2px solid var(--gx-tx-accent);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .type-choices {
      flex-direction: column;
    }
  }
</style>
