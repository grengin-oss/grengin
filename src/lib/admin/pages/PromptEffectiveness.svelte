<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import AdminEmptyState from "../components/AdminEmptyState.svelte";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import {
    getPromptMetrics,
    type PromptMetric,
  } from "../../api/admin/promptMetrics.js";
  import { getRoles, type Role } from "../../api/admin/roles.js";
  import {
    getRolePrompts,
    type RolePrompt,
  } from "../../api/admin/rolePrompts.js";
  import { getDepartments } from "../../api/admin/departments.js";
  import type { Department } from "../types.js";
  import { setPageTitle } from "../../utils/pageTitle";

  $effect(() => {
    setPageTitle($_("sidebar.promptEffectiveness"));
  });

  type TabId = "usage" | "effective" | "department" | "ab";
  type Grouping = "prompts" | "roles";
  type Layout = "grid" | "list";
  type SortKey = "usage" | "rating" | "feedback";

  /** One row of the "Usage per Prompt" table — a prompt, or a rolled-up role. */
  interface UsageRow {
    id: string;
    name: string;
    subtitle: string;
    usageCount: number;
    feedbackCount: number;
    thumbsUp: number;
    thumbsDown: number;
    rating: number;
  }

  const ROWS_PER_PAGE = 10;

  // ---------------- data ----------------
  let metrics = $state<PromptMetric[]>([]);
  let roles = $state<Role[]>([]);
  let prompts = $state<RolePrompt[]>([]);
  let departments = $state<Department[]>([]);
  let loading = $state(true);

  // ---------------- view state ----------------
  let activeTab = $state<TabId>("usage");
  let grouping = $state<Grouping>("prompts");
  let layout = $state<Layout>("list");
  let filterRoleId = $state("");
  let filterPromptId = $state("");
  let sortKey = $state<SortKey>("usage");
  let usageSearch = $state("");
  let deptSearch = $state("");
  let usagePage = $state(0);
  let deptPage = $state(0);
  let abVariantA = $state("");
  let abVariantB = $state("");

  // ---------------- derived ----------------
  let roleMap = $derived(
    roles.reduce<Record<string, string>>((m, r) => {
      m[r.id] = r.name;
      return m;
    }, {}),
  );

  function roleName(roleId: string): string {
    return roleMap[roleId] || $_("admin.promptEffectiveness.unknownRole");
  }

  /** Thumbs are derived from the rating the API reports over the feedback count. */
  function thumbsUpOf(m: PromptMetric): number {
    return Math.round(m.feedback_count * m.average_rating);
  }

  let filteredMetrics = $derived.by(() => {
    let result = metrics;
    if (filterRoleId) result = result.filter((m) => m.role_id === filterRoleId);
    if (filterPromptId)
      result = result.filter((m) => m.prompt_id === filterPromptId);
    return result;
  });

  // Summary stats — the four cards above the tabs.
  let totalUsage = $derived(
    filteredMetrics.reduce((sum, m) => sum + m.usage_count, 0),
  );
  let totalFeedback = $derived(
    filteredMetrics.reduce((sum, m) => sum + m.feedback_count, 0),
  );
  let thumbsUp = $derived(
    filteredMetrics.reduce((sum, m) => sum + thumbsUpOf(m), 0),
  );
  let thumbsDown = $derived(totalFeedback - thumbsUp);
  /** Weighted by feedback volume, so a 1-vote prompt cannot swing the average. */
  let avgRating = $derived(totalFeedback > 0 ? thumbsUp / totalFeedback : 0);

  /** Prompt rows, or the same metrics rolled up per role. */
  let groupedRows = $derived.by<UsageRow[]>(() => {
    if (grouping === "prompts") {
      return filteredMetrics.map((m) => {
        const up = thumbsUpOf(m);
        return {
          id: m.prompt_id,
          name: m.name,
          subtitle: roleName(m.role_id),
          usageCount: m.usage_count,
          feedbackCount: m.feedback_count,
          thumbsUp: up,
          thumbsDown: m.feedback_count - up,
          rating: m.average_rating,
        };
      });
    }

    const byRole = new Map<string, UsageRow>();
    for (const m of filteredMetrics) {
      const up = thumbsUpOf(m);
      const row = byRole.get(m.role_id) ?? {
        id: m.role_id,
        name: roleName(m.role_id),
        subtitle: "",
        usageCount: 0,
        feedbackCount: 0,
        thumbsUp: 0,
        thumbsDown: 0,
        rating: 0,
      };
      row.usageCount += m.usage_count;
      row.feedbackCount += m.feedback_count;
      row.thumbsUp += up;
      row.thumbsDown += m.feedback_count - up;
      byRole.set(m.role_id, row);
    }
    return [...byRole.values()].map((row) => ({
      ...row,
      rating: row.feedbackCount > 0 ? row.thumbsUp / row.feedbackCount : 0,
    }));
  });

  let searchedRows = $derived.by(() => {
    const q = usageSearch.trim().toLowerCase();
    if (!q) return groupedRows;
    return groupedRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q),
    );
  });

  let sortedRows = $derived.by(() =>
    [...searchedRows].sort((a, b) => {
      if (sortKey === "rating") return b.rating - a.rating;
      if (sortKey === "feedback") return b.feedbackCount - a.feedbackCount;
      return b.usageCount - a.usageCount;
    }),
  );

  /** The usage bars are drawn relative to the busiest row on the page. */
  let maxUsage = $derived(
    sortedRows.reduce((max, r) => Math.max(max, r.usageCount), 0),
  );

  let usageTotalPages = $derived(
    Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE)),
  );
  let pagedRows = $derived(
    sortedRows.slice(
      usagePage * ROWS_PER_PAGE,
      usagePage * ROWS_PER_PAGE + ROWS_PER_PAGE,
    ),
  );
  let pagedUsageTotal = $derived(
    sortedRows.reduce((sum, r) => sum + r.usageCount, 0),
  );

  // Ranked lists.
  let mostEffective = $derived(
    [...filteredMetrics]
      .sort((a, b) => b.average_rating - a.average_rating)
      .slice(0, 5),
  );
  let leastEffective = $derived(
    [...filteredMetrics]
      .filter((m) => m.feedback_count > 0)
      .sort((a, b) => a.average_rating - b.average_rating)
      .slice(0, 5),
  );

  // Department adoption: usage of the filtered prompts against department size.
  let departmentAdoption = $derived.by(() => {
    const promptsUsed = filteredMetrics.length;
    const usage = totalUsage;
    return departments
      .map((dept) => ({
        id: dept.id,
        name: dept.name,
        memberCount: dept.member_count,
        promptsUsed,
        totalUsage: usage,
        adoptionRate:
          dept.member_count > 0
            ? Math.min(100, Math.round((usage / dept.member_count) * 100))
            : 0,
      }))
      .sort((a, b) => b.adoptionRate - a.adoptionRate);
  });

  let searchedDepartments = $derived.by(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departmentAdoption;
    return departmentAdoption.filter((d) => d.name.toLowerCase().includes(q));
  });

  let deptTotalPages = $derived(
    Math.max(1, Math.ceil(searchedDepartments.length / ROWS_PER_PAGE)),
  );
  let pagedDepartments = $derived(
    searchedDepartments.slice(
      deptPage * ROWS_PER_PAGE,
      deptPage * ROWS_PER_PAGE + ROWS_PER_PAGE,
    ),
  );
  let deptTotalRequests = $derived(
    searchedDepartments.reduce((sum, d) => sum + d.totalUsage, 0),
  );
  /** Departments that report 0% only because nobody is assigned to them. */
  let unstaffedDepartments = $derived(
    searchedDepartments.filter((d) => d.memberCount === 0),
  );

  // A/B comparison.
  let variantAMetric = $derived(
    metrics.find((m) => m.prompt_id === abVariantA),
  );
  let variantBMetric = $derived(
    metrics.find((m) => m.prompt_id === abVariantB),
  );
  let variantDiff = $derived(
    variantAMetric && variantBMetric
      ? variantAMetric.average_rating - variantBMetric.average_rating
      : 0,
  );

  // Reset paging whenever the underlying set changes out from under it.
  $effect(() => {
    void filterRoleId;
    void filterPromptId;
    void grouping;
    void sortKey;
    void usageSearch;
    usagePage = 0;
  });

  $effect(() => {
    void filterRoleId;
    void filterPromptId;
    void deptSearch;
    deptPage = 0;
  });

  // Clamp the page if the list shrank beneath it.
  $effect(() => {
    if (usagePage > usageTotalPages - 1) usagePage = usageTotalPages - 1;
  });

  $effect(() => {
    if (deptPage > deptTotalPages - 1) deptPage = deptTotalPages - 1;
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const promptId = params.get("prompt_id");
    if (promptId) filterPromptId = promptId;
    loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [metricsRes, rolesRes, promptsRes, deptsRes] = await Promise.all([
        getPromptMetrics(),
        getRoles(),
        getRolePrompts(),
        getDepartments({ limit: 100 }),
      ]);
      metrics = metricsRes;
      roles = rolesRes.roles;
      prompts = promptsRes;
      departments = deptsRes.departments;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? getLocalizedError(err, "description", () => "")
          : (err as Error).message;
      toast.error(msg || $_("admin.promptEffectiveness.toast.failedToLoad"));
    } finally {
      loading = false;
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toLocaleString();
  }

  function ratingPercent(rating: number): string {
    return (rating * 100).toFixed(1) + "%";
  }

  function ratingColor(rating: number): string {
    if (rating >= 0.7) return "var(--pe-good)";
    if (rating >= 0.4) return "var(--pe-warn)";
    return "var(--pe-bad)";
  }

  /** Stable per-name tint, so a row keeps its colour across reloads. */
  function avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    const palette = [
      "var(--pe-avatar-blue)",
      "var(--pe-avatar-green)",
      "var(--pe-avatar-slate)",
    ];
    return palette[hash % palette.length];
  }

  function initial(name: string): string {
    return (name.trim()[0] || "?").toUpperCase();
  }

  function barWidth(value: number): number {
    if (maxUsage <= 0) return 0;
    return Math.max(1, Math.round((value / maxUsage) * 100));
  }
</script>

<div class="pe-container">
  <!-- ".page-header" -->
  <div class="page-header">
    <div class="header-text">
      <span class="page-title">{$_("admin.promptEffectiveness.title")}</span>
      <span class="page-sub">{$_("admin.promptEffectiveness.subtitle")}</span>
    </div>
    <button
      class="refresh-btn"
      type="button"
      onclick={loadData}
      disabled={loading}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M12.25 7A5.25 5.25 0 0 1 2.36 9.63M1.75 7A5.25 5.25 0 0 1 11.64 4.37M1.75 1.75v3.15h3.15M12.25 12.25V9.1H9.1" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>{$_("admin.promptEffectiveness.refresh")}</span>
    </button>
  </div>

  {#if loading}
    <LoadingSpinner text={$_("admin.promptEffectiveness.loading")} />
  {:else if metrics.length === 0}
    <AdminEmptyState
      title={$_("admin.promptEffectiveness.emptyTitle")}
      message={$_("admin.promptEffectiveness.emptyMessage")}
    >
      {#snippet icon()}
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
      {/snippet}
    </AdminEmptyState>
  {:else}
    <!-- ".tabs-container" — grouping switcher, live count, layout toggles -->
    <div class="tabs-container">
      <div
        class="tabs-switcher"
        role="tablist"
        aria-label={$_("admin.promptEffectiveness.usagePerPrompt")}
      >
        <button
          class="tsw-tab"
          type="button"
          role="tab"
          aria-selected={grouping === "prompts"}
          onclick={() => (grouping = "prompts")}
        >
          {$_("admin.promptEffectiveness.groupPrompts")}
        </button>
        <button
          class="tsw-tab"
          type="button"
          role="tab"
          aria-selected={grouping === "roles"}
          onclick={() => (grouping = "roles")}
        >
          {$_("admin.promptEffectiveness.groupRoles")}
        </button>
      </div>
      <div class="right-actions">
        <span class="role-count">
          {grouping === "prompts"
            ? $_("admin.promptEffectiveness.countPrompts", {
                values: { count: formatNumber(groupedRows.length) },
              })
            : $_("admin.promptEffectiveness.countRoles", {
                values: { count: formatNumber(groupedRows.length) },
              })}
        </span>
        <div
          class="layout-toggles"
          role="group"
          aria-label={$_("admin.promptEffectiveness.layout")}
        >
          <button
            class="grid-toggle"
            type="button"
            aria-pressed={layout === "grid"}
            onclick={() => (layout = "grid")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1.75" y="1.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="7.75" y="1.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="1.75" y="7.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="7.75" y="7.75" width="4.5" height="4.5" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>
            {$_("admin.promptEffectiveness.viewGrid")}
          </button>
          <button
            class="grid-toggle"
            type="button"
            aria-pressed={layout === "list"}
            onclick={() => (layout = "list")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.75 3.5h10.5M1.75 7h10.5M1.75 10.5h10.5" stroke="currentColor" stroke-width="1.4"/></svg>
            {$_("admin.promptEffectiveness.viewList")}
          </button>
        </div>
      </div>
    </div>

    <!-- ".filters" -->
    <div class="filters">
      <span class="filter-chip">
        <select
          bind:value={filterRoleId}
          aria-label={$_("admin.promptEffectiveness.filterByRole")}
        >
          <option value="">{$_("admin.promptEffectiveness.allRoles")}</option>
          {#each roles as role (role.id)}
            <option value={role.id}>{role.name}</option>
          {/each}
        </select>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
      </span>
      <span class="filter-chip">
        <select
          bind:value={filterPromptId}
          aria-label={$_("admin.promptEffectiveness.filterByPrompt")}
        >
          <option value="">{$_("admin.promptEffectiveness.allPrompts")}</option>
          {#each prompts as prompt (prompt.id)}
            <option value={prompt.id}>{prompt.name}</option>
          {/each}
        </select>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
      </span>
      <span class="filter-chip">
        <select
          bind:value={sortKey}
          aria-label={$_("admin.promptEffectiveness.sortBy")}
        >
          <option value="usage">{$_("admin.promptEffectiveness.sortMostUsed")}</option>
          <option value="rating">{$_("admin.promptEffectiveness.sortHighestRated")}</option>
          <option value="feedback">{$_("admin.promptEffectiveness.sortMostFeedback")}</option>
        </select>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
      </span>
    </div>

    <!-- ".stats-row" -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-card-header">
          <span>{$_("admin.promptEffectiveness.totalFeedback")}</span>
          <div class="stat-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.9 1.75h8.2v10.5l-2.9-1.75-2.4 1.75V1.75z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linejoin="round"/></svg></div>
        </div>
        <span class="stat-value">{formatNumber(totalFeedback)}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span>{$_("admin.promptEffectiveness.thumbsUp")}</span>
          <div class="stat-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.25 6.13V12h5.4c.6 0 1.1-.4 1.2-1l.9-4.4c.1-.7-.4-1.3-1.1-1.3H8.9l.4-2.3c.1-.7-.4-1.3-1.1-1.3-.4 0-.8.2-1 .6L5.25 6.13z" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round"/><path d="M1.75 6.13h2.6V12h-2.6z" stroke="currentColor" stroke-width="1" fill="none"/></svg></div>
        </div>
        <span class="stat-value">{formatNumber(thumbsUp)}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span>{$_("admin.promptEffectiveness.thumbsDown")}</span>
          <div class="stat-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8.75 7.87V2h-5.4c-.6 0-1.1.4-1.2 1l-.9 4.4c-.1.7.4 1.3 1.1 1.3h2.75l-.4 2.3c-.1.7.4 1.3 1.1 1.3.4 0 .8-.2 1-.6l2.05-3.87z" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round"/><path d="M12.25 7.87h-2.6V2h2.6z" stroke="currentColor" stroke-width="1" fill="none"/></svg></div>
        </div>
        <span class="stat-value">{formatNumber(thumbsDown)}</span>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span>{$_("admin.promptEffectiveness.avgRating")}</span>
          <div class="stat-icon"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.75l1.6 3.24 3.58.52-2.59 2.52.61 3.57L7 9.94l-3.2 1.66.61-3.57L1.82 5.51l3.58-.52L7 1.75z" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round"/></svg></div>
        </div>
        <span class="stat-value" style:color={totalFeedback > 0 ? ratingColor(avgRating) : null}>
          {totalFeedback > 0 ? ratingPercent(avgRating) : "—"}
        </span>
      </div>
    </div>

    <!-- ".info-banner" -->
    <div
      class="info-banner {totalFeedback > 0
        ? 'info-banner--green'
        : 'info-banner--blue'}"
      role="status"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.2v3.4M8 5v.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>
        {#if totalFeedback > 0}
          {$_("admin.promptEffectiveness.bannerFeedback", {
            values: {
              count: formatNumber(totalFeedback),
              rate: ratingPercent(avgRating),
              prompts: formatNumber(filteredMetrics.length),
            },
          })}
        {:else}
          {$_("admin.promptEffectiveness.bannerNoFeedback")}
        {/if}
      </span>
    </div>

    <!-- ".segmented-tabs" -->
    <div
      class="segmented-tabs"
      role="tablist"
      aria-label={$_("admin.promptEffectiveness.title")}
    >
      <button
        class="seg-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === "usage"}
        onclick={() => (activeTab = "usage")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.9 1.75h1.4v10.5H2.9zM6.3 6.13h1.4v6.12H6.3zM9.7 4h1.4v8.25H9.7z" fill="currentColor"/></svg>
        {$_("admin.promptEffectiveness.usagePerPrompt")}
      </button>
      <button
        class="seg-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === "effective"}
        onclick={() => (activeTab = "effective")}
      >
        {$_("admin.promptEffectiveness.mostEffective")}
      </button>
      <button
        class="seg-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === "department"}
        onclick={() => (activeTab = "department")}
      >
        {$_("admin.promptEffectiveness.departmentAdoption")}
      </button>
      <button
        class="seg-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === "ab"}
        onclick={() => (activeTab = "ab")}
      >
        {$_("admin.promptEffectiveness.abTest.title")}
      </button>
    </div>

    <!-- ---------------- USAGE PER PROMPT ---------------- -->
    {#if activeTab === "usage"}
      <div class="tab-panel">
        <div class="table-card">
          <div class="table-filter">
            <div class="search-box">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.25" stroke="currentColor" stroke-width="1.2"/><path d="m11 11-2-2" stroke="currentColor" stroke-width="1.2"/></svg>
              <input
                type="text"
                bind:value={usageSearch}
                placeholder={grouping === "prompts"
                  ? $_("admin.promptEffectiveness.searchPrompts")
                  : $_("admin.promptEffectiveness.searchRoles")}
                aria-label={grouping === "prompts"
                  ? $_("admin.promptEffectiveness.searchPrompts")
                  : $_("admin.promptEffectiveness.searchRoles")}
              />
            </div>
            <span class="showing-count">
              {grouping === "prompts"
                ? $_("admin.promptEffectiveness.showingPrompts", {
                    values: {
                      shown: formatNumber(pagedRows.length),
                      total: formatNumber(sortedRows.length),
                    },
                  })
                : $_("admin.promptEffectiveness.showingRoles", {
                    values: {
                      shown: formatNumber(pagedRows.length),
                      total: formatNumber(sortedRows.length),
                    },
                  })}
            </span>
          </div>

          {#if sortedRows.length === 0}
            <div class="empty-state">
              <svg class="empty-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="18.3" cy="18.3" r="11.7" stroke="currentColor" stroke-width="1.7"/><path d="m30 30-5.5-5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              <div class="empty-text-group">
                <span class="empty-title">{$_("admin.promptEffectiveness.noResults")}</span>
                <span class="empty-desc">{$_("admin.promptEffectiveness.noResultsMessage")}</span>
              </div>
            </div>
          {:else if layout === "list"}
            <div class="table-scroll">
              <div class="thead-row">
                <span class="col-name">
                  {grouping === "prompts"
                    ? $_("admin.promptEffectiveness.columns.prompt")
                    : $_("admin.promptEffectiveness.columns.role")}
                </span>
                <span class="col-usage">{$_("admin.promptEffectiveness.columns.usage")}</span>
                <span class="col-fixed">{$_("admin.promptEffectiveness.columns.feedback")}</span>
                <span class="col-fixed">{$_("admin.promptEffectiveness.columns.thumbsUp")}</span>
                <span class="col-fixed">{$_("admin.promptEffectiveness.columns.thumbsDown")}</span>
                <span class="col-fixed">{$_("admin.promptEffectiveness.columns.rating")}</span>
              </div>
              {#each pagedRows as row (row.id)}
                <div class="data-row">
                  <div class="name-cell">
                    <span class="avatar-sq" style:background={avatarColor(row.name)}>
                      {initial(row.name)}
                    </span>
                    <span class="name-cell-text">{row.name}</span>
                    {#if row.subtitle}
                      <span class="role-pill">{row.subtitle}</span>
                    {/if}
                  </div>
                  <div class="progress-cell col-usage">
                    <span class="progress-val">{formatNumber(row.usageCount)}</span>
                    <div class="progress-track">
                      <div class="progress-fill" style:width="{barWidth(row.usageCount)}%"></div>
                    </div>
                  </div>
                  <span class="dash-cell">
                    {row.feedbackCount > 0 ? formatNumber(row.feedbackCount) : "—"}
                  </span>
                  <span class="dash-cell">
                    {row.feedbackCount > 0 ? formatNumber(row.thumbsUp) : "—"}
                  </span>
                  <span class="dash-cell">
                    {row.feedbackCount > 0 ? formatNumber(row.thumbsDown) : "—"}
                  </span>
                  <span class="dash-cell">
                    {#if row.feedbackCount > 0}
                      <span class="rating-value" style:color={ratingColor(row.rating)}>
                        {ratingPercent(row.rating)}
                      </span>
                    {:else}
                      <span class="nodata-badge">{$_("admin.promptEffectiveness.noDataBadge")}</span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="usage-grid">
              {#each pagedRows as row (row.id)}
                <div class="usage-card">
                  <div class="usage-card-head">
                    <span class="avatar-sq" style:background={avatarColor(row.name)}>
                      {initial(row.name)}
                    </span>
                    <div class="usage-card-title">
                      <span class="name-cell-text">{row.name}</span>
                      {#if row.subtitle}
                        <span class="usage-card-sub">{row.subtitle}</span>
                      {/if}
                    </div>
                    {#if row.feedbackCount > 0}
                      <span class="rating-value" style:color={ratingColor(row.rating)}>
                        {ratingPercent(row.rating)}
                      </span>
                    {:else}
                      <span class="nodata-badge">{$_("admin.promptEffectiveness.noDataBadge")}</span>
                    {/if}
                  </div>
                  <div class="progress-cell">
                    <span class="progress-val">{formatNumber(row.usageCount)}</span>
                    <div class="progress-track">
                      <div class="progress-fill" style:width="{barWidth(row.usageCount)}%"></div>
                    </div>
                  </div>
                  <div class="usage-card-stats">
                    <div class="usage-stat">
                      <span class="usage-stat-label">{$_("admin.promptEffectiveness.columns.feedback")}</span>
                      <span class="usage-stat-value">{formatNumber(row.feedbackCount)}</span>
                    </div>
                    <div class="usage-stat">
                      <span class="usage-stat-label">{$_("admin.promptEffectiveness.columns.thumbsUp")}</span>
                      <span class="usage-stat-value">{formatNumber(row.thumbsUp)}</span>
                    </div>
                    <div class="usage-stat">
                      <span class="usage-stat-label">{$_("admin.promptEffectiveness.columns.thumbsDown")}</span>
                      <span class="usage-stat-value">{formatNumber(row.thumbsDown)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="table-footer">
            <span class="footer-count">
              {grouping === "prompts"
                ? $_("admin.promptEffectiveness.footerPrompts", {
                    values: {
                      count: formatNumber(sortedRows.length),
                      usage: formatNumber(pagedUsageTotal),
                    },
                  })
                : $_("admin.promptEffectiveness.footerRoles", {
                    values: {
                      count: formatNumber(sortedRows.length),
                      usage: formatNumber(pagedUsageTotal),
                    },
                  })}
            </span>
            <div class="pagination">
              <button
                class="page-btn"
                type="button"
                onclick={() => (usagePage -= 1)}
                disabled={usagePage === 0}
                aria-label={$_("admin.common.previousPage")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8.75 3.5 5.25 7l3.5 3.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
                {$_("admin.promptEffectiveness.prev")}
              </button>
              <button
                class="page-btn"
                type="button"
                onclick={() => (usagePage += 1)}
                disabled={usagePage >= usageTotalPages - 1}
                aria-label={$_("admin.common.nextPage")}
              >
                {$_("admin.promptEffectiveness.next")}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.25 3.5 8.75 7l-3.5 3.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

    <!-- ---------------- MOST / LEAST EFFECTIVE ---------------- -->
    {:else if activeTab === "effective"}
      <div class="tab-panel">
        <div class="columns-row">
          <div class="effective-card">
            <div class="card-title-group">
              <span class="status-dot status-dot--green"></span>
              <span>{$_("admin.promptEffectiveness.mostEffective")}</span>
            </div>
            {#if mostEffective.length > 0}
              <div class="numbered-list">
                {#each mostEffective as m, i (m.prompt_id)}
                  <div class="list-item">
                    <div class="list-item-left">
                      <span class="number-badge">{i + 1}</span>
                      <span class="list-item-name">{m.name}</span>
                      <span class="role-pill">{roleName(m.role_id)}</span>
                    </div>
                    {#if m.feedback_count > 0}
                      <span class="rating-value" style:color={ratingColor(m.average_rating)}>
                        {ratingPercent(m.average_rating)}
                      </span>
                    {:else}
                      <span class="nodata-badge">{$_("admin.promptEffectiveness.noDataBadge")}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state">
                <svg class="empty-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16.7" stroke="currentColor" stroke-width="1.7"/><path d="M13.3 23.3c1.5 2.2 3.9 3.3 6.7 3.3s5.2-1.1 6.7-3.3M15 15.8h.02M25 15.8h.02" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <div class="empty-text-group">
                  <span class="empty-title">{$_("admin.promptEffectiveness.noData")}</span>
                  <span class="empty-desc">{$_("admin.promptEffectiveness.mostEffectiveEmptyMessage")}</span>
                </div>
              </div>
            {/if}
          </div>

          <div class="effective-card">
            <div class="card-title-group">
              <span class="status-dot status-dot--red"></span>
              <span>{$_("admin.promptEffectiveness.leastEffective")}</span>
            </div>
            {#if leastEffective.length > 0}
              <div class="numbered-list">
                {#each leastEffective as m, i (m.prompt_id)}
                  <div class="list-item">
                    <div class="list-item-left">
                      <span class="number-badge number-badge--low">{i + 1}</span>
                      <span class="list-item-name">{m.name}</span>
                      <span class="role-pill">{roleName(m.role_id)}</span>
                    </div>
                    <span class="rating-value" style:color={ratingColor(m.average_rating)}>
                      {ratingPercent(m.average_rating)}
                    </span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state">
                <svg class="empty-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16.7" stroke="currentColor" stroke-width="1.7"/><path d="M13.3 25c1.5-2.2 3.9-3.3 6.7-3.3s5.2 1.1 6.7 3.3M15 15.8h.02M25 15.8h.02" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <div class="empty-text-group">
                  <span class="empty-title">{$_("admin.promptEffectiveness.noData")}</span>
                  <span class="empty-desc">{$_("admin.promptEffectiveness.leastEffectiveEmptyMessage")}</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

    <!-- ---------------- DEPARTMENT ADOPTION ---------------- -->
    {:else if activeTab === "department"}
      <div class="tab-panel">
        <div class="table-card">
          <div class="table-filter">
            <div class="search-box">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.25" stroke="currentColor" stroke-width="1.2"/><path d="m11 11-2-2" stroke="currentColor" stroke-width="1.2"/></svg>
              <input
                type="text"
                bind:value={deptSearch}
                placeholder={$_("admin.promptEffectiveness.searchDepartments")}
                aria-label={$_("admin.promptEffectiveness.searchDepartments")}
              />
            </div>
            <span class="showing-count">
              {$_("admin.promptEffectiveness.showingDepartments", {
                values: {
                  shown: formatNumber(pagedDepartments.length),
                  total: formatNumber(searchedDepartments.length),
                },
              })}
            </span>
          </div>

          {#if searchedDepartments.length === 0}
            <div class="empty-state">
              <svg class="empty-icon" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6.7 33.3V10l11.6-5v28.3M18.3 33.3h15V18.3l-15-4.2M11.7 15v3.3M11.7 23.3v3.3M25 22.5v3.3" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <div class="empty-text-group">
                <span class="empty-title">{$_("admin.promptEffectiveness.noDepartments")}</span>
                <span class="empty-desc">{$_("admin.promptEffectiveness.noResultsMessage")}</span>
              </div>
            </div>
          {:else}
            <div class="table-scroll">
              <div class="thead-row">
                <span class="col-name">{$_("admin.promptEffectiveness.columns.department")}</span>
                <span class="col-fixed col-120">{$_("admin.promptEffectiveness.columns.members")}</span>
                <span class="col-fixed col-120">{$_("admin.promptEffectiveness.columns.promptsUsed")}</span>
                <span class="col-fixed col-120">{$_("admin.promptEffectiveness.columns.totalUsage")}</span>
                <span class="col-adoption">{$_("admin.promptEffectiveness.columns.adoptionRate")}</span>
              </div>
              {#each pagedDepartments as dept (dept.id)}
                <div class="data-row">
                  <div class="name-cell">
                    <span class="avatar-sq" style:background={avatarColor(dept.name)}>
                      {initial(dept.name)}
                    </span>
                    <span class="name-cell-text">{dept.name}</span>
                  </div>
                  <span class="dash-cell col-120">{formatNumber(dept.memberCount)}</span>
                  <span class="dash-cell col-120">
                    {$_("admin.promptEffectiveness.countPrompts", {
                      values: { count: formatNumber(dept.promptsUsed) },
                    })}
                  </span>
                  <span class="dash-cell col-120">{formatNumber(dept.totalUsage)}</span>
                  <div class="progress-cell col-adoption">
                    <span
                      class="progress-val"
                      class:progress-val--muted={dept.adoptionRate === 0}
                    >
                      {dept.adoptionRate}%
                    </span>
                    <div class="progress-track">
                      <div
                        class="progress-fill progress-fill--adoption"
                        class:progress-fill--empty={dept.adoptionRate === 0}
                        style:width="{Math.max(3, dept.adoptionRate)}%"
                      ></div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="table-footer">
            <span class="footer-count">
              {$_("admin.promptEffectiveness.footerDepartments", {
                values: {
                  count: formatNumber(searchedDepartments.length),
                  usage: formatNumber(deptTotalRequests),
                },
              })}
            </span>
            <div class="pagination">
              <button
                class="page-btn"
                type="button"
                onclick={() => (deptPage -= 1)}
                disabled={deptPage === 0}
                aria-label={$_("admin.common.previousPage")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8.75 3.5 5.25 7l3.5 3.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
                {$_("admin.promptEffectiveness.prev")}
              </button>
              <button
                class="page-btn"
                type="button"
                onclick={() => (deptPage += 1)}
                disabled={deptPage >= deptTotalPages - 1}
                aria-label={$_("admin.common.nextPage")}
              >
                {$_("admin.promptEffectiveness.next")}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.25 3.5 8.75 7l-3.5 3.5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
              </button>
            </div>
          </div>
        </div>

        {#if unstaffedDepartments.length > 0}
          <div class="info-banner info-banner--blue" role="status">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.2v3.4M8 5v.01" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            <span>
              {$_("admin.promptEffectiveness.bannerZeroAdoption", {
                values: {
                  departments: unstaffedDepartments.map((d) => d.name).join(", "),
                },
              })}
            </span>
          </div>
        {/if}
      </div>

    <!-- ---------------- A/B TEST COMPARISON ---------------- -->
    {:else}
      <div class="tab-panel">
        <div class="comparison-card">
          <div class="comparison-head">
            <span class="comparison-title">{$_("admin.promptEffectiveness.abTest.title")}</span>
            <span class="comparison-sub">{$_("admin.promptEffectiveness.abTest.description")}</span>
          </div>

          <div class="variant-selectors">
            <div class="variant-container">
              <label class="variant-label" for="ab-variant-a">
                {$_("admin.promptEffectiveness.abTest.variantA")}
              </label>
              <div class="variant-dropdown">
                <select id="ab-variant-a" bind:value={abVariantA}>
                  <option value="">{$_("admin.promptEffectiveness.abTest.selectPrompt")}</option>
                  {#each metrics as m (m.prompt_id)}
                    <option value={m.prompt_id}>{m.name}</option>
                  {/each}
                </select>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
              </div>
            </div>
            <div class="vs-badge-wrap"><div class="vs-badge">VS</div></div>
            <div class="variant-container">
              <label class="variant-label" for="ab-variant-b">
                {$_("admin.promptEffectiveness.abTest.variantB")}
              </label>
              <div class="variant-dropdown">
                <select id="ab-variant-b" bind:value={abVariantB}>
                  <option value="">{$_("admin.promptEffectiveness.abTest.selectPrompt")}</option>
                  {#each metrics as m (m.prompt_id)}
                    <option value={m.prompt_id}>{m.name}</option>
                  {/each}
                </select>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
              </div>
            </div>
          </div>

          {#if variantAMetric && variantBMetric}
            <div class="ab-results">
              {#each [{ tag: "A", metric: variantAMetric }, { tag: "B", metric: variantBMetric }] as variant (variant.tag)}
                <div class="ab-panel">
                  <div class="ab-panel-head">
                    <span class="vs-badge ab-tag">{variant.tag}</span>
                    <span class="ab-panel-name">{variant.metric.name}</span>
                    <span class="role-pill">{roleName(variant.metric.role_id)}</span>
                  </div>
                  <div class="ab-metrics">
                    <div class="ab-metric">
                      <span class="ab-metric-label">{$_("admin.promptEffectiveness.columns.usage")}</span>
                      <span class="ab-metric-value">{formatNumber(variant.metric.usage_count)}</span>
                    </div>
                    <div class="ab-metric">
                      <span class="ab-metric-label">{$_("admin.promptEffectiveness.columns.feedback")}</span>
                      <span class="ab-metric-value">{formatNumber(variant.metric.feedback_count)}</span>
                    </div>
                    <div class="ab-metric">
                      <span class="ab-metric-label">{$_("admin.promptEffectiveness.columns.rating")}</span>
                      {#if variant.metric.feedback_count > 0}
                        <span
                          class="ab-metric-value"
                          style:color={ratingColor(variant.metric.average_rating)}
                        >
                          {ratingPercent(variant.metric.average_rating)}
                        </span>
                      {:else}
                        <span class="nodata-badge">{$_("admin.promptEffectiveness.noDataBadge")}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="ab-verdict">
              {#if variantDiff > 0}
                <span class="ab-verdict-pill ab-verdict-pill--a">
                  {$_("admin.promptEffectiveness.abTest.variantA")}
                  {$_("admin.promptEffectiveness.abTest.leadsBy")}
                  {ratingPercent(variantDiff)}
                </span>
              {:else if variantDiff < 0}
                <span class="ab-verdict-pill ab-verdict-pill--b">
                  {$_("admin.promptEffectiveness.abTest.variantB")}
                  {$_("admin.promptEffectiveness.abTest.leadsBy")}
                  {ratingPercent(Math.abs(variantDiff))}
                </span>
              {:else}
                <span class="ab-verdict-pill">
                  {$_("admin.promptEffectiveness.abTest.tied")}
                </span>
              {/if}
            </div>
          {:else}
            <div class="comparison-empty">
              <svg width="44" height="40" viewBox="0 0 44 40" fill="none" aria-hidden="true" class="empty-icon"><path d="M10 8v27h27M18 27V16M27 27V10M35 27V19" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <div class="empty-text-group">
                <span class="empty-title">
                  {abVariantA || abVariantB
                    ? $_("admin.promptEffectiveness.abTest.selectBoth")
                    : $_("admin.promptEffectiveness.abTest.emptyTitle")}
                </span>
                <span class="empty-desc">{$_("admin.promptEffectiveness.abTest.emptyMessage")}</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ===== prompt-effectiveness.html, transcribed. The mockup's :root block
     lives here, page-local, rather than in app.css: values an existing --gx-*
     token already carries reuse it (so the dark scheme follows for free), and
     the handful it does not carry are literals with a dark override below. ===== */

  .pe-container {
    --pe-border: var(--gx-mcp-m-ring); /* rgb(228,229,233) */
    --pe-row-border: rgb(238, 240, 243);
    --pe-title: rgb(17, 24, 39);
    --pe-desc: var(--gx-an-chip-fg); /* rgb(75,85,99) */
    --pe-muted: rgb(156, 163, 175);
    --pe-field-bg: var(--gx-mcp-code-bg); /* rgb(248,248,249) */
    --pe-stat-icon-bg: rgba(59, 130, 246, 0.0863);
    --pe-avatar-blue: var(--gx-org-primary-500);
    --pe-avatar-green: rgb(46, 168, 117);
    --pe-avatar-slate: var(--pe-muted);
    --pe-good: var(--gx-org-brand-alt);
    --pe-warn: var(--gx-an-amber);
    --pe-bad: var(--gx-danger);
    --pe-tab-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.0314);
    --pe-toggle-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.051);
    --pe-seg-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.0314);
  }

  @media (prefers-color-scheme: dark) {
    .pe-container {
      --pe-row-border: rgba(255, 255, 255, 0.08);
      --pe-title: var(--gx-slate-900);
      --pe-muted: var(--gx-org-slate-350);
      --pe-stat-icon-bg: rgba(59, 130, 246, 0.18);
      --pe-avatar-green: rgb(52, 138, 102);
      --pe-tab-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
      --pe-toggle-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.45);
      --pe-seg-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.45);
    }
  }

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
  .pe-container {
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
    height: 55px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    gap: 16px;
  }

  .header-text {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    align-items: flex-end;
    text-align: right;
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

  .refresh-btn {
    height: 32px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    align-items: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 13px;
    color: var(--pe-desc);
    white-space: nowrap;
    transition:
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .refresh-btn svg {
    display: block;
    color: var(--pe-desc);
    transition: color 120ms ease;
  }

  .refresh-btn:hover:not(:disabled),
  .refresh-btn:hover:not(:disabled) svg {
    color: var(--gx-org-primary-500);
  }

  .refresh-btn:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .refresh-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  /* ---------------- ".tabs-container" ---------------- */
  .tabs-container {
    height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    gap: 16px;
  }

  .tabs-switcher {
    height: 36px;
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 4px;
    padding: 4px;
    flex-shrink: 0;
  }

  .tsw-tab {
    height: 28px;
    border-radius: 6px;
    padding: 6px 16px;
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .tsw-tab[aria-selected="true"] {
    background: var(--gx-card);
    box-shadow: var(--pe-tab-shadow);
    color: var(--gx-org-ink);
  }

  .tsw-tab:focus-visible,
  .grid-toggle:focus-visible,
  .seg-tab:focus-visible,
  .page-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .right-actions {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-shrink: 0;
  }

  .role-count {
    font-weight: 400;
    font-size: 13px;
    color: var(--gx-an-sub);
    white-space: nowrap;
  }

  .layout-toggles {
    height: 31px;
    border-radius: 8px;
    background: var(--gx-ring-soft);
    display: flex;
    gap: 2px;
    padding: 2px;
    flex-shrink: 0;
  }

  .grid-toggle {
    height: 27px;
    border-radius: 6px;
    display: flex;
    gap: 6px;
    padding: 6px 12px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    color: var(--gx-an-sub);
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .grid-toggle svg {
    display: block;
    color: currentColor;
  }

  .grid-toggle[aria-pressed="true"] {
    background: var(--gx-card);
    box-shadow: var(--pe-toggle-shadow);
    color: var(--gx-org-primary-500);
  }

  /* ---------------- ".filters" ---------------- */
  .filters {
    display: flex;
    gap: 8px;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .filter-chip {
    height: 32px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    gap: 6px;
    padding: 8px 12px;
    align-items: center;
    font-weight: 500;
    font-size: 13px;
    color: var(--pe-desc);
    white-space: nowrap;
    transition: box-shadow 120ms ease;
  }

  .filter-chip:hover,
  .filter-chip:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .filter-chip svg {
    display: block;
    color: var(--pe-desc);
    flex-shrink: 0;
  }

  .filter-chip select {
    width: auto;
    font-weight: 500;
    font-size: 13px;
    color: var(--pe-desc);
  }

  /* ---------------- ".stats-row" ---------------- */
  .stats-row {
    display: flex;
    gap: 16px;
    align-self: stretch;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .stat-card {
    flex: 1 1 200px;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--pe-border),
      var(--gx-org-card-shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-width: 0;
  }

  .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .stat-card-header span {
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--pe-desc);
    min-width: 0;
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--pe-stat-icon-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--gx-an-dot);
  }

  .stat-icon svg {
    display: block;
  }

  .stat-value {
    font-weight: 700;
    font-size: 24px;
    color: var(--pe-title);
  }

  /* ---------------- ".info-banner" ---------------- */
  .info-banner {
    min-height: 44px;
    border-radius: 10px;
    display: flex;
    gap: 12px;
    padding: 14px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
  }

  .info-banner svg {
    display: block;
    flex-shrink: 0;
  }

  .info-banner span {
    font-weight: 500;
    font-size: 13px;
    flex-grow: 1;
  }

  .info-banner--blue {
    background: var(--gx-ae-callout-bg);
    box-shadow: inset 0 0 0 1px var(--gx-an-bar-blue);
  }

  .info-banner--blue svg,
  .info-banner--blue span {
    color: var(--gx-an-blue-label);
  }

  .info-banner--green {
    background: var(--gx-org-brand-alt-tint);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-edge-ok);
  }

  .info-banner--green svg,
  .info-banner--green span {
    color: var(--gx-org-brand-alt);
  }

  /* ---------------- ".segmented-tabs" ---------------- */
  .segmented-tabs {
    min-height: 40px;
    border-radius: 10px;
    background: var(--gx-mcp-m-hair);
    display: flex;
    gap: 2px;
    padding: 4px;
    align-self: stretch;
    flex-shrink: 0;
  }

  .seg-tab {
    flex: 1 1 0;
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    gap: 6px;
    justify-content: center;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    color: var(--pe-desc);
    white-space: nowrap;
    min-width: 0;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      box-shadow 120ms ease;
  }

  .seg-tab svg {
    display: block;
    color: currentColor;
    flex-shrink: 0;
  }

  .seg-tab[aria-selected="true"] {
    background: var(--gx-card);
    box-shadow: var(--pe-seg-shadow);
    color: var(--gx-org-primary-500);
  }

  .tab-panel {
    display: flex;
    flex-direction: column;
    gap: 28px;
    align-self: stretch;
  }

  /* ---------------- ".table-card" ---------------- */
  .table-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    align-self: stretch;
  }

  .table-filter {
    min-height: 64px;
    border-bottom: 1px solid var(--pe-row-border);
    display: flex;
    padding: 16px;
    gap: 16px;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-box {
    width: 280px;
    max-width: 100%;
    height: 32px;
    border-radius: 8px;
    background: var(--pe-field-bg);
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    align-items: center;
  }

  .search-box:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .search-box svg {
    display: block;
    color: var(--pe-desc);
    flex-shrink: 0;
  }

  .search-box input {
    flex-grow: 1;
    min-width: 0;
    font-size: 13px;
    color: var(--pe-title);
    cursor: text;
  }

  .search-box input::placeholder {
    color: var(--pe-muted);
  }

  .showing-count {
    font-weight: 500;
    font-size: 13px;
    color: var(--pe-desc);
    white-space: nowrap;
  }

  .thead-row {
    min-height: 39px;
    background: var(--pe-field-bg);
    display: flex;
    gap: 12px;
    padding: 12px 20px;
    align-items: center;
  }

  .thead-row span {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--pe-desc);
  }

  .col-name {
    flex-grow: 1;
    min-width: 0;
  }

  .col-fixed {
    width: 100px;
    flex-shrink: 0;
  }

  .col-120 {
    width: 120px;
  }

  .col-usage {
    width: 180px;
    flex-shrink: 0;
  }

  .col-adoption {
    width: 200px;
    flex-shrink: 0;
  }

  .data-row {
    min-height: 52px;
    border-top: 1px solid var(--pe-row-border);
    display: flex;
    gap: 12px;
    padding: 14px 20px;
    align-items: center;
    transition: background-color 120ms ease;
  }

  .data-row:hover {
    background: var(--gx-org-row-hover);
  }

  .name-cell {
    flex-grow: 1;
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .avatar-sq {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: 11px;
    line-height: 1;
    color: #fff;
  }

  .name-cell-text {
    font-weight: 600;
    font-size: 13px;
    color: var(--pe-title);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dash-cell {
    width: 100px;
    flex-shrink: 0;
    font-size: 13px;
    color: var(--pe-muted);
  }

  .rating-value {
    font-weight: 600;
    font-size: 13px;
  }

  .nodata-badge {
    border-radius: 6px;
    background: var(--gx-an-insight-bg);
    padding: 3px 8px;
    font-weight: 500;
    font-size: 11px;
    color: var(--pe-desc);
    display: inline-flex;
    width: fit-content;
  }

  .progress-cell {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .progress-val {
    width: 36px;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 13px;
    color: var(--pe-title);
  }

  .progress-val--muted {
    color: var(--pe-desc);
  }

  .progress-track {
    flex-grow: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--gx-an-grid);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--gx-org-primary-500);
  }

  .progress-fill--adoption {
    background: var(--pe-avatar-green);
  }

  .progress-fill--empty {
    background: var(--gx-an-grid);
  }

  .table-footer {
    min-height: 59px;
    display: flex;
    padding: 16px;
    gap: 16px;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }

  .footer-count {
    font-weight: 500;
    font-size: 13px;
    color: var(--pe-desc);
  }

  .pagination {
    display: flex;
    gap: 8px;
  }

  .page-btn {
    height: 27px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    gap: 4px;
    padding: 6px 10px;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
    color: var(--pe-desc);
    transition: box-shadow 120ms ease;
  }

  .page-btn svg {
    display: block;
    color: currentColor;
  }

  .page-btn:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  /* Grid layout for the usage panel — the same card language as ".stat-card". */
  .usage-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    padding: 20px;
  }

  .usage-card {
    border-radius: 12px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-row-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    min-width: 0;
    transition: box-shadow 120ms ease;
  }

  .usage-card:hover {
    box-shadow:
      inset 0 0 0 1px var(--pe-border),
      var(--gx-org-card-shadow);
  }

  .usage-card-head {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .usage-card-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }

  .usage-card-sub {
    font-weight: 400;
    font-size: 11px;
    color: var(--pe-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .usage-card-stats {
    display: flex;
    gap: 8px;
  }

  .usage-stat {
    flex: 1 1 0;
    border-radius: 8px;
    background: var(--pe-field-bg);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    min-width: 0;
  }

  .usage-stat-label {
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 0.4px;
    line-height: 13px;
    text-transform: uppercase;
    color: var(--pe-muted);
  }

  .usage-stat-value {
    font-weight: 700;
    font-size: 14px;
    color: var(--pe-title);
  }

  /* ---------------- most / least effective ---------------- */
  .columns-row {
    display: flex;
    gap: 20px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .effective-card {
    flex: 1 1 380px;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    min-width: 0;
  }

  .card-title-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot--green {
    background: var(--gx-an-green);
  }

  .status-dot--red {
    background: var(--gx-danger);
  }

  .card-title-group span:last-child {
    font-weight: 600;
    font-size: 16px;
    color: var(--pe-title);
  }

  .numbered-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .list-item {
    border-radius: 8px;
    background: var(--pe-field-bg);
    box-shadow: inset 0 0 0 1px var(--pe-row-border);
    display: flex;
    gap: 12px;
    padding: 12px;
    justify-content: space-between;
    align-items: center;
  }

  .list-item-left {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .number-badge {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: var(--gx-an-badge-up-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 11px;
    color: var(--gx-ok-text);
    flex-shrink: 0;
  }

  .number-badge--low {
    background: var(--gx-an-badge-down-bg);
    color: var(--gx-an-badge-down-fg);
  }

  .list-item-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--pe-title);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-pill {
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    padding: 2px 8px;
    font-weight: 500;
    font-size: 11px;
    color: var(--pe-desc);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 48px 0;
    justify-content: center;
    align-items: center;
    align-self: stretch;
  }

  .empty-icon {
    display: block;
    color: var(--pe-muted);
  }

  .empty-text-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    max-width: 360px;
  }

  .empty-title {
    font-weight: 600;
    font-size: 15px;
    color: var(--pe-title);
    text-align: center;
  }

  .empty-desc {
    font-weight: 400;
    font-size: 13px;
    color: var(--pe-desc);
    text-align: center;
  }

  /* ---------------- A/B comparison ---------------- */
  .comparison-card {
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    align-self: stretch;
  }

  .comparison-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .comparison-title {
    font-weight: 600;
    font-size: 16px;
    color: var(--pe-title);
  }

  .comparison-sub {
    font-weight: 400;
    font-size: 13px;
    color: var(--pe-desc);
  }

  .variant-selectors {
    display: flex;
    gap: 16px;
    align-items: center;
    align-self: stretch;
  }

  .variant-container {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .variant-label {
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--pe-desc);
  }

  .variant-dropdown {
    height: 36px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--pe-border);
    padding: 10px 14px;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
    transition: box-shadow 120ms ease;
  }

  .variant-dropdown:hover,
  .variant-dropdown:focus-within {
    box-shadow: inset 0 0 0 1px var(--gx-org-primary-500);
  }

  .variant-dropdown select {
    font-weight: 400;
    font-size: 13px;
    color: var(--pe-title);
    min-width: 0;
  }

  .variant-dropdown svg {
    display: block;
    color: var(--pe-desc);
    flex-shrink: 0;
  }

  .vs-badge-wrap {
    width: 32px;
    display: flex;
    padding: 20px 0;
    flex-shrink: 0;
  }

  .vs-badge {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--pe-field-bg);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 700;
    font-size: 11px;
    color: var(--pe-desc);
    flex-shrink: 0;
  }

  .comparison-empty {
    border-radius: 12px;
    background: var(--gx-an-field-bg);
    outline: 1px dashed var(--pe-border);
    outline-offset: -1px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 60px 0;
    justify-content: center;
    align-items: center;
    align-self: stretch;
  }

  .ab-results {
    display: flex;
    gap: 16px;
    align-self: stretch;
    flex-wrap: wrap;
  }

  .ab-panel {
    flex: 1 1 320px;
    border-radius: 12px;
    background: var(--pe-field-bg);
    box-shadow: inset 0 0 0 1px var(--pe-row-border);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    min-width: 0;
  }

  .ab-panel-head {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .ab-tag {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: var(--gx-card);
    font-size: 11px;
    color: var(--gx-org-primary-500);
  }

  .ab-panel-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--pe-title);
    flex-grow: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ab-metrics {
    display: flex;
    gap: 8px;
  }

  .ab-metric {
    flex: 1 1 0;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--pe-row-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    min-width: 0;
  }

  .ab-metric-label {
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--pe-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ab-metric-value {
    font-weight: 700;
    font-size: 15px;
    color: var(--pe-title);
  }

  .ab-verdict {
    display: flex;
    justify-content: center;
    align-self: stretch;
  }

  .ab-verdict-pill {
    border-radius: 8px;
    background: var(--pe-field-bg);
    box-shadow: inset 0 0 0 1px var(--pe-border);
    padding: 8px 16px;
    font-weight: 600;
    font-size: 13px;
    color: var(--pe-desc);
    text-align: center;
  }

  .ab-verdict-pill--a,
  .ab-verdict-pill--b {
    background: var(--gx-org-brand-alt-tint);
    box-shadow: inset 0 0 0 1px var(--gx-mcp-edge-ok);
    color: var(--gx-org-brand-alt);
  }

  /* ---------------- narrow viewports ----------------
     The design is drawn at 1440px; below the table's natural width the card
     scrolls sideways rather than crushing its columns. */
  @media (max-width: 1100px) {
    .pe-container {
      padding: 20px;
    }

    .table-scroll {
      overflow-x: auto;
    }

    .table-scroll .thead-row,
    .table-scroll .data-row {
      min-width: 860px;
    }

    /* Below the design width the four tabs no longer share the row evenly;
       they keep their natural width and the strip scrolls instead. */
    .segmented-tabs {
      overflow-x: auto;
      scrollbar-width: none;
    }

    .segmented-tabs::-webkit-scrollbar {
      display: none;
    }

    .seg-tab {
      flex: 0 0 auto;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      height: auto;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .header-text {
      align-items: flex-start;
      text-align: left;
    }

    .refresh-btn {
      align-self: flex-start;
    }

    .tabs-container {
      height: auto;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .right-actions {
      justify-content: space-between;
    }

    .variant-selectors {
      flex-direction: column;
      align-items: stretch;
    }

    .vs-badge-wrap {
      align-self: center;
      padding: 0;
    }

    .table-footer,
    .table-filter {
      flex-direction: column;
      align-items: stretch;
    }

    .pagination {
      justify-content: space-between;
    }
  }
</style>
