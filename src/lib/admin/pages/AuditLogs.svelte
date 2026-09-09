<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { auditLogsStore } from "../stores/index.js";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { _ } from "svelte-i18n";
  import {
    formatDate,
    formatNumber,
    formatRelativeTime,
  } from "../../utils/format.js";
  import { exportAuditLogs } from "../../api/admin/auditLogs.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("admin.auditLogs.title"));
  });
  import type { AuditLog } from "../types.js";

  const ROWS_PER_PAGE_OPTIONS = [20, 50, 100];

  let searchQuery = $state("");
  let filterAction = $state("");
  let filterStartDate = $state("");
  let filterEndDate = $state("");
  let debounceTimeout: number | null = null;
  let isExporting = $state(false);
  let expandedRowId = $state<string | null>(null);
  let activeDetailTab = $state<Record<string, "json" | "visualized">>({});
  let expandedDetails = $state<Record<string, boolean>>({});
  /** Which ".copyable-box" last confirmed a copy, so it can flash a check. */
  let copiedKey = $state<string | null>(null);
  let copiedTimeout: number | null = null;

  onMount(() => {
    auditLogsStore.fetchLogs();
    auditLogsStore.fetchActionTypes();
    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (copiedTimeout) clearTimeout(copiedTimeout);
    };
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
          ? getLocalizedError(
              auditLogsStore.actionTypesError,
              "description",
              $_,
            )
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

  function refresh() {
    auditLogsStore.fetchLogs();
    auditLogsStore.fetchActionTypes();
  }

  function handlePageChange(page: number) {
    auditLogsStore.setPage(page);
  }

  function handleLimitChange(event: Event) {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    if (Number.isFinite(value) && value > 0) auditLogsStore.setLimit(value);
  }

  function toggleRowDetails(id: string) {
    expandedRowId = expandedRowId === id ? null : id;
    if (expandedRowId === id && !activeDetailTab[id]) {
      activeDetailTab[id] = "visualized";
    }
  }

  /** The design draws the user id as a link; here it narrows the view to them. */
  function filterByUser(userId: string) {
    if (!userId) return;
    searchQuery = userId;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    applyFilters();
  }

  /** Falls back to execCommand where the async clipboard is unavailable. */
  async function writeClipboard(value: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Ignore and try the legacy path below.
    }

    try {
      const scratch = document.createElement("textarea");
      scratch.value = value;
      scratch.setAttribute("readonly", "");
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(scratch);
      return ok;
    } catch {
      return false;
    }
  }

  async function copyValue(key: string, value: string) {
    if (await writeClipboard(value)) {
      copiedKey = key;
      if (copiedTimeout) clearTimeout(copiedTimeout);
      copiedTimeout = setTimeout(() => (copiedKey = null), 1500);
    } else {
      toast.error($_("admin.auditLogs.copyFailed"));
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

  function getLocalizedAction(
    action: string,
    translate: (
      key: string,
      options?: { values?: Record<string, string> },
    ) => string = $_,
  ): string {
    if (!action) return "";

    const key = `admin.auditLogs.actions.${action}`;

    // Get translated text with parameter substitution (same pattern as getLocalizedError)
    const translated = translate(key, { values: {} });

    // If translation returns the key itself (not found), return the original action
    return translated === key ? action : translated;
  }

  function setDetailTab(logId: string, tab: "json" | "visualized") {
    activeDetailTab[logId] = tab;
  }

  function toggleExpandedDetails(logId: string) {
    expandedDetails[logId] = !expandedDetails[logId];
  }

  function formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, " ")
      .trim();
  }

  /**
   * ".action-badge" — the design draws two treatments, a blue one and a violet
   * one. Destructive events keep the third, red, treatment the old table had:
   * a deletion is the one row an auditor must be able to spot at a glance.
   */
  function getActionBadgeClass(action: string): string {
    if (
      action.includes("deleted") ||
      action.includes("removed") ||
      action.includes("disconnected") ||
      action.includes("redacted")
    ) {
      return "action-badge--red";
    }
    return action.startsWith("admin_")
      ? "action-badge--purple"
      : "action-badge--blue";
  }

  /** Conversation traffic gets the design's bubble glyph, records its page glyph. */
  function isMessageAction(action: string): boolean {
    return (
      action.includes("message") ||
      action.includes("conversation") ||
      action.includes("prompt")
    );
  }

  /** Short form the design prints in the table; the full value sits in the drawer. */
  function shortId(value: string | null | undefined): string {
    return value ? value.slice(0, 8) : "—";
  }

  function startOfDay(value: Date): number {
    const day = new Date(value);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }

  /** "TODAY · AUG 18, 2026" — relative word only for today and yesterday. */
  function dayLabel(iso: string): string {
    const date = new Date(iso);
    const stamp = formatDate(
      date,
      { year: "numeric", month: "short", day: "numeric" },
      "—",
    );
    const delta = Math.round(
      (startOfDay(date) - startOfDay(new Date())) / 86400000,
    );
    if (delta === 0) return `${$_("admin.auditLogs.today")} · ${stamp}`;
    if (delta === -1) return `${$_("admin.auditLogs.yesterday")} · ${stamp}`;
    return stamp;
  }

  /** ".day-group-header" — one band per calendar day, in the order served. */
  const dayGroups = $derived.by(() => {
    const groups: { key: number; label: string; logs: AuditLog[] }[] = [];
    for (const log of auditLogsStore.items) {
      const key = startOfDay(new Date(log.createdAt));
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.logs.push(log);
      else groups.push({ key, label: dayLabel(log.createdAt), logs: [log] });
    }
    return groups;
  });

  /** The design prints an email under the user id; audit payloads carry one. */
  function detailEmail(log: AuditLog): string | null {
    const details = log.details as Record<string, any> | null;
    if (!details || typeof details !== "object") return null;
    const candidate =
      details.email ?? details.after?.email ?? details.before?.email;
    return typeof candidate === "string" && candidate ? candidate : null;
  }

  const currentPage = $derived(auditLogsStore.page);
  const totalPages = $derived(
    Math.max(1, Math.ceil(auditLogsStore.total / auditLogsStore.limit)),
  );
</script>

{#snippet copyableBox(key: string, value: string)}
  <button
    type="button"
    class="copyable-box"
    onclick={() => copyValue(key, value)}
    title={value}
    aria-label={$_("admin.auditLogs.copyValue", { values: { value } })}
  >
    <span>{value}</span>
    {#if copiedKey === key}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 6.3 5 8.8l4.5-5.6"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {:else}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="9.5"
          cy="2.5"
          r="1.5"
          stroke="currentColor"
          stroke-width="1"
        />
        <circle
          cx="2.5"
          cy="6"
          r="1.5"
          stroke="currentColor"
          stroke-width="1"
        />
        <circle
          cx="9.5"
          cy="9.5"
          r="1.5"
          stroke="currentColor"
          stroke-width="1"
        />
        <path
          d="M3.9 5.3 8.1 3.2M3.9 6.7l4.2 2.1"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
    {/if}
  </button>
{/snippet}

<div class="audit-logs-container">
  <!-- ".page-header" -->
  <div class="page-header">
    <div class="header-text">
      <span class="page-title">{$_("admin.auditLogs.title")}</span>
      <span class="page-sub">{$_("admin.auditLogs.subtitle")}</span>
    </div>
    <div class="header-actions">
      <button
        type="button"
        class="refresh-btn"
        onclick={() => handleExport("csv")}
        disabled={isExporting || auditLogsStore.items.length === 0}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 1.6v7.2M4.2 6l2.8 2.8L9.8 6M2 10v1.4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{$_("admin.auditLogs.exportCsv")}</span>
      </button>
      <button
        type="button"
        class="refresh-btn"
        onclick={() => handleExport("json")}
        disabled={isExporting || auditLogsStore.items.length === 0}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 1.6v7.2M4.2 6l2.8 2.8L9.8 6M2 10v1.4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{$_("admin.auditLogs.exportJson")}</span>
      </button>
      <button
        type="button"
        class="refresh-btn"
        onclick={refresh}
        disabled={auditLogsStore.isLoading}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12.3 7A5.3 5.3 0 0 1 2.9 9.6M1.7 7A5.3 5.3 0 0 1 11.1 4.4M1.7 1.7v3h3M12.3 12.3v-3h-3"
            stroke="currentColor"
            stroke-width="1.3"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{$_("admin.auditLogs.refresh")}</span>
      </button>
    </div>
  </div>

  <!-- ".filter-card" -->
  <div class="filter-card">
    <div class="filter-grid">
      <div class="filter-col">
        <label class="filter-label" for="audit-search"
          >{$_("admin.auditLogs.searchEvent")}</label
        >
        <div class="filter-input">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="7"
              cy="7"
              r="5.25"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path
              d="m11 11 3 3"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
            />
          </svg>
          <input
            id="audit-search"
            type="text"
            placeholder={$_("admin.auditLogs.searchPlaceholder")}
            bind:value={searchQuery}
            oninput={applyFiltersDebounced}
          />
        </div>
      </div>
      <div class="filter-col">
        <label class="filter-label" for="audit-action"
          >{$_("admin.auditLogs.columns.action")}</label
        >
        <div class="filter-select">
          <select
            id="audit-action"
            bind:value={filterAction}
            onchange={applyFilters}
          >
            <option value="">{$_("admin.auditLogs.allActions")}</option>
            {#each auditLogsStore.actionTypes as action (action)}
              <option value={action}>{getLocalizedAction(action)}</option>
            {/each}
          </select>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l3 3 3-3"
              stroke="currentColor"
              stroke-width="1.3"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
      <div class="filter-col">
        <label class="filter-label" for="audit-start"
          >{$_("admin.auditLogs.startDate")}</label
        >
        <div class="filter-select">
          <input
            id="audit-start"
            type="date"
            bind:value={filterStartDate}
            onchange={applyFilters}
          />
        </div>
      </div>
      <div class="filter-col">
        <label class="filter-label" for="audit-end"
          >{$_("admin.auditLogs.endDate")}</label
        >
        <div class="filter-select">
          <input
            id="audit-end"
            type="date"
            bind:value={filterEndDate}
            onchange={applyFilters}
          />
        </div>
      </div>
      <button type="button" class="filter-clear" onclick={clearFilters}>
        <span>{$_("admin.auditLogs.clearAll")}</span>
      </button>
    </div>
  </div>

  <!-- ".meta-row" -->
  <div class="meta-row">
    <span class="meta-count" role="status" aria-live="polite">
      {$_("admin.auditLogs.eventsMatched", {
        values: { count: formatNumber(auditLogsStore.total) },
      })}
    </span>
    <div class="sort-status">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 4h10M2 7h6M2 10h3"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
      <span>{$_("admin.auditLogs.sortedNewestFirst")}</span>
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
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      {/snippet}
    </AdminEmptyState>
  {:else}
    <!-- ".logs-card" -->
    <div class="logs-card">
      {#each dayGroups as group, groupIndex (group.key)}
        <div class="day-group-header">
          <div class="day-title">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="1.5"
                y="2.5"
                width="11"
                height="10"
                rx="1.3"
                stroke="currentColor"
                stroke-width="1.1"
              />
              <path
                d="M1.5 5.5h11M4.5 1v2M9.5 1v2"
                stroke="currentColor"
                stroke-width="1.1"
              />
            </svg>
            <span>{group.label}</span>
          </div>
          <div class="event-count-badge">
            <span>
              {$_("admin.auditLogs.eventCount", {
                values: { count: formatNumber(group.logs.length) },
              })}
            </span>
          </div>
        </div>

        {#if groupIndex === 0}
          <div class="col-headers" aria-hidden="true">
            <span class="col-spacer"></span>
            <span class="col-timestamp-h"
              >{$_("admin.auditLogs.columns.timestamp")}</span
            >
            <span class="col-user-h"
              >{$_("admin.auditLogs.columns.userId")}</span
            >
            <span class="col-action-h"
              >{$_("admin.auditLogs.columns.action")}</span
            >
            <span class="col-resource-h"
              >{$_("admin.auditLogs.columns.resourceType")}</span
            >
            <span class="col-resourceid-h"
              >{$_("admin.auditLogs.columns.resourceId")}</span
            >
            <span class="col-ip-h"
              >{$_("admin.auditLogs.columns.ipAddress")}</span
            >
          </div>
        {/if}

        {#each group.logs as log (log.id)}
          <div
            class="audit-row"
            class:audit-row--expanded={expandedRowId === log.id}
            role="button"
            tabindex="0"
            aria-expanded={expandedRowId === log.id}
            aria-label={expandedRowId === log.id
              ? $_("admin.auditLogs.hideDetails")
              : $_("admin.auditLogs.showDetails")}
            onclick={() => toggleRowDetails(log.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleRowDetails(log.id);
              }
            }}
          >
            <span class="chevron-btn" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 3.75 5 6.25l3-2.5"
                  stroke="currentColor"
                  stroke-width="1.3"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div class="col-timestamp">
              <span class="ts-time">
                {formatDate(
                  log.createdAt,
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  },
                  "—",
                )}
              </span>
              <span class="ts-rel">{formatRelativeTime(log.createdAt)}</span>
            </div>
            <div class="col-user">
              <button
                type="button"
                class="user-link"
                title={log.userId || "—"}
                aria-label={$_("admin.auditLogs.filterByUser", {
                  values: { user: log.userId || "—" },
                })}
                disabled={!log.userId}
                onclick={(e) => {
                  e.stopPropagation();
                  filterByUser(log.userId);
                }}
              >
                {shortId(log.userId)}
              </button>
            </div>
            <div class="col-action">
              <span
                class="action-badge {getActionBadgeClass(log.action)}"
                title={log.action}
              >
                {#if isMessageAction(log.action)}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 2h9v6H4l-2.5 2.5z"
                      stroke="currentColor"
                      stroke-width="1"
                      fill="none"
                      stroke-linejoin="round"
                    />
                  </svg>
                {:else}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 1.5h4l2 2v7h-6z"
                      stroke="currentColor"
                      stroke-width="1"
                      fill="none"
                      stroke-linejoin="round"
                    />
                  </svg>
                {/if}
                <span>{getLocalizedAction(log.action)}</span>
              </span>
            </div>
            <div class="col-resource">{log.resourceType || "—"}</div>
            <div class="col-resourceid" title={log.resourceId || "—"}>
              {shortId(log.resourceId)}
            </div>
            <div class="col-ip">{log.ipAddress || "—"}</div>
          </div>

          {#if expandedRowId === log.id}
            <!-- ".expanded-details" -->
            <div class="expanded-details">
              <span class="expanded-title"
                >{$_("admin.auditLogs.payloadTitle")}</span
              >
              <div class="details-grid">
                <div class="detail-col">
                  <span class="detail-col-label"
                    >{$_("admin.auditLogs.fullUserIdentity")}</span
                  >
                  {@render copyableBox(`${log.id}:user`, log.userId || "—")}
                  {#if detailEmail(log)}
                    <span class="detail-col-sub">
                      {$_("admin.auditLogs.emailLine", {
                        values: { email: detailEmail(log) ?? "" },
                      })}
                    </span>
                  {/if}
                </div>
                <div class="detail-col">
                  <span class="detail-col-label"
                    >{$_("admin.auditLogs.fullResourceUuid")}</span
                  >
                  {@render copyableBox(
                    `${log.id}:resource`,
                    log.resourceId || "—",
                  )}
                  <span class="detail-col-sub">
                    {$_("admin.auditLogs.typeLine", {
                      values: { type: log.resourceType || "—" },
                    })}
                  </span>
                </div>
                <div class="detail-col">
                  <span class="detail-col-label"
                    >{$_("admin.auditLogs.networkOrigin")}</span
                  >
                  {@render copyableBox(`${log.id}:ip`, log.ipAddress || "—")}
                  <span class="detail-col-sub"
                    >{$_("admin.auditLogs.secureSession")}</span
                  >
                </div>
                <div class="detail-col">
                  <span class="detail-col-label"
                    >{$_("admin.auditLogs.columns.userAgent")}</span
                  >
                  {@render copyableBox(`${log.id}:agent`, log.userAgent || "—")}
                  <span class="detail-col-sub">
                    {$_("admin.auditLogs.typeLine", {
                      values: { type: log.action },
                    })}
                  </span>
                </div>
              </div>

              <!-- The payload itself, in the same two views the table always had. -->
              <div class="payload-block">
                <div class="payload-head">
                  <span class="detail-col-label"
                    >{$_("admin.auditLogs.columns.details")}</span
                  >
                  <div class="payload-tabs">
                    <button
                      type="button"
                      class="payload-tab"
                      class:active={activeDetailTab[log.id] !== "json"}
                      onclick={() => setDetailTab(log.id, "visualized")}
                      aria-pressed={activeDetailTab[log.id] !== "json"}
                      title={$_("admin.auditLogs.visualizedView")}
                      aria-label={$_("admin.auditLogs.visualizedView")}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="payload-tab"
                      class:active={activeDetailTab[log.id] === "json"}
                      onclick={() => setDetailTab(log.id, "json")}
                      aria-pressed={activeDetailTab[log.id] === "json"}
                      title={$_("admin.auditLogs.jsonView")}
                      aria-label={$_("admin.auditLogs.jsonView")}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path
                          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                        />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </button>
                  </div>
                </div>

                {#if activeDetailTab[log.id] === "json"}
                  <pre class="payload-json">{JSON.stringify(
                      log.details,
                      null,
                      2,
                    ) ?? "—"}</pre>
                {:else if log.details && typeof log.details === "object"}
                  <div class="property-inspector">
                    {#each Object.entries(log.details) as [key, value] (key)}
                      <div class="property-row">
                        <div class="property-key">{formatKey(key)}</div>
                        <div class="property-value">
                          {#if typeof value === "string"}
                            <span class="value-string">"{value}"</span>
                          {:else if typeof value === "number"}
                            <span class="value-number">{value}</span>
                          {:else if typeof value === "boolean"}
                            <span class="value-boolean"
                              >{value ? "true" : "false"}</span
                            >
                          {:else if Array.isArray(value)}
                            <div class="value-array">
                              <div class="array-summary">
                                {$_("admin.auditLogs.arraySummary", {
                                  values: { count: String(value.length) },
                                })}
                              </div>
                              {#if value.length > 0}
                                <div class="array-items">
                                  {#each expandedDetails[log.id] ? value : value.slice(0, 3) as item}
                                    <div class="array-item">
                                      {#if typeof item === "string"}
                                        "{item}"
                                      {:else if typeof item === "object" && item !== null}
                                        {$_("admin.auditLogs.objectSummary", {
                                          values: {
                                            count: String(
                                              Object.keys(item).length,
                                            ),
                                          },
                                        })}
                                      {:else}
                                        {item}
                                      {/if}
                                    </div>
                                  {/each}
                                  {#if value.length > 3}
                                    <button
                                      type="button"
                                      class="array-more-btn"
                                      onclick={() =>
                                        toggleExpandedDetails(log.id)}
                                    >
                                      {expandedDetails[log.id]
                                        ? $_("admin.auditLogs.showLess")
                                        : $_("admin.auditLogs.showMore", {
                                            values: {
                                              count: String(value.length - 3),
                                            },
                                          })}
                                    </button>
                                  {/if}
                                </div>
                              {/if}
                            </div>
                          {:else if typeof value === "object" && value !== null}
                            {@const objectEntries = Object.entries(value)}
                            <div class="value-object">
                              <div class="object-summary">
                                {$_("admin.auditLogs.objectSummary", {
                                  values: {
                                    count: String(objectEntries.length),
                                  },
                                })}
                              </div>
                              <div class="object-props">
                                {#each expandedDetails[log.id] ? objectEntries : objectEntries.slice(0, 3) as [objKey, objValue]}
                                  <div class="object-prop">
                                    <span class="object-prop-key"
                                      >{objKey}:</span
                                    >
                                    <span class="object-prop-value">
                                      {#if typeof objValue === "string"}
                                        "{objValue}"
                                      {:else if Array.isArray(objValue)}
                                        {$_("admin.auditLogs.arraySummary", {
                                          values: {
                                            count: String(objValue.length),
                                          },
                                        })}
                                      {:else if typeof objValue === "object" && objValue !== null}
                                        {$_("admin.auditLogs.objectSummary", {
                                          values: {
                                            count: String(
                                              Object.keys(objValue).length,
                                            ),
                                          },
                                        })}
                                      {:else}
                                        {objValue}
                                      {/if}
                                    </span>
                                  </div>
                                {/each}
                                {#if objectEntries.length > 3}
                                  <button
                                    type="button"
                                    class="object-more-btn"
                                    onclick={() =>
                                      toggleExpandedDetails(log.id)}
                                  >
                                    {expandedDetails[log.id]
                                      ? $_("admin.auditLogs.showLess")
                                      : $_("admin.auditLogs.showMore", {
                                          values: {
                                            count: String(
                                              objectEntries.length - 3,
                                            ),
                                          },
                                        })}
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
                    {$_("admin.auditLogs.noDetails")}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/each}
    </div>

    <!-- ".table-footer" -->
    <div class="table-footer">
      <div class="rows-per-page">
        <label for="audit-rows">{$_("admin.auditLogs.rowsPerPage")}</label>
        <div class="rows-select">
          <select
            id="audit-rows"
            value={auditLogsStore.limit}
            onchange={handleLimitChange}
          >
            {#each ROWS_PER_PAGE_OPTIONS as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 5l3 3 3-3"
              stroke="currentColor"
              stroke-width="1.2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
      <nav class="pagination" aria-label={$_("admin.common.pagination")}>
        <span role="status" aria-live="polite">
          {$_("admin.auditLogs.pageInfo", {
            values: {
              current: formatNumber(currentPage),
              total: formatNumber(totalPages),
              count: formatNumber(auditLogsStore.total),
            },
          })}
        </span>
        <div class="pag-buttons">
          <button
            type="button"
            class="pag-btn"
            onclick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label={$_("admin.common.previousPage")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M9 3.5 5.5 7 9 10.5"
                stroke="currentColor"
                stroke-width="1.3"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="pag-btn pag-btn--next"
            onclick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label={$_("admin.common.nextPage")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 3.5 8.5 7 5 10.5"
                stroke="currentColor"
                stroke-width="1.3"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </nav>
    </div>
  {/if}
</div>

<style>
  /* ===== audit-logs.html, transcribed. Design values that no --gx-* token
     already carried live in app.css as --gx-al-*. ===== */

  /* app.css paints every bare <button>/<input>/<select> as a glass pill. Every
     control below is flat, so strip that once here and let each rule paint its
     own skin. */
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
    opacity: 0.5;
    cursor: not-allowed;
  }

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
    color: inherit;
    cursor: pointer;
  }

  input:focus,
  select:focus {
    background: transparent;
    box-shadow: none;
  }

  select {
    appearance: none;
    -webkit-appearance: none;
  }

  /* ".main" */
  .audit-logs-container {
    display: flex;
    flex-direction: column;
    gap: 28px;
    height: 100%;
    width: 100%;
    background: var(--gx-page);
    padding: 32px;
    overflow-y: auto;
    font-family: var(--gx-font);
  }

  /* ---------------- ".page-header" ---------------- */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .page-title {
    font-weight: 700;
    font-size: 28px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  .page-sub {
    font-weight: 400;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .refresh-btn {
    height: 32px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    align-items: center;
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--gx-ring-soft);
  }

  .refresh-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .refresh-btn svg {
    display: block;
    color: var(--gx-org-primary-500);
  }

  .refresh-btn span {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
  }

  /* ---------------- ".filter-card" ---------------- */
  .filter-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-hair-soft);
    display: flex;
    padding: 20px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .filter-grid {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    align-self: stretch;
    width: 100%;
  }

  .filter-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 0;
    min-width: 0;
  }

  .filter-label {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--gx-an-sub);
    text-transform: uppercase;
  }

  .filter-input,
  .filter-select {
    height: 40px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-cx-pill-ring);
    display: flex;
    gap: 8px;
    padding: 0 12px;
    align-items: center;
  }

  .filter-input:focus-within,
  .filter-select:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .filter-input input {
    flex-grow: 1;
    min-width: 0;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-card-title-ink);
    cursor: text;
  }

  .filter-input input::placeholder {
    color: var(--gx-org-slate-350);
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
  }

  .filter-input svg {
    display: block;
    color: var(--gx-org-slate-350);
    flex-shrink: 0;
  }

  .filter-select {
    justify-content: space-between;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-card-title-ink);
  }

  .filter-select svg {
    display: block;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    pointer-events: none;
  }

  .filter-select select,
  .filter-select input {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 400;
    color: var(--gx-card-title-ink);
  }

  /* A date field paints its own indicator; the design's chevron stands in. */
  .filter-select input[type="date"]::-webkit-calendar-picker-indicator {
    margin: 0;
    opacity: 0.55;
    cursor: pointer;
  }

  .filter-clear {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    flex-shrink: 0;
  }

  .filter-clear span {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-org-primary-500);
    white-space: nowrap;
  }

  .filter-clear:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* ---------------- ".meta-row" ---------------- */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .meta-count {
    font-weight: 700;
    font-size: 14px;
    color: var(--gx-an-sub);
  }

  .sort-status {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--gx-an-sub);
  }

  .sort-status svg {
    display: block;
  }

  .sort-status span {
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  /* ---------------- ".logs-card" ---------------- */
  .logs-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-hair-soft);
    display: flex;
    flex-direction: column;
    align-self: stretch;
    overflow: hidden;
    flex-shrink: 0;
  }

  .day-group-header {
    height: 40px;
    border-bottom: 1px solid var(--gx-org-hair-soft);
    display: flex;
    padding: 12px 24px;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .day-title {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .day-title svg {
    display: block;
    color: var(--gx-an-sub);
    flex-shrink: 0;
  }

  .day-title span {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--gx-card-title-ink);
    white-space: nowrap;
    text-transform: uppercase;
  }

  .event-count-badge {
    border-radius: 99px;
    background: var(--gx-org-hair-soft);
    padding: 2px 8px;
    flex-shrink: 0;
  }

  .event-count-badge span {
    font-weight: 700;
    font-size: 10px;
    color: var(--gx-card-title-ink);
    white-space: nowrap;
  }

  .col-headers {
    height: 40px;
    border-bottom: 1px solid var(--gx-org-hair-soft);
    display: flex;
    gap: 12px;
    padding: 12px 24px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .col-headers span {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
  }

  .col-spacer {
    width: 16px;
    flex-shrink: 0;
  }

  .col-timestamp-h {
    width: 130px;
    flex-shrink: 0;
  }

  .col-user-h {
    width: 100px;
    flex-shrink: 0;
  }

  .col-action-h {
    width: 180px;
    flex-shrink: 0;
  }

  .col-resource-h {
    width: 140px;
    flex-shrink: 0;
  }

  .col-resourceid-h {
    width: 140px;
    flex-shrink: 0;
  }

  .col-ip-h {
    flex-grow: 1;
  }

  /* ---------------- ".audit-row" ---------------- */
  .audit-row {
    height: 59px;
    border-bottom: 1px solid var(--gx-org-hair-soft);
    display: flex;
    gap: 12px;
    padding: 14px 24px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  /* The card's own edge closes the table, whether a row or its open drawer
     happens to sit last. */
  .logs-card > :last-child {
    border-bottom: 0;
  }

  .audit-row--expanded {
    background: var(--gx-ring-soft);
  }

  .audit-row:not(.audit-row--expanded):hover {
    background: var(--gx-page);
  }

  .audit-row:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: -2px;
  }

  .chevron-btn {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-org-slate-350);
    transition: transform 120ms ease;
  }

  .chevron-btn svg {
    display: block;
  }

  .audit-row--expanded .chevron-btn {
    color: var(--gx-org-primary-500);
    transform: rotate(180deg);
  }

  .col-timestamp {
    width: 130px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .ts-time {
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-card-title-ink);
    white-space: nowrap;
  }

  .ts-rel {
    font-weight: 400;
    font-size: 11px;
    color: var(--gx-org-slate-350);
    white-space: nowrap;
  }

  .col-user {
    width: 100px;
    flex-shrink: 0;
  }

  .user-link {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-org-primary-500);
    text-decoration: underline;
    white-space: nowrap;
  }

  .user-link:hover:not(:disabled) {
    color: var(--gx-ac-cta-hover);
  }

  .user-link:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .col-action {
    width: 180px;
    flex-shrink: 0;
    min-width: 0;
  }

  .action-badge {
    max-width: 100%;
    border-radius: 6px;
    display: inline-flex;
    gap: 6px;
    padding: 4px 10px;
    padding-inline-start: 8px;
    align-items: center;
  }

  .action-badge svg {
    display: block;
    flex-shrink: 0;
  }

  .action-badge span {
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .action-badge--blue {
    background: var(--gx-ring-soft);
    color: var(--gx-org-primary-500);
  }

  .action-badge--purple {
    background: var(--gx-al-violet-bg);
    color: var(--gx-cx-img-accent);
  }

  .action-badge--red {
    background: var(--gx-org-danger-bg);
    color: var(--gx-org-danger);
  }

  .col-resource {
    width: 140px;
    flex-shrink: 0;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-card-title-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-resourceid,
  .col-ip {
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-card-title-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-resourceid {
    width: 140px;
    flex-shrink: 0;
  }

  .col-ip {
    flex-grow: 1;
    min-width: 0;
  }

  /* ---------------- ".expanded-details" ---------------- */
  .expanded-details {
    background: var(--gx-ring-soft);
    border-bottom: 1px solid var(--gx-org-hair-soft);
    display: flex;
    flex-direction: column;
    gap: 20px;
    /* Logical so the drawer's indent mirrors under dir="rtl". */
    padding: 20px 24px 24px;
    padding-inline-start: 52px;
    align-self: stretch;
  }

  .expanded-title {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.5px;
    color: var(--gx-an-blue-label-strong);
    text-transform: uppercase;
  }

  .details-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-self: stretch;
  }

  .detail-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 200px;
    min-width: 0;
  }

  .detail-col-label {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.2px;
    color: var(--gx-an-sub);
    text-transform: uppercase;
  }

  .copyable-box {
    height: 28px;
    width: 100%;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    display: flex;
    gap: 8px;
    padding: 6px 10px;
    align-items: center;
    transition: background-color 120ms ease;
  }

  .copyable-box:hover {
    background: var(--gx-hover-soft);
  }

  .copyable-box:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .copyable-box span {
    flex-grow: 1;
    min-width: 0;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-weight: 400;
    font-size: 12px;
    color: var(--gx-an-blue-label-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: start;
  }

  .copyable-box svg {
    display: block;
    color: var(--gx-org-primary-500);
    flex-shrink: 0;
  }

  .detail-col-sub {
    font-weight: 400;
    font-size: 11px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The payload viewer, dressed in the drawer's own idiom. */
  .payload-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-self: stretch;
    min-width: 0;
  }

  .payload-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .payload-tabs {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .payload-tab {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .payload-tab:hover {
    background: var(--gx-hover-soft);
  }

  .payload-tab.active {
    background: var(--gx-org-primary-500);
    color: #fff;
    box-shadow: none;
  }

  .payload-tab:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .payload-tab svg {
    display: block;
  }

  .payload-json {
    margin: 0;
    max-height: 320px;
    overflow: auto;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    padding: 10px 12px;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--gx-an-blue-label-strong);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .property-inspector {
    display: flex;
    flex-direction: column;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    overflow: hidden;
  }

  .property-row {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--gx-ring-soft);
    align-items: flex-start;
  }

  .property-row:last-child {
    border-bottom: 0;
  }

  .property-key {
    width: 160px;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 12px;
    color: var(--gx-an-sub);
  }

  .property-value {
    flex-grow: 1;
    min-width: 0;
    font-family: var(--gx-mono, ui-monospace, "SF Mono", Menlo, monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--gx-card-title-ink);
    word-break: break-word;
  }

  .value-string {
    color: var(--gx-org-brand-alt);
  }

  .value-number {
    color: var(--gx-cx-img-accent);
  }

  .value-boolean {
    color: var(--gx-org-primary-500);
  }

  .value-null {
    color: var(--gx-org-slate-350);
  }

  .array-summary,
  .object-summary {
    font-weight: 600;
    color: var(--gx-an-sub);
  }

  .array-items,
  .object-props {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 4px;
  }

  .object-prop-key {
    color: var(--gx-an-sub);
  }

  .array-more-btn,
  .object-more-btn {
    align-self: flex-start;
    padding-top: 2px;
    font-family: var(--gx-font);
    font-size: 11px;
    font-weight: 600;
    color: var(--gx-org-primary-500);
  }

  .array-more-btn:hover,
  .object-more-btn:hover {
    color: var(--gx-ac-cta-hover);
  }

  .no-details {
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-100);
    padding: 10px 12px;
    font-size: 12px;
    color: var(--gx-an-sub);
  }

  /* ---------------- ".table-footer" ---------------- */
  .table-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    align-self: stretch;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .rows-per-page {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .rows-per-page label {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .rows-select {
    height: 28px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-cx-pill-ring);
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    padding-inline-start: 10px;
    align-items: center;
  }

  .rows-select:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .rows-select select {
    width: auto;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-card-title-ink);
  }

  .rows-select svg {
    display: block;
    color: var(--gx-an-sub);
    flex-shrink: 0;
    pointer-events: none;
  }

  .pagination {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .pagination span {
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .pag-buttons {
    display: flex;
    gap: 8px;
  }

  .pag-btn {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-org-hair-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 120ms ease;
  }

  .pag-btn:hover:not(:disabled) {
    background: var(--gx-page);
  }

  .pag-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .pag-btn:disabled {
    pointer-events: none;
  }

  .pag-btn svg {
    display: block;
    color: var(--gx-org-slate-350);
  }

  .pag-btn--next {
    box-shadow: inset 0 0 0 1px var(--gx-cx-pill-ring);
  }

  .pag-btn--next svg {
    color: var(--gx-card-title-ink);
  }

  /* ---------------- narrow viewports ----------------
     The design is drawn at 1440px; below the table's natural width the card
     scrolls sideways rather than crushing its columns. */
  @media (max-width: 1100px) {
    .audit-logs-container {
      padding: 20px;
    }

    .filter-grid {
      flex-wrap: wrap;
    }

    .filter-col {
      flex: 1 1 200px;
    }

    .logs-card {
      overflow-x: auto;
    }

    .day-group-header,
    .col-headers,
    .audit-row,
    .expanded-details {
      min-width: 960px;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      flex-wrap: wrap;
    }

    .table-footer {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .pagination {
      justify-content: space-between;
    }
  }
</style>
