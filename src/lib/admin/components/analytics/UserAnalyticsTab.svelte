<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import {
    getUserAnalytics,
    type GetUserAnalyticsParams,
  } from "$lib/api/admin/analytics.js";
  import type { UserAnalyticsItem } from "../../types.js";
  import { toast } from "$lib/components/Toaster.svelte";
  import { _ } from "svelte-i18n";
  import { formatRelativeDay } from "$lib/utils/format.js";

  interface Props {
    startDate: string;
    endDate: string;
    onRefresh?: (callback: () => Promise<void>) => void;
  }

  let { startDate, endDate, onRefresh }: Props = $props();

  let isLoading = $state(true);
  let users = $state<UserAnalyticsItem[]>([]);
  let total = $state(0);
  let currentPage = $state(0);
  let pageSize = $state(20);
  let totalPages = $state(0);

  /** Every column the API can sort on (its sort_by values). */
  type SortColumn =
    | "name"
    | "email"
    | "totalRequests"
    | "totalTokens"
    | "totalCost"
    | "averageLatency"
    | "lastActivity";

  let sortBy = $state<SortColumn | null>("totalRequests");
  let sortOrder = $state<"asc" | "desc">("desc");
  let searchQuery = $state("");
  let pendingDate: { startDate: string; endDate: string } | null = null;
  let isInitialLoadCompleted = $state(false);
  let latestRequestId = 0;

  async function fetchUserAnalytics(
    newStartDate: string = startDate,
    newEndDate: string = endDate,
  ) {
    const requestId = ++latestRequestId;
    isLoading = true;
    pendingDate = { startDate: newStartDate, endDate: newEndDate };

    try {
      const params: GetUserAnalyticsParams = {
        start_date: newStartDate,
        end_date: newEndDate,
        page: currentPage,
        limit: pageSize,
        sort_by: sortBy ?? undefined,
        order: sortBy ? sortOrder : undefined,
        search: searchQuery.trim() || undefined,
      };

      const response = await getUserAnalytics(params);
      if (requestId !== latestRequestId) return;
      users = response.users;
      total = response.total;
      totalPages = response.total_pages;
      currentPage = response.page;
    } catch (err: any) {
      if (requestId !== latestRequestId) return;
      const errorMessage = err?.message || err?.error;
      toast.error(errorMessage || $_("userAnalytics.errors.fetchFailed"));
      console.error("User analytics fetch error:", err);
    } finally {
      if (requestId !== latestRequestId) return;
      isLoading = false;
      pendingDate = null;
      isInitialLoadCompleted = true;
    }
  }

  function handleSort(column: SortColumn) {
    if (sortBy !== column) {
      sortBy = column;
      sortOrder = "desc";
    } else if (sortOrder === "desc") {
      sortOrder = "asc";
    } else {
      sortBy = null;
      sortOrder = "desc";
    }
    currentPage = 0;
    fetchUserAnalytics();
  }

  function handlePageChange(newPage: number) {
    currentPage = newPage;
    fetchUserAnalytics();
  }

  function handlePageSizeChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    pageSize = Number(target.value);
    currentPage = 0;
    fetchUserAnalytics();
  }

  function clearSearch() {
    if (!searchQuery) return;
    searchQuery = "";
    currentPage = 0;
    fetchUserAnalytics();
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat("en-US").format(num);
  }

  function formatCurrency(num: number): string {
    return "$" + (num ?? 0).toFixed(2);
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

  /** Two-letter monogram for the design's 24px avatar. */
  function initials(user: UserAnalyticsItem): string {
    const source = (user.user_name || user.user_email || "").trim();
    if (!source) return "?";
    const words = source.split(/[\s._@-]+/).filter(Boolean);
    if (words.length === 0) return source.slice(0, 2).toLocaleUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase();
    return (words[0][0] + words[1][0]).toLocaleUpperCase();
  }

  function ariaSortFor(
    column: SortColumn,
  ): "ascending" | "descending" | "none" {
    if (sortBy !== column) return "none";
    return sortOrder === "asc" ? "ascending" : "descending";
  }

  // Fetch data on mount and when date range changes
  onMount(() => {
    fetchUserAnalytics();

    // Register refresh callback with parent
    if (onRefresh) {
      onRefresh(async () => {
        if (isLoading) {
          return;
        }

        await fetchUserAnalytics();
      });
    }
  });

  // Re-fetch when date range changes from parent
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
      fetchUserAnalytics(startDate, endDate);
    }, 1000);

    return () => {
      if (pendingDateUpdateTimer) {
        clearTimeout(pendingDateUpdateTimer);
      }
    };
  });

  // Auto-search when search query changes (with 300ms debounce)
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
      fetchUserAnalytics();
    }, 300);

    return () => {
      clearTimeout(searchTimer);
    };
  });
</script>

{#snippet sortCaret(column: SortColumn)}
  <span
    class="sort-caret"
    class:sort-caret--active={sortBy === column}
    aria-hidden="true"
  >
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
      {#if sortBy === column && sortOrder === "asc"}
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
{/snippet}

<div class="user-analytics-tab">
  {#if isLoading && users.length === 0}
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
          <label class="control-header-title" for="user-analytics-search">
            {$_("userAnalytics.filters.search")}
          </label>
          <label
            class="control-header-perpage-label"
            for="user-analytics-page-size"
          >
            {$_("userAnalytics.filters.perPage")}
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
              id="user-analytics-search"
              type="search"
              class="search-input"
              bind:value={searchQuery}
              placeholder={$_("userAnalytics.filters.searchPlaceholder")}
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
              id="user-analytics-page-size"
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
            {$_("userAnalytics.stats.totalUsers")}:
            <strong>{formatNumber(total)}</strong>
          </span>
          <span>
            {$_("userAnalytics.stats.showing")}:
            <strong
              >{$_("userAnalytics.stats.showingCount", {
                values: { filtered: users.length, total },
              })}</strong
            >
          </span>
        </div>
      </div>

      <!-- ============== users table ============== -->
      <div class="table-scroll">
        <div
          class="table-container"
          role="table"
          aria-label={$_("analytics.aria.userTableCaption")}
        >
          <div class="table-header" role="row">
            <span role="columnheader" aria-sort={ariaSortFor("name")}>
              <button
                type="button"
                class="sort-btn"
                onclick={() => handleSort("name")}
              >
                {$_("userAnalytics.table.userName")}
                {@render sortCaret("name")}
              </button>
            </span>
            <span role="columnheader" aria-sort={ariaSortFor("email")}>
              <button
                type="button"
                class="sort-btn"
                onclick={() => handleSort("email")}
              >
                {$_("userAnalytics.table.email")}
                {@render sortCaret("email")}
              </button>
            </span>
            <span role="columnheader">{$_("userAnalytics.table.department")}</span>
            <span
              class="num"
              role="columnheader"
              aria-sort={ariaSortFor("totalRequests")}
            >
              <button
                type="button"
                class="sort-btn sort-btn--num"
                onclick={() => handleSort("totalRequests")}
              >
                {$_("userAnalytics.table.requests")}
                {@render sortCaret("totalRequests")}
              </button>
            </span>
            <span class="num" role="columnheader"
              >{$_("userAnalytics.table.success")}</span
            >
            <span class="num" role="columnheader"
              >{$_("userAnalytics.table.errors")}</span
            >
            <span
              class="num"
              role="columnheader"
              aria-sort={ariaSortFor("totalTokens")}
            >
              <button
                type="button"
                class="sort-btn sort-btn--num"
                onclick={() => handleSort("totalTokens")}
              >
                {$_("userAnalytics.table.tokens")}
                {@render sortCaret("totalTokens")}
              </button>
            </span>
            <span
              class="num"
              role="columnheader"
              aria-sort={ariaSortFor("totalCost")}
            >
              <button
                type="button"
                class="sort-btn sort-btn--num"
                onclick={() => handleSort("totalCost")}
              >
                {$_("userAnalytics.table.cost")}
                {@render sortCaret("totalCost")}
              </button>
            </span>
            <span
              class="num"
              role="columnheader"
              aria-sort={ariaSortFor("averageLatency")}
            >
              <button
                type="button"
                class="sort-btn sort-btn--num"
                onclick={() => handleSort("averageLatency")}
              >
                {$_("userAnalytics.table.avgLatency")}
                {@render sortCaret("averageLatency")}
              </button>
            </span>
            <span role="columnheader" aria-sort={ariaSortFor("lastActivity")}>
              <button
                type="button"
                class="sort-btn"
                onclick={() => handleSort("lastActivity")}
              >
                {$_("userAnalytics.table.lastActive")}
                {@render sortCaret("lastActivity")}
              </button>
            </span>
          </div>

          {#if users.length === 0}
            <div class="empty-row" role="row">
              <span role="cell">
                {#if searchQuery}
                  {$_("userAnalytics.emptyState.noMatch", {
                    values: { query: searchQuery },
                  })}
                {:else}
                  {$_("userAnalytics.emptyState.noData")}
                {/if}
              </span>
            </div>
          {:else}
            {#each users as user (user.user_id)}
              <div class="user-row" role="row">
                <div role="cell">
                  <span class="user-avatar" aria-hidden="true"
                    >{initials(user)}</span
                  >
                  <span class="user-name" title={user.user_name || user.user_email}>
                    {user.user_name || user.user_email}
                  </span>
                </div>
                <div role="cell">
                  <span class="table-value" title={user.user_email}
                    >{user.user_email}</span
                  >
                </div>
                <div role="cell">
                  <span class="table-value--muted" title={user.department || "-"}
                    >{user.department || "-"}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatNumber(user.total_requests)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value--success"
                    >{formatNumber(user.success_count)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span
                    class="table-value"
                    class:table-value--error={user.error_count > 0}
                    >{formatNumber(user.error_count)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatCompact(user.total_tokens)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value--cost"
                    >{formatCurrency(user.total_cost)}</span
                  >
                </div>
                <div class="num" role="cell">
                  <span class="table-value"
                    >{formatLatency(user.average_latency)}</span
                  >
                </div>
                <div role="cell">
                  <span class="table-value"
                    >{formatRelativeDay(
                      user.last_activity,
                      $_("common.never"),
                    )}</span
                  >
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Pagination is not drawn in the design, so it only appears when needed. -->
      {#if totalPages > 1}
        <nav class="pagination" aria-label={$_("analytics.aria.pagination")}>
          <button
            type="button"
            class="pagination-btn"
            disabled={currentPage === 0}
            onclick={() => handlePageChange(currentPage - 1)}
          >
            {$_("userAnalytics.pagination.previous")}
          </button>

          <span class="pagination-info" aria-live="polite">
            {$_("userAnalytics.pagination.pageInfo", {
              values: { current: currentPage + 1, total: totalPages },
            })}
          </span>

          <button
            type="button"
            class="pagination-btn"
            disabled={currentPage >= totalPages - 1}
            onclick={() => handlePageChange(currentPage + 1)}
          >
            {$_("userAnalytics.pagination.next")}
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

  .user-analytics-tab {
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

  /* ---------------- table ---------------- */
  /* Ten columns don't fit 1176px, so the table scrolls sideways inside its
     rounded shell instead of crushing the name and email columns. */
  .table-scroll {
    border-radius: 12px;
    overflow-x: auto;
    box-shadow: inset 0 0 0 1px var(--gx-an-table-ring);
  }

  .table-container {
    min-width: 1120px;
    border-radius: 12px;
    overflow: hidden;
  }

  /* Header and rows share one track list so the columns line up. */
  .table-header,
  .user-row {
    display: grid;
    grid-template-columns:
      minmax(150px, 1.3fr)
      minmax(160px, 1.5fr)
      minmax(110px, 1.1fr)
      86px
      78px
      68px
      86px
      78px
      96px
      minmax(112px, 1fr);
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
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  /* Counts, cost and latency read right-aligned, as in the design. */
  .table-header > span.num,
  .table-header > span.num .sort-btn {
    justify-content: flex-end;
    text-align: end;
  }

  .user-row > div.num {
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
    font-weight: 700;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
    cursor: pointer;
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
     while that column is the active sort. */
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

  .user-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
  }

  .user-row > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: var(--gx-an-avatar-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: var(--gx-an-avatar-fg);
    flex-shrink: 0;
  }

  .user-name {
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-value--muted {
    font-weight: 500;
    font-size: 14px;
    line-height: 100%;
    color: var(--gx-an-sub);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    position: sticky;
    inset-inline-start: 0;
  }

  .empty-row span {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    text-align: center;
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
    .user-row {
      font-size: 12px;
    }
  }
</style>
