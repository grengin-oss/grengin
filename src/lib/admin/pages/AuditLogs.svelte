<script lang="ts">
  import { onMount } from "svelte";
  import { auditLogsStore } from "../stores/index.js";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import { formatDate, formatNumber } from "../../utils/format.js";
  import { exportAuditLogs } from "../../api/admin/auditLogs.js";

  let filtersOpen = $state(false);
  let searchQuery = $state("");
  let filterAction = $state("");
  let filterStartDate = $state("");
  let filterEndDate = $state("");
  let debounceTimeout: number | null = null;
  let isExporting = $state(false);
  let expandedRowId = $state<string | null>(null);
  let detailTabs = $state<Record<string, 'json' | 'visualized'>>({});
  let activeDetailTab = $state<Record<string, 'json' | 'visualized'>>({});
  let expandedDetails = $state<Record<string, boolean>>({});



  onMount(() => {
    auditLogsStore.fetchLogs();
    auditLogsStore.fetchActionTypes();
  });

  // Handle errors with toast
  $effect(() => {
    if (auditLogsStore.error) {
      const errorMessage =
        auditLogsStore.error instanceof ApiError
          ? getLocalizedError(auditLogsStore.error, "description", $_)
          : auditLogsStore.error.message;
      toast.error(errorMessage || $_("admin.auditLogs.failedToLoad"));
      auditLogsStore.clearError();
    }
  });

  // Handle action types fetch errors
  $effect(() => {
    if (auditLogsStore.actionTypesError) {
      const errorMessage =
        auditLogsStore.actionTypesError instanceof ApiError
          ? getLocalizedError(auditLogsStore.actionTypesError, "description", $_)
          : auditLogsStore.actionTypesError.message;
      toast.error(errorMessage || $_("admin.auditLogs.failedToLoad"));
      auditLogsStore.clearActionTypesError();
    }
  });

  function applyFilters() {
    auditLogsStore.setFilters({
      userId: searchQuery,
      action: filterAction,
      startDate: filterStartDate,
      endDate: filterEndDate,
    });
  }

  function applyFiltersDebounced() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      applyFilters();
    }, 500);
  }

  function clearFilters() {
    searchQuery = "";
    filterAction = "";
    filterStartDate = "";
    filterEndDate = "";
    auditLogsStore.setFilters({
      userId: "",
      action: "",
      startDate: "",
      endDate: "",
    });
  }

  function handlePageChange(page: number) {
    auditLogsStore.setPage(page);
  }

  function toggleRowDetails(id: string) {
    expandedRowId = expandedRowId === id ? null : id;
    if (expandedRowId === id) {
      initializeDetailTabs(id);
    }
  }

  async function handleExport(format: "csv" | "json") {
    isExporting = true;
    try {
      const params = auditLogsStore.getFilterParams();
      const blob = await exportAuditLogs(params, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      link.download = `audit-logs-${timestamp}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success($_("admin.auditLogs.exportSuccess"));
    } catch (err: any) {
      const errorMessage =
        err instanceof ApiError
          ? getLocalizedError(err, "description", $_)
          : err.message;
      toast.error(errorMessage || $_("admin.auditLogs.exportFailed"));
    } finally {
      isExporting = false;
    }
  }

  function getLocalizedAction(action: string, translate: (key: string, options?: { values?: Record<string, string> }) => string = $_): string {
    if (!action) return '';
    
    const key = `admin.auditLogs.actions.${action}`;
    
    // Get translated text with parameter substitution (same pattern as getLocalizedError)
    const translated = translate(key, { values: {} });
    
    // If translation returns the key itself (not found), return the original action
    return translated === key ? action : translated;
  }

  function initializeDetailTabs(logId: string) {
    if (!detailTabs[logId]) {
      detailTabs[logId] = 'visualized';
      activeDetailTab[logId] = 'visualized';
    }
  }

  function setDetailTab(logId: string, tab: 'json' | 'visualized') {
    activeDetailTab[logId] = tab;
  }

  function toggleExpandedDetails(logId: string) {
    expandedDetails[logId] = !expandedDetails[logId];
  }

  function formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ')
      .trim();
  }

  function getDataType(value: any): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }

  function renderDetailValue(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `${Object.keys(value).length} properties`;
    if (typeof value === 'string') {
      return value.length > 100 ? `${value.substring(0, 100)}...` : value;
    }
    return String(value);
  }

  function getActionBadgeClass(action: string): string {
    if (action.includes("created") || action.includes("assigned")) return "badge-create";
    if (action.includes("deleted") || action.includes("removed") || action.includes("disconnected") || action.includes("redacted"))
      return "badge-delete";
    if (action.includes("updated") || action.includes("status") || action.includes("moved") || action.includes("synced") || action.includes("rotated"))
      return "badge-update";
    if (action === "login" || action.includes("authorized")) return "badge-assign";
    if (action.includes("sent") || action.includes("uploaded") || action.includes("submitted"))
      return "badge-info";
    return "badge-default";
  }

  const currentPage = $derived(auditLogsStore.page);
  const totalPages = $derived(
    Math.ceil(auditLogsStore.total / auditLogsStore.limit),
  );
</script>

<div class="audit-logs-container">
  <PageHeader
    title={$_("admin.auditLogs.title")}
    subtitle={$_("admin.auditLogs.subtitle")}
  >
    {#snippet children()}
      <div class="export-buttons">
        <button
          type="button"
          class="btn-export"
          onclick={() => handleExport("csv")}
          disabled={isExporting || auditLogsStore.items.length === 0}
          aria-label={$_("admin.auditLogs.exportCsv")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {$_("admin.auditLogs.exportCsv")}
        </button>
        <button
          type="button"
          class="btn-export"
          onclick={() => handleExport("json")}
          disabled={isExporting || auditLogsStore.items.length === 0}
          aria-label={$_("admin.auditLogs.exportJson")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {$_("admin.auditLogs.exportJson")}
        </button>
      </div>
    {/snippet}
  </PageHeader>

  <!-- Filters -->
  <div class="filters-section" aria-label={$_("admin.auditLogs.filters")}>
    <button
      class="filter-toggle-btn"
      class:open={filtersOpen}
      onclick={() => (filtersOpen = !filtersOpen)}
      aria-label={filtersOpen
        ? $_("admin.auditLogs.closeFilters")
        : $_("admin.auditLogs.openFilters")}
      aria-expanded={filtersOpen}
      aria-controls="filters-grid"
    >
      {#if filtersOpen}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M10 6l-5 5M10 6l5 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {:else}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M2.5 5h15M5 10h10M7.5 15h5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="15" cy="5" r="2" fill="currentColor" />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
          <circle cx="5" cy="15" r="2" fill="currentColor" />
        </svg>
        {$_("admin.auditLogs.filters")}
      {/if}
    </button>
    <div class="filters-grid" class:open={filtersOpen} id="filters-grid">
      <div class="filter-group">
        <label for="user-search" class="filter-label">{$_("admin.auditLogs.searchByUserId")}</label>
        <input
          id="user-search"
          type="text"
          placeholder={$_("admin.auditLogs.searchByUserId")}
          bind:value={searchQuery}
          oninput={applyFiltersDebounced}
          class="filter-input"
          aria-label={$_("admin.auditLogs.searchByUserId")}
        />
      </div>
      <div class="filter-group">
        <label for="action-filter" class="filter-label">{$_("admin.auditLogs.filterByAction")}</label>
        <select
          id="action-filter"
          bind:value={filterAction}
          class="filter-select"
          onchange={applyFilters}
          aria-label={$_("admin.auditLogs.filterByAction")}
        >
          <option value="">{$_("admin.auditLogs.allActions")}</option>
          {#each auditLogsStore.actionTypes as action}
            <option value={action}>{getLocalizedAction(action)}</option>
          {/each}
        </select>
      </div>
      <div class="date-filter-group">
        <div class="date-input-wrapper">
          <label for="start-date" class="filter-label">{$_("admin.auditLogs.startDate")}</label>
          <input
            id="start-date"
            type="date"
            bind:value={filterStartDate}
            onchange={applyFilters}
            class="filter-input date-input"
            aria-label={$_("admin.auditLogs.startDate")}
          />
        </div>
        <span class="date-separator">to</span>
        <div class="date-input-wrapper">
          <label for="end-date" class="filter-label">{$_("admin.auditLogs.endDate")}</label>
          <input
            id="end-date"
            type="date"
            bind:value={filterEndDate}
            onchange={applyFilters}
            class="filter-input date-input"
            aria-label={$_("admin.auditLogs.endDate")}
          />
        </div>
      </div>
          </div>
  </div>

  {#if auditLogsStore.isLoading}
    <LoadingSpinner size="lg" text={$_("admin.auditLogs.loading")} />
  {:else if auditLogsStore.items.length === 0}
    <AdminEmptyState
      title={$_("admin.auditLogs.emptyTitle")}
      message={$_("admin.auditLogs.emptyMessage")}
    >
      {#snippet icon()}
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      {/snippet}
    </AdminEmptyState>
  {:else}
    <!-- Audit Logs Table -->
    <AdminTableCard minWidth="960px">
      <table
        class="admin-table audit-logs-table"
        aria-label={$_("admin.auditLogs.title")}
      >
        <thead>
          <tr>
            <th scope="col">{$_("admin.auditLogs.columns.timestamp")}</th>
            <th scope="col">{$_("admin.auditLogs.columns.userId")}</th>
            <th scope="col">{$_("admin.auditLogs.columns.action")}</th>
            <th scope="col">{$_("admin.auditLogs.columns.resourceType")}</th>
            <th scope="col">{$_("admin.auditLogs.columns.resourceId")}</th>
            <th scope="col">{$_("admin.auditLogs.columns.ipAddress")}</th>
          </tr>
        </thead>
        <tbody>
          {#each auditLogsStore.items as log (log.id)}
            <tr
              class="log-row"
              class:expanded={expandedRowId === log.id}
              onclick={() => toggleRowDetails(log.id)}
              role="button"
              tabindex="0"
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggleRowDetails(log.id);
              }}
            >
              <td>
                <span class="timestamp">
                  {formatDate(log.createdAt, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </td>
              <td>
                <span class="user-id" title={log.userId || "—"}>
                  {log.userId ? log.userId.slice(0, 8) + "…" : "—"}
                </span>
              </td>
              <td>
                <span class="action-badge {getActionBadgeClass(log.action)}" title={log.action}>
                  {getLocalizedAction(log.action)}
                </span>
              </td>
              <td>
                <span class="resource-type">{log.resourceType}</span>
              </td>
              <td>
                <span class="resource-id" title={log.resourceId}>
                  {log.resourceId ? log.resourceId.slice(0, 8) + "…" : "—"}
                </span>
              </td>
              <td>
                <span class="ip-address">{log.ipAddress || "—"}</span>
              </td>
            </tr>
            {#if expandedRowId === log.id}
              <tr class="expanded-row">
                <td colspan="6">
                  <div class="expanded-details">
                    <div class="detail-grid">
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.userId")}</span
                        >
                        <span class="detail-value mono">{log.userId}</span>
                      </div>
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.action")}</span
                        >
                        <span class="detail-value">{log.action}</span>
                      </div>
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.resourceType")}</span
                        >
                        <span class="detail-value">{log.resourceType}</span>
                      </div>
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.resourceId")}</span
                        >
                        <span class="detail-value mono"
                          >{log.resourceId || "—"}</span
                        >
                      </div>
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.ipAddress")}</span
                        >
                        <span class="detail-value mono"
                          >{log.ipAddress || "—"}</span
                        >
                      </div>
                      <div class="detail-item">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.userAgent")}</span
                        >
                        <span class="detail-value mono"
                          >{log.userAgent || "—"}</span
                        >
                      </div>
                      <div class="detail-item full-width">
                        <span class="detail-label"
                          >{$_("admin.auditLogs.columns.details")}</span
                        >
                        <div class="detail-tabs">
                          <div class="tab-content-wrapper">
                            {#if activeDetailTab[log.id] === 'visualized'}
                              <div class="visualized-details">
                                {#if log.details && typeof log.details === 'object'}
                                  <div class="property-inspector">
                                    {#each Object.entries(log.details) as [key, value]}
                                      <div class="property-row">
                                        <div class="property-key">{formatKey(key)}</div>
                                        <div class="property-value">
                                          {#if typeof value === 'string'}
                                            <span class="value-string">"{value}"</span>
                                          {:else if typeof value === 'number'}
                                            <span class="value-number">{value}</span>
                                          {:else if typeof value === 'boolean'}
                                            <span class="value-boolean">{value ? 'true' : 'false'}</span>
                                          {:else if Array.isArray(value)}
                                            <div class="value-array">
                                              <div class="array-summary">Array[{value.length}]</div>
                                              {#if value.length > 0}
                                                <div class="array-items">
                                                  {#each (expandedDetails[log.id] ? value : value.slice(0, 3)) as item}
                                                    <div class="array-item">
                                                      {#if typeof item === 'string'}
                                                        "{item}"
                                                      {:else if typeof item === 'object' && item !== null}
                                                        Object({Object.keys(item).length} props)
                                                      {:else}
                                                        {item}
                                                      {/if}
                                                    </div>
                                                  {/each}
                                                  {#if value.length > 3 && !expandedDetails[log.id]}
                                                    <button class="array-more-btn" onclick={() => toggleExpandedDetails(log.id)}>
                                                      +{value.length - 3} more...
                                                    </button>
                                                  {:else if value.length > 3 && expandedDetails[log.id]}
                                                    <button class="array-more-btn" onclick={() => toggleExpandedDetails(log.id)}>
                                                      Show less
                                                    </button>
                                                  {/if}
                                                </div>
                                              {/if}
                                            </div>
                                          {:else if typeof value === 'object' && value !== null}
                                            {@const objectEntries = Object.entries(value)}
                                            <div class="value-object">
                                              <div class="object-summary">Object({Object.keys(value).length} props)</div>
                                              <div class="object-props">
                                                {#each (expandedDetails[log.id] ? objectEntries : objectEntries.slice(0, 3)) as [objKey, objValue]}
                                                  <div class="object-prop">
                                                    <span class="object-prop-key">{objKey}:</span>
                                                    <span class="object-prop-value">
                                                      {#if typeof objValue === 'string'}
                                                        "{objValue}"
                                                      {:else}
                                                        {objValue}
                                                      {/if}
                                                    </span>
                                                  </div>
                                                {/each}
                                                {#if objectEntries.length > 3 && !expandedDetails[log.id]}
                                                  <button class="object-more-btn" onclick={() => toggleExpandedDetails(log.id)}>
                                                    +{objectEntries.length - 3} more...
                                                  </button>
                                                {:else if objectEntries.length > 3 && expandedDetails[log.id]}
                                                  <button class="object-more-btn" onclick={() => toggleExpandedDetails(log.id)}>
                                                    Show less
                                                  </button>
                                                {/if}
                                              </div>
                                            </div>
                                          {:else}
                                            <span class="value-null">{value}</span>
                                          {/if}
                                        </div>
                                      </div>
                                    {/each}
                                  </div>
                                {:else}
                                  <div class="no-details">
                                    <div class="no-details-text">
                                      {log.details || "No details available"}
                                    </div>
                                  </div>
                                {/if}
                              </div>
                            {:else if activeDetailTab[log.id] === 'json'}
                              <div class="json-details">
                                <pre class="detail-value detail-json">{JSON.stringify(log.details, null, 2) || "-"}</pre>
                              </div>
                            {/if}
                          </div>
                          <div class="tab-headers-right">
                            <button
                              class="tab-header-small"
                              class:active={activeDetailTab[log.id] === 'visualized'}
                              onclick={() => setDetailTab(log.id, 'visualized')}
                              aria-label="Visualized view"
                              aria-pressed={activeDetailTab[log.id] === 'visualized'}
                              title="Visualized view"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="7" height="7"/>
                                <rect x="14" y="3" width="7" height="7"/>
                                <rect x="14" y="14" width="7" height="7"/>
                                <rect x="3" y="14" width="7" height="7"/>
                              </svg>
                            </button>
                            <button
                              class="tab-header-small"
                              class:active={activeDetailTab[log.id] === 'json'}
                              onclick={() => setDetailTab(log.id, 'json')}
                              aria-label="JSON view"
                              aria-pressed={activeDetailTab[log.id] === 'json'}
                              title="JSON view"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {:else}
            <tr>
              <td colspan="6" class="empty-state">
                {$_("admin.auditLogs.noLogsFound")}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </AdminTableCard>

    <!-- Pagination -->
    {#if totalPages > 1}
      <nav
        class="pagination"
        aria-label={$_("admin.common.pagination")}
      >
        <button
          class="btn"
          onclick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={$_("admin.common.previousPage")}
        >
          {$_("admin.common.previous")}
        </button>
        <span class="pagination-info" role="status" aria-live="polite">
          {$_("admin.common.pageInfo", {
            values: {
              current: formatNumber(currentPage),
              total: formatNumber(totalPages),
              count: formatNumber(auditLogsStore.total),
            },
          })}
        </span>
        <button
          class="btn"
          onclick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={$_("admin.common.nextPage")}
        >
          {$_("admin.common.next")}
        </button>
      </nav>
    {/if}
  {/if}
</div>

<style>
  .audit-logs-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
    overflow-y: auto;
  }

  /* Export Buttons */
  .export-buttons {
    display: flex;
    gap: var(--space-sm);
  }

  .btn-export {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: var(--space-sm) var(--space-md);
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .btn-export:hover:not(:disabled) {
    color: var(--brand);
    border-color: var(--brand);
  }

  .btn-export:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-export svg {
    flex-shrink: 0;
  }

  /* Filters */
  .filters-section {
    padding: var(--space-xl);
    margin: var(--space-md) 0;
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    position: relative;
  }

  .filter-toggle-btn {
    display: none;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: auto;
  }

  .filter-toggle-btn:hover {
    background: var(--btn-secondary);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .filter-toggle-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .filter-toggle-btn svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-lg);
    align-items: start;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .filter-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }

  .filter-input,
  .filter-select {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .filter-input:focus,
  .filter-select:focus {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-color: var(--brand);
  }

  .filter-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .date-filter-group {
    display: flex;
    align-items: end;
    gap: var(--space-sm);
    grid-column: span 1;
  }

  .date-input-wrapper {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .date-input {
    width: 100%;
  }

  .date-separator {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    padding-bottom: var(--space-sm);
    flex-shrink: 0;
  }

  
  /* Table Styles */
  .log-row {
    cursor: pointer;
  }

  .log-row:hover {
    background: rgba(var(--glass-tint), 0.05) !important;
  }

  .log-row.expanded {
    background: rgba(var(--glass-tint), 0.04);
  }

  .timestamp {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .user-id {
    font-family: var(--font-mono, monospace);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .action-badge {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .badge-create {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
  }

  .badge-delete {
    background: color-mix(in oklab, var(--brand-red) 15%, var(--button-bg));
    color: var(--brand-red);
  }

  .badge-update {
    background: color-mix(in oklab, #f59e0b 15%, var(--button-bg));
    color: #f59e0b;
  }

  .badge-assign {
    background: color-mix(in oklab, var(--brand) 15%, var(--button-bg));
    color: var(--brand);
  }

  .badge-info {
    background: color-mix(in oklab, #6366f1 15%, var(--button-bg));
    color: #6366f1;
  }

  .badge-default {
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
  }

  .resource-type {
    font-size: 0.8125rem;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .resource-id {
    font-family: var(--font-mono, monospace);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .ip-address {
    font-family: var(--font-mono, monospace);
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .details-preview {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  /* Expanded Row */
  .expanded-row td {
    padding: 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .expanded-details {
    padding: var(--space-lg) var(--space-xl);
    background: rgba(var(--glass-tint), 0.02);
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-md);
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-item.full-width {
    grid-column: 1 / -1;
  }

  .detail-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .detail-value {
    font-size: 0.8125rem;
    color: var(--text-primary);
    word-break: break-all;
  }

  .detail-value.mono {
    font-family: var(--font-mono, monospace);
  }

  .detail-json {
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
    margin: 0;
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: var(--space-3xl) !important;
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    margin-top: var(--space-xl);
  }

  .pagination-info {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .pagination .btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    .filters-section {
      display: flex;
      flex-direction: column;
    }

    .filter-toggle-btn {
      display: flex;
      align-self: flex-end;
    }

    .filter-toggle-btn.open {
      padding: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .filters-grid {
      grid-template-columns: 1fr;
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      margin-bottom: 0;
      padding: 2px;
      transform: translateY(-10px);
      transition:
        max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        margin-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .filters-grid.open {
      max-height: 1000px;
      opacity: 1;
      transform: translateY(0);
    }

    .date-filter-group {
      flex-direction: column;
      gap: var(--space-sm);
    }

    .date-separator {
      display: none;
    }

    .pagination {
      gap: var(--space-md);
    }

    .export-buttons {
      flex-wrap: wrap;
    }

    .audit-logs-container {
      padding: var(--space-lg);
    }
  }

  /* Detail Tabs */
  .detail-tabs {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: flex;
  }

  .tab-content-wrapper {
    flex: 1;
    padding: var(--space-md);
    min-height: 60px;
  }

  .tab-headers-right {
    display: flex;
    flex-direction: column;
    background: rgba(var(--glass-tint), 0.04);
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    padding: 4px;
    gap: 2px;
    width: 36px;
  }

  .tab-header-small {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    border-radius: var(--radius-sm);
    padding: 0;
    margin: 0 auto;
  }

  .tab-header-small:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.08);
  }

  .tab-header-small.active {
    color: var(--brand);
    background: rgba(var(--brand), 0.1);
  }

  .tab-header-small:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }

  .tab-header-small svg {
    width: 12px;
    height: 12px;
  }

  .visualized-details {
    .property-inspector {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .property-row {
      display: flex;
      background: rgba(var(--glass-tint), 0.02);
      transition: background-color 0.15s ease;
    }

    .property-row:hover {
      background: rgba(var(--glass-tint), 0.04);
    }

    .property-row:nth-child(even) {
      background: rgba(var(--glass-tint), 0.01);
    }

    .property-row:nth-child(even):hover {
      background: rgba(var(--glass-tint), 0.03);
    }

    .property-key {
      flex: 0 0 200px;
      padding: 12px 16px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--text-secondary);
      border-right: 1px solid rgba(255, 255, 255, 0.04);
      background: rgba(var(--glass-tint), 0.03);
    }

    .property-value {
      flex: 1;
      padding: 12px 16px;
      font-size: 0.8125rem;
      color: var(--text-primary);
      font-family: var(--font-mono, monospace);
      line-height: 1.4;
    }

    .value-string {
      color: #10b981;
    }

    .value-number {
      color: #3b82f6;
    }

    .value-boolean {
      color: #8b5cf6;
      font-weight: 600;
    }

    .value-null {
      color: #6b7280;
      font-style: italic;
    }

    .value-array {
      .array-summary {
        color: #f59e0b;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .array-items {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-left: 16px;
        font-size: 0.75rem;
      }

      .array-item {
        color: var(--text-secondary);
      }

      .array-more-btn {
        background: none;
        border: none;
        color: var(--brand);
        font-size: 0.75rem;
        cursor: pointer;
        padding: 2px 0;
        margin-left: 16px;
        font-style: italic;
        opacity: 0.8;
        transition: opacity 0.15s ease;
      }

      .array-more-btn:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    .value-object {
      .object-summary {
        color: #f59e0b;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .object-props {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-left: 16px;
        font-size: 0.75rem;
      }

      .object-prop {
        color: var(--text-secondary);
      }

      .object-prop-key {
        color: #6b7280;
      }

      .object-prop-value {
        color: var(--text-primary);
      }

      .object-more-btn {
        background: none;
        border: none;
        color: var(--brand);
        font-size: 0.75rem;
        cursor: pointer;
        padding: 2px 0;
        margin-left: 16px;
        font-style: italic;
        opacity: 0.8;
        transition: opacity 0.15s ease;
      }

      .object-more-btn:hover {
        opacity: 1;
        text-decoration: underline;
      }
    }

    .no-details {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-3xl);
      color: var(--text-secondary);
      text-align: center;
    }

    .no-details-text {
      font-size: 0.875rem;
      opacity: 0.7;
    }
  }

  .json-details {
    .detail-json {
      margin: 0;
      max-height: 300px;
      overflow-y: auto;
    }
  }
</style>
