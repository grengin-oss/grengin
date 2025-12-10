<script lang="ts">
  import { onMount } from "svelte";
  import AdminEmptyState from "./AdminEmptyState.svelte";
  import AdminPanelCard from "./AdminPanelCard.svelte";
  import AdminSectionHeader from "./AdminSectionHeader.svelte";
  import AdminTableCard from "./AdminTableCard.svelte";
  import LoadingSpinner from "./LoadingSpinner.svelte";
  import Modal from "./Modal.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import type { RateLimit } from "../types.js";
  import {
    getRateLimits,
    createRateLimit,
    updateRateLimit,
    deleteRateLimit,
  } from "../../api/adminSettings.js";

  const scopeOptions = [
    { value: "", label: "All Scopes" },
    { value: "global", label: "Global" },
    { value: "user", label: "User" },
    { value: "provider", label: "Provider" },
  ];

  const scopeFormOptions = [
    { value: "global", label: "Global" },
    { value: "user", label: "User" },
    { value: "provider", label: "Provider" },
  ];

  let rateLimits = $state<RateLimit[]>([]);
  let loading = $state(true);
  let showModal = $state(false);
  let editingRateLimit = $state<RateLimit | null>(null);
  let filterScope = $state("");

  let formData = $state({
    scope: "global",
    scope_id: "",
    requests_per_minute: 60,
    requests_per_hour: "",
    requests_per_day: "",
    tokens_per_day: "",
    is_active: true,
  });

  let filteredRateLimits = $derived.by(() => {
    if (!filterScope) return rateLimits;
    return rateLimits.filter((rl) => rl.scope === filterScope);
  });

  async function loadRateLimits() {
    try {
      loading = true;
      rateLimits = await getRateLimits();
    } catch (err: any) {
      toast.error(err.message || "Failed to load rate limits");
    } finally {
      loading = false;
    }
  }

  function openAddModal() {
    editingRateLimit = null;
    formData = {
      scope: "global",
      scope_id: "",
      requests_per_minute: 60,
      requests_per_hour: "",
      requests_per_day: "",
      tokens_per_day: "",
      is_active: true,
    };
    showModal = true;
  }

  function openEditModal(rateLimit: RateLimit) {
    editingRateLimit = rateLimit;
    formData = {
      scope: rateLimit.scope,
      scope_id: rateLimit.scope_id || "",
      requests_per_minute: rateLimit.requests_per_minute,
      requests_per_hour: rateLimit.requests_per_hour?.toString() || "",
      requests_per_day: rateLimit.requests_per_day?.toString() || "",
      tokens_per_day: rateLimit.tokens_per_day?.toString() || "",
      is_active: rateLimit.is_active,
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingRateLimit = null;
  }

  async function handleSubmit() {
    try {
      const data = {
        scope: formData.scope,
        scope_id: formData.scope !== "global" && formData.scope_id ? formData.scope_id : undefined,
        requests_per_minute: formData.requests_per_minute,
        requests_per_hour: formData.requests_per_hour ? parseInt(formData.requests_per_hour.toString()) : undefined,
        requests_per_day: formData.requests_per_day ? parseInt(formData.requests_per_day.toString()) : undefined,
        tokens_per_day: formData.tokens_per_day ? parseInt(formData.tokens_per_day.toString()) : undefined,
        is_active: formData.is_active,
      };

      if (editingRateLimit) {
        await updateRateLimit(editingRateLimit.id, data);
      } else {
        await createRateLimit(data);
      }

      toast.success(editingRateLimit ? "Rate limit updated" : "Rate limit created");
      await loadRateLimits();
      closeModal();
    } catch (err: any) {
      toast.error(err.message || "Failed to save rate limit");
    }
  }

  async function handleDelete(limitId: string) {
    if (!confirm("Are you sure you want to delete this rate limit?")) {
      return;
    }
    try {
      await deleteRateLimit(limitId);
      toast.success("Rate limit deleted");
      await loadRateLimits();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete rate limit");
    }
  }

  async function toggleStatus(rateLimit: RateLimit) {
    try {
      await updateRateLimit(rateLimit.id, { is_active: !rateLimit.is_active });
      await loadRateLimits();
    } catch (err: any) {
      toast.error(err.message || "Failed to update rate limit status");
    }
  }

  function formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined) return "-";
    return value.toLocaleString();
  }

  function getScopeLabel(scope: string): string {
    const option = scopeFormOptions.find((o) => o.value === scope);
    return option?.label || scope;
  }

  onMount(() => {
    loadRateLimits();
  });
</script>

<div class="rate-limits-container">
  <AdminSectionHeader
    title="Rate Limits"
    subtitle="Configure request and token limits globally or for specific scopes."
  >
    {#snippet actions()}
      <button class="btn-primary" onclick={openAddModal}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create Rate Limit
      </button>
    {/snippet}
  </AdminSectionHeader>

  <AdminPanelCard>
    <div class="filter-row">
      <div class="filter-group">
        <label for="filter-scope">Filter Scope</label>
        <select id="filter-scope" bind:value={filterScope}>
          {#each scopeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>
  </AdminPanelCard>

  {#if loading}
    <AdminPanelCard>
      <LoadingSpinner text="Loading rate limits..." />
    </AdminPanelCard>
  {:else if filteredRateLimits.length === 0}
    <AdminPanelCard>
      <AdminEmptyState
        title={filterScope ? `No rate limits for ${getScopeLabel(filterScope)}` : "No rate limits configured"}
        message="Create and manage limits to protect your usage."
      >
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        {/snippet}
        {#snippet actions()}
          <button class="btn-primary" onclick={openAddModal}>
            Create Your First Rate Limit
          </button>
        {/snippet}
      </AdminEmptyState>
    </AdminPanelCard>
  {:else}
    <AdminTableCard minWidth="980px">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Scope ID</th>
            <th>Req/Min</th>
            <th>Req/Hour</th>
            <th>Req/Day</th>
            <th>Tokens/Day</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredRateLimits as limit (limit.id)}
            <tr>
              <td class="scope-cell">
                <span class="scope-label">{getScopeLabel(limit.scope)}</span>
              </td>
              <td class="scope-id-cell">
                <span class="scope-id-text">{limit.scope_id || "-"}</span>
              </td>
              <td class="numeric-cell">
                {formatNumber(limit.requests_per_minute)}
              </td>
              <td class="numeric-cell">
                {formatNumber(limit.requests_per_hour)}
              </td>
              <td class="numeric-cell">
                {formatNumber(limit.requests_per_day)}
              </td>
              <td class="numeric-cell">
                {formatNumber(limit.tokens_per_day)}
              </td>
              <td>
                <button
                  class="status-toggle"
                  class:active={limit.is_active}
                  onclick={() => toggleStatus(limit)}
                  aria-label={limit.is_active ? "Active" : "Inactive"}
                >
                  <span class="toggle-label">{limit.is_active ? "ON" : "OFF"}</span>
                  <span class="toggle-slider"></span>
                </button>
              </td>
              <td>
                <div class="actions">
                  <button
                    class="action-btn edit-btn"
                    onclick={() => openEditModal(limit)}
                    aria-label="Edit rate limit"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    class="action-btn delete-btn"
                    onclick={() => handleDelete(limit.id)}
                    aria-label="Delete rate limit"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>
  {/if}
</div>

<Modal
  bind:isOpen={showModal}
  title={editingRateLimit ? "Edit Rate Limit" : "Create Rate Limit"}
  onclose={closeModal}
>
  {#snippet children()}
    <form class="limit-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-group">
        <label for="scope">Scope</label>
        <select
          id="scope"
          bind:value={formData.scope}
          disabled={!!editingRateLimit}
          required
        >
          {#each scopeFormOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="scope_id">Scope ID</label>
        <input
          type="text"
          id="scope_id"
          bind:value={formData.scope_id}
          placeholder={formData.scope === "global" ? "-" : formData.scope === "user" ? "e.g., user@example.com" : "e.g., openai"}
          disabled={formData.scope === "global"}
        />
      </div>

      <div class="form-group">
        <label for="requests_per_minute">
          Requests per Minute <span class="required">(Required)</span>
        </label>
        <input
          type="number"
          id="requests_per_minute"
          bind:value={formData.requests_per_minute}
          placeholder="e.g., 60"
          min="1"
          required
        />
      </div>

      <div class="form-group">
        <label for="requests_per_hour">Requests per Hour (optional)</label>
        <input
          type="number"
          id="requests_per_hour"
          bind:value={formData.requests_per_hour}
          placeholder=""
          min="1"
        />
        <p class="form-help">Defaults to [60x/1440x] minute rate if left blank.</p>
      </div>

      <div class="form-group">
        <label for="requests_per_day">Requests per Day (optional)</label>
        <input
          type="number"
          id="requests_per_day"
          bind:value={formData.requests_per_day}
          placeholder=""
          min="1"
        />
        <p class="form-help">Defaults to [60x/1440x] minute rate if left blank.</p>
      </div>

      <div class="form-group">
        <label for="tokens_per_day">Tokens per Day (optional)</label>
        <input
          type="number"
          id="tokens_per_day"
          bind:value={formData.tokens_per_day}
          placeholder=""
          min="1"
        />
      </div>

      <div class="form-group">
        <label for="status">Status</label>
        <div class="status-toggle-wrapper">
          <button
            type="button"
            class="status-toggle"
            class:active={formData.is_active}
            onclick={() => (formData.is_active = !formData.is_active)}
            aria-label={formData.is_active ? "Active" : "Inactive"}
          >
            <span class="toggle-label">{formData.is_active ? "ON" : "OFF"}</span>
            <span class="toggle-slider"></span>
          </button>
          <span class="status-label">- {formData.is_active ? "Active" : "Inactive"}</span>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary">
          {editingRateLimit ? "Save Changes" : "Create"}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .rate-limits-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .filter-row {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .filter-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .filter-group select {
    padding: var(--space-sm) var(--space-md);
    padding-right: var(--space-2xl);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    min-width: 10rem;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
  }

  .filter-group select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .scope-cell {
    font-weight: 500;
  }

  .scope-label {
    font-size: 0.9375rem;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .scope-id-cell {
    font-family: "Courier New", monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .scope-id-text {
    display: inline-block;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .numeric-cell {
    font-family: "Courier New", monospace;
    font-size: 0.875rem;
    color: var(--text-primary);
    text-align: center;
  }

  .status-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 3.5rem;
    height: 1.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: background 0.2s ease;
    margin-right: var(--space-sm);
    padding-left: 0.25rem;
  }

  .status-toggle.active {
    background: var(--brand-green);
  }

  .toggle-label {
    font-size: 0.625rem;
    font-weight: 700;
    color: white;
    z-index: 1;
    margin-left: 0.125rem;
  }

  .toggle-slider {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(2rem);
  }

  .status-toggle.active .toggle-label {
    margin-left: 0.125rem;
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .edit-btn {
    background: rgba(var(--brand-rgb), 0.1);
    color: var(--brand);
  }

  .edit-btn:hover {
    background: rgba(var(--brand-rgb), 0.2);
  }

  .delete-btn {
    background: rgba(var(--brand-red-rgb), 0.1);
    color: var(--brand-red);
  }

  .delete-btn:hover {
    background: rgba(var(--brand-red-rgb), 0.2);
  }

  .limit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .form-group .required {
    color: var(--brand-green);
    font-weight: 400;
  }

  .form-group input,
  .form-group select {
    padding: var(--space-md);
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    transition: all 0.2s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--brand);
    background: rgba(var(--glass-tint), 0.05);
  }

  .form-group input::placeholder {
    color: var(--text-secondary);
    opacity: 0.5;
  }

  .form-group input:disabled,
  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-help {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .status-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .status-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    margin-top: var(--space-lg);
    padding-top: var(--space-lg);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    .filter-row {
      justify-content: flex-start;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
