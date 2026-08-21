<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import {
    getDepartmentAnalytics,
    type GetDepartmentAnalyticsParams,
  } from "$lib/api/admin/analytics.js";
  import type { DepartmentAnalyticsItem } from "../../types.js";
  import { toast } from "$lib/components/Toaster.svelte";
  import { _ } from "svelte-i18n";
  import { formatNumber } from "$lib/utils/format.js";

  /** null = server default: updated_at (not shown in table) */
  type NameSort = "asc" | "desc" | null;

  interface Props {
    startDate: string;
    endDate: string;
    /** Selected range, e.g. "Last 30 days" — the section caption in the design. */
    rangeLabel: string;
    onRefresh?: (callback: () => Promise<void>) => void;
  }

  let { startDate, endDate, rangeLabel, onRefresh }: Props = $props();

  let isLoading = $state(true);
  let departments = $state<DepartmentAnalyticsItem[]>([]);
  let total = $state(0);
  let currentPage = $state(0);
  let pageSize = $state(20);
  let totalPages = $state(0);
  let nameSort = $state<NameSort>(null);
  let searchQuery = $state("");
  let pendingDate: { startDate: string; endDate: string } | null = null;
  let isInitialLoadCompleted = $state(false);
  let latestRequestId = 0;

  async function fetchDepartmentAnalytics(
    newStartDate: string = startDate,
    newEndDate: string = endDate,
  ) {
    const requestId = ++latestRequestId;
    isLoading = true;
    pendingDate = { startDate: newStartDate, endDate: newEndDate };

    try {
      const params: GetDepartmentAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        offset: currentPage * pageSize,
        limit: pageSize,
        search: searchQuery.trim() || undefined,
        ...(nameSort !== null
          ? { sort: "name" as const, ascending: nameSort === "asc" }
          : { sort: "updated_at" as const, ascending: false }),
      };

      const response = await getDepartmentAnalytics(params);
      if (requestId !== latestRequestId) return;
      departments = response.departments;
      total = response.total;
      totalPages = response.total_pages;
    } catch (err: any) {
      if (requestId !== latestRequestId) return;
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_("departmentAnalytics.errors.fetchFailed"));
      console.error("Department analytics fetch error:", err);
    } finally {
      if (requestId !== latestRequestId) return;
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handleDepartmentNameSort() {
    if (nameSort === null) {
      nameSort = "desc";
    } else if (nameSort === "desc") {
      nameSort = "asc";
    } else {
      nameSort = null;
    }
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchDepartmentAnalytics();
  }

  function handlePageSizeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    pageSize = Number(target.value);
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  function clearSearch() {
    if (!searchQuery) return;
    searchQuery = "";
    currentPage = 0;
    fetchDepartmentAnalytics();
  }

  /** Same wording as the By Model tab: ms under a second, seconds above it. */
  function formatLatency(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || Number.isNaN(ms) || ms <= 0) return "—";
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  /** Tokens read as 84.2K / 1.2M, matching Top Models on the Overview tab. */
  function formatCompact(num: number): string {
    if (num >= 1000000) {
      const val = num / 1000000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "M";
    }
    if (num >= 1000) {
      const val = num / 1000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "K";
    }
    return Math.round(num).toString();
  }

  function formatCurrency(num: number): string {
    return "$" + (num ?? 0).toFixed(2);
  }

  function ariaSortForDepartment(): "ascending" | "descending" | "none" {
    if (nameSort === null) return "none";
    return nameSort === "asc" ? "ascending" : "descending";
  }

  onMount(() => {
    fetchDepartmentAnalytics();

    if (onRefresh) {
      onRefresh(async () => {
        if (isLoading) {
          return;
        }

        await fetchDepartmentAnalytics();
      });
    }
  });

  $effect(() => {
    if (!startDate || !endDate) {
      return;
    }

    if (
      pendingDate &&
      pendingDate.startDate === startDate &&
      pendingDate.endDate === endDate
    ) {
      return;
    }

    pendingDate = { startDate, endDate };

    const pendingDateUpdateTimer = setTimeout(() => {
      currentPage = 0;
      fetchDepartmentAnalytics(startDate, endDate);
    }, 1000);

    return () => {
      if (pendingDateUpdateTimer) {
        clearTimeout(pendingDateUpdateTimer);
      }
    };
  });

  // Auto-search when the query changes (with 300ms debounce)
  $effect(() => {
    if (
      !isInitialLoadCompleted ||
      searchQuery === null ||
      searchQuery === undefined
    ) {
      return;
    }

    const searchTimer = setTimeout(() => {
      currentPage = 0;
      fetchDepartmentAnalytics();
    }, 300);

    return () => {
      clearTimeout(searchTimer);
    };
  });
</script>

<div class="department-analytics-tab">
  {#if isLoading && departments.length === 0}
    <div
      class="loading-container"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingSpinner />
    </div>
  {:else}
    <div class="analytics-content">
      <!-- ============== search / per page control card ============== -->
      <div class="control-header-card">
        <div class="control-header-row">
          <label class="control-header-title" for="department-analytics-search">
            {$_("departmentAnalytics.filters.search")}
          </label>
          <label
            class="control-header-perpage-label"
            for="department-analytics-page-size"
          >
            {$_("departmentAnalytics.filters.perPage")}
          </label>
        </div>

        <div class="control-inputs-row">
          <div class="search-input-wrapper">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="6"
                cy="6"
                r="4.5"
                stroke="currentColor"
                stroke-width="1.2"
                fill="none"
              />
              <line
                x1="9.3"
                y1="9.3"
                x2="13"
                y2="13"
                stroke="currentColor"
                stroke-width="1.2"
              />
            </svg>
            <input
              id="department-analytics-search"
              type="search"
              class="search-input"
              bind:value={searchQuery}
              placeholder={$_("departmentAnalytics.filters.searchPlaceholder")}
              autocomplete="off"
            />
            {#if searchQuery}
              <button
                type="button"
                class="search-clear-btn"
                onclick={clearSearch}
                aria-label={$_("common.clear")}
                title={$_("common.clear")}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <line
                    x1="2"
                    y1="2"
                    x2="10"
                    y2="10"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                  <line
                    x1="10"
                    y1="2"
                    x2="2"
                    y2="10"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            {/if}
          </div>

          <div class="per-page-select">
            <select
              id="department-analytics-page-size"
              bind:value={pageSize}
              onchange={handlePageSizeChange}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <svg
              width="8"
              height="4"
              viewBox="0 0 8 4"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1l3 2 3-2"
                stroke="currentColor"
                stroke-width="1"
                fill="none"
              />
            </svg>
          </div>
        </div>

        <div class="control-header-divider"></div>

        <div class="control-summary-line">
          <span>
            {$_("departmentAnalytics.stats.totalDepartments")}:
            <strong>{formatNumber(total)}</strong>
          </span>
          <span>
            {$_("departmentAnalytics.stats.showing")}:
            <strong
              >{$_("departmentAnalytics.stats.showingCount", {
                values: { showing: departments.length, total },
              })}</strong
            >
          </span>
        </div>
      </div>

      <section class="section" aria-label={$_("analytics.tabs.byDepartment")}>
        <div class="section-head">
          <h2 class="section-title">{$_("analytics.tabs.byDepartment")}</h2>
          <span class="section-sub">{rangeLabel}</span>
        </div>

        <div
          class="table-container department-tab"
          role="table"
          aria-label={$_("analytics.aria.departmentTableCaption")}
        >
          <div class="table-header" role="row">
            <span role="columnheader" aria-sort={ariaSortForDepartment()}>
              <button
                type="button"
                class="sort-btn"
                onclick={handleDepartmentNameSort}
              >
                {$_("departmentAnalytics.table.department")}
                <span
                  class="sort-caret"
                  class:sort-caret--active={nameSort !== null}
                  aria-hidden="true"
                >
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
                    {#if nameSort === "asc"}
                      <path
                        d="M1 4l3-3 3 3"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    {:else}
                      <path
                        d="M1 1l3 3 3-3"
                        stroke="currentColor"
                        stroke-width="1.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    {/if}
                  </svg>
                </span>
              </button>
            </span>
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.users")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.requests")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.success")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.errors")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.tokens")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.cost")}</span
            >
            <span class="num" role="columnheader"
              >{$_("departmentAnalytics.table.avgLatency")}</span
            >
          </div>

          {#if departments.length === 0}
            <div class="empty-row" role="row">
              <span role="cell">
                {#if searchQuery}
                  {$_("departmentAnalytics.emptyState.noMatch", {
                    values: { query: searchQuery },
                  })}
                {:else}
                  {$_("departmentAnalytics.emptyState.noData")}
                {/if}
              </span>
            </div>
          {:else}
            {#each departments as department, index (`${department.department}-${index}`)}
              <div class="model-row" role="row">
                <div role="cell">
                  <span class="model-name">{department.department || "-"}</span>
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatNumber(department.total_users)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatNumber(department.total_requests)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value--success"
                    >{formatNumber(department.success_count)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span
                    class="table-value"
                    class:table-value--error={department.error_count > 0}
                    >{formatNumber(department.error_count)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatCompact(department.total_tokens)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value--cost"
                    >{formatCurrency(department.total_cost)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatLatency(department.average_latency)}</span
                  >
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <!-- Pagination is not drawn in the design, so it only appears when needed. -->
      {#if totalPages > 1}
        <nav class="pagination" aria-label={$_("analytics.aria.pagination")}>
          <button
            type="button"
            class="pagination-btn"
            disabled={currentPage === 0}
            onclick={() => handlePageChange(currentPage - 1)}
          >
            {$_("departmentAnalytics.pagination.previous")}
          </button>

          <span class="pagination-info" aria-live="polite">
            {$_("departmentAnalytics.pagination.pageInfo", {
              values: { current: currentPage + 1, total: totalPages },
            })}
          </span>

          <button
            type="button"
            class="pagination-btn"
            disabled={currentPage >= totalPages - 1}
            onclick={() => handlePageChange(currentPage + 1)}
          >
            {$_("departmentAnalytics.pagination.next")}
          </button>
        </nav>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* app.css's global button rule blurs what sits behind it, which erases the
     hairlines this design draws under its buttons. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .department-analytics-tab {
    font-family: var(--gx-font);
  }

  .analytics-content {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    margin: 0;
    font-family: var(--gx-font-display);
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .section-sub {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
  }

  .table-container {
    border-radius: 12px;
    overflow-x: auto;
    box-shadow: inset 0 0 0 1px var(--gx-an-table-ring);
  }

  /* Header and rows share one track list so the columns line up. */
  .table-header,
  .model-row {
    min-width: 900px;
    display: grid;
    grid-template-columns:
      minmax(170px, 2fr)
      78px
      88px
      82px
      70px
      88px
      80px
      98px;
    gap: 12px;
    padding: 12px 16px;
    align-items: center;
  }

  .table-header {
    min-height: 41px;
    background: var(--gx-an-thead-bg);
    border: 1px solid var(--gx-an-ring);
  }

  .table-header > span {
    min-width: 0;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  /* Counts, cost and latency read right-aligned, as in the design. */
  .table-header > span.num {
    justify-content: flex-end;
    text-align: end;
  }

  .model-row > div.num {
    justify-content: flex-end;
  }

  .sort-btn {
    border: 0;
    background: none;
    box-shadow: none;
    padding: 0;
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: flex-start;
    font-family: inherit;
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
    cursor: pointer;
  }

  .department-tab .table-header span {
    font-size: 11px;
  }

  .sort-btn:hover {
    color: var(--gx-ink);
    transform: none;
  }

  .sort-btn:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
  }

  /* The design's header is plain text, so the caret only shows on hover or
     while the column is the active sort. */
  .sort-caret {
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .sort-btn:hover .sort-caret,
  .sort-caret--active {
    opacity: 1;
  }

  .sort-caret--active {
    color: var(--gx-an-blue);
  }

  .model-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
  }

  .model-row > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .model-name {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-value {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .table-value--success {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-badge-up-fg);
  }

  .table-value--error {
    color: var(--gx-an-red);
  }

  .table-value--cost {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-badge-up-fg);
  }

  .empty-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
    display: flex;
    padding: 20px 16px;
    align-items: center;
    justify-content: center;
  }

  .empty-row span {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    text-align: center;
  }

  /* ---------------- search / per page card ---------------- */
  .control-header-card {
    border-radius: 16px;
    border: 1px solid #e6e7eb;
    box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.02);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }

  .control-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .control-header-title {
    font-weight: 700;
    font-size: 15px;
    line-height: 100%;
    color: var(--gx-ink);
  }

  .control-header-perpage-label {
    width: 80px;
    font-weight: 500;
    font-size: 12px;
    line-height: 100%;
    text-align: end;
    color: var(--gx-an-sub);
    flex-shrink: 0;
  }

  .control-inputs-row {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .search-input-wrapper {
    flex-grow: 1;
    min-width: 0;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    gap: 8px;
    padding: 0 16px;
    align-items: center;
  }

  .search-input-wrapper svg {
    color: var(--gx-an-sub);
    flex-shrink: 0;
  }

  /* app.css gives every input a glass background, inner shadow, blur and a 2px
     focus ring — all of which double up inside this design's own field. */
  .search-input {
    flex-grow: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 0;
    font-family: inherit;
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-ink);
  }

  .search-input::placeholder {
    color: var(--gx-an-sub);
  }

  .search-input:focus {
    outline: none;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .search-input-wrapper:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-an-blue);
  }

  /* The native search affordances duplicate the design's own clear button. */
  .search-input::-webkit-search-cancel-button,
  .search-input::-webkit-search-decoration {
    appearance: none;
    display: none;
  }

  .search-clear-btn {
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: none;
    box-shadow: none;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gx-an-sub);
    cursor: pointer;
    flex-shrink: 0;
  }

  .search-clear-btn:hover {
    background: var(--gx-rule);
    color: var(--gx-ink);
    transform: none;
  }

  .per-page-select {
    position: relative;
    width: 80px;
    height: 36px;
    border-radius: 8px;
    background: var(--gx-an-field-bg);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--gx-an-sub);
  }

  .per-page-select select,
  .per-page-select select:focus {
    appearance: none;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 8px;
    background: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding: 0 26px 0 16px;
    font-family: inherit;
    font-weight: 500;
    font-size: 13px;
    color: var(--gx-ink);
    cursor: pointer;
  }

  .per-page-select select:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 1px;
  }

  .per-page-select > svg {
    position: absolute;
    inset-inline-end: 12px;
    pointer-events: none;
  }

  .control-header-divider {
    height: 1px;
    background: var(--gx-an-ring);
  }

  .control-summary-line {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }

  .control-summary-line span {
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  /* Only the figure is bold; the label beside it stays regular. */
  .control-summary-line strong {
    font-weight: 700;
    color: var(--gx-ink);
  }

  /* ---------------- pagination ---------------- */
  .pagination {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: flex-end;
  }

  .pagination-btn {
    height: 32px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    padding: 0 12px;
    font-family: inherit;
    font-weight: 500;
    font-size: 12px;
    color: var(--gx-an-chip-fg);
    cursor: pointer;
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--gx-an-blue-tint);
    color: var(--gx-an-blue);
    transform: none;
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-info {
    font-weight: 500;
    font-size: 12px;
    color: var(--gx-an-sub);
  }

  @media (max-width: 768px) {
    .control-inputs-row {
      flex-direction: column;
      align-items: stretch;
    }

    .per-page-select {
      width: 100%;
    }

    .control-header-perpage-label {
      text-align: start;
    }

    .table-header,
    .model-row {
      font-size: 12px;
    }
  }
</style>
