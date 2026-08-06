<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import PageHeader from "../components/PageHeader.svelte";
  import AdminPanelCard from "../components/AdminPanelCard.svelte";
  import AdminTableCard from "../components/AdminTableCard.svelte";
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

  // State
  let metrics = $state<PromptMetric[]>([]);
  let roles = $state<Role[]>([]);
  let prompts = $state<RolePrompt[]>([]);
  let departments = $state<Department[]>([]);
  let loading = $state(true);
  let filterRoleId = $state("");
  let filterPromptId = $state("");

  // A/B test state (UI-only since backend not ready)
  let abVariantA = $state("");
  let abVariantB = $state("");

  // Pagination state for department adoption
  let adoptionPageSize = $state(10);
  let adoptionCurrentPage = $state(0);

  // Derived
  let roleMap = $derived(
    roles.reduce(
      (m, r) => {
        m[r.id] = r.name;
        return m;
      },
      {} as Record<string, string>,
    ),
  );

  let filteredMetrics = $derived.by(() => {
    let result = metrics;
    if (filterRoleId) {
      result = result.filter((m) => m.role_id === filterRoleId);
    }
    if (filterPromptId) {
      result = result.filter((m) => m.prompt_id === filterPromptId);
    }
    return result;
  });

  // Summary stats
  let totalUsage = $derived(filteredMetrics.reduce((sum, m) => sum + m.usage_count, 0));
  let totalFeedback = $derived(filteredMetrics.reduce((sum, m) => sum + m.feedback_count, 0));
  let avgRating = $derived(
    filteredMetrics.length > 0
      ? filteredMetrics.reduce((sum, m) => sum + m.average_rating, 0) / filteredMetrics.length
      : 0,
  );
  let thumbsUp = $derived(
    filteredMetrics.reduce((sum, m) => sum + Math.round(m.feedback_count * m.average_rating), 0),
  );
  let thumbsDown = $derived(totalFeedback - thumbsUp);

  // Ranked lists
  let mostEffective = $derived(
    [...filteredMetrics].sort((a, b) => b.average_rating - a.average_rating).slice(0, 5),
  );
  let leastEffective = $derived(
    [...filteredMetrics]
      .filter((m) => m.feedback_count > 0)
      .sort((a, b) => a.average_rating - b.average_rating)
      .slice(0, 5),
  );

  // Department adoption: group prompts by role, map role -> departments with user_count
  let departmentAdoption = $derived.by(() => {
    const roleIds = new Set(filteredMetrics.map((m) => m.role_id));
    return departments
      .map((dept) => {
        const deptPrompts = filteredMetrics.filter((m) => roleIds.has(m.role_id));
        const totalDeptUsage = deptPrompts.reduce((s, m) => s + m.usage_count, 0);
        return {
          name: dept.name,
          memberCount: dept.member_count,
          promptsUsed: deptPrompts.length,
          totalUsage: totalDeptUsage,
          adoptionRate:
            dept.member_count > 0
              ? Math.min(100, Math.round((totalDeptUsage / dept.member_count) * 100))
              : 0,
        };
      })
      .sort((a, b) => b.adoptionRate - a.adoptionRate);
  });

  // Pagination derived values
  let adoptionTotalPages = $derived(
    Math.ceil(departmentAdoption.length / adoptionPageSize)
  );
  
  let paginatedDepartmentAdoption = $derived(() => {
    const startIndex = adoptionCurrentPage * adoptionPageSize;
    const endIndex = startIndex + adoptionPageSize;
    return departmentAdoption.slice(startIndex, endIndex);
  });

  // Reset pagination when page size changes or filters change
  $effect(() => {
    const _pageSize = adoptionPageSize;
    adoptionCurrentPage = 0;
  });

  $effect(() => {
    const _filterRoleId = filterRoleId;
    const _filterPromptId = filterPromptId;
    adoptionCurrentPage = 0;
  });

  function handleAdoptionPageChange(page: number) {
    adoptionCurrentPage = page;
  }

  // A/B comparison (UI-only)
  let variantAMetric = $derived(metrics.find((m) => m.prompt_id === abVariantA));
  let variantBMetric = $derived(metrics.find((m) => m.prompt_id === abVariantB));

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

  function ratingColor(rating: number): string {
    if (rating >= 0.7) return "var(--brand-green)";
    if (rating >= 0.4) return "var(--brand-amber, #f59e0b)";
    return "var(--brand-red)";
  }

  type TabId = "overview" | "rankings" | "adoption" | "compare";
  let activeTab = $state<TabId>("overview");

  function ratingPercent(rating: number): string {
    return (rating * 100).toFixed(1) + "%";
  }
</script>

<div class="pe-container">
  <!-- Header -->
  <div class="pe-header">
    <h1 class="pe-title">{$_("admin.promptEffectiveness.title")}</h1>
    <p class="pe-subtitle">{$_("admin.promptEffectiveness.subtitle")}</p>
  </div>

  <!-- Filter bar -->
  <div class="filter-bar">
    <div class="filter-bar-left">
      <select class="filter-select compact" bind:value={filterRoleId} aria-label={$_("admin.promptEffectiveness.filterByRole")}>
        <option value="">{$_("admin.promptEffectiveness.allRoles")}</option>
        {#each roles as role}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
      <select class="filter-select compact" bind:value={filterPromptId} aria-label={$_("admin.promptEffectiveness.filterByPrompt")}>
        <option value="">{$_("admin.promptEffectiveness.allPrompts")}</option>
        {#each prompts as prompt}
          <option value={prompt.id}>{prompt.name}</option>
        {/each}
      </select>
    </div>
    <button class="btn-refresh" onclick={loadData}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      {$_("admin.promptEffectiveness.refresh")}
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
    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon usage">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-value">{formatNumber(totalUsage)}</span>
          <span class="kpi-label">{$_("admin.promptEffectiveness.totalUsage")}</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon feedback">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-value">{formatNumber(totalFeedback)}</span>
          <span class="kpi-label">{$_("admin.promptEffectiveness.totalFeedback")}</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon positive">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-value positive-text">{formatNumber(thumbsUp)}</span>
          <span class="kpi-label">{$_("admin.promptEffectiveness.thumbsUp")}</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon negative">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-value negative-text">{formatNumber(thumbsDown)}</span>
          <span class="kpi-label">{$_("admin.promptEffectiveness.thumbsDown")}</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon rating">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="kpi-body">
          <span class="kpi-value" style="color: {ratingColor(avgRating)}">{ratingPercent(avgRating)}</span>
          <span class="kpi-label">{$_("admin.promptEffectiveness.avgRating")}</span>
        </div>
      </div>
    </div>

    <!-- Tab navigation -->
    <div class="tab-bar" role="tablist">
      <button class="tab" class:active={activeTab === "overview"} role="tab" aria-selected={activeTab === "overview"} onclick={() => activeTab = "overview"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        {$_("admin.promptEffectiveness.usagePerPrompt")}
      </button>
      <button class="tab" class:active={activeTab === "rankings"} role="tab" aria-selected={activeTab === "rankings"} onclick={() => activeTab = "rankings"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        {$_("admin.promptEffectiveness.mostEffective")}
      </button>
      <button class="tab" class:active={activeTab === "adoption"} role="tab" aria-selected={activeTab === "adoption"} onclick={() => activeTab = "adoption"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        {$_("admin.promptEffectiveness.departmentAdoption")}
      </button>
      <button class="tab" class:active={activeTab === "compare"} role="tab" aria-selected={activeTab === "compare"} onclick={() => activeTab = "compare"}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        {$_("admin.promptEffectiveness.abTest.title")}
      </button>
    </div>

    <!-- Tab panels -->
    <div class="tab-panel">

      {#if activeTab === "overview"}
        <!-- Usage per Prompt table -->
        <AdminTableCard minWidth="700px">
          <table>
            <thead>
              <tr>
                <th>{$_("admin.promptEffectiveness.columns.name")}</th>
                <th>{$_("admin.promptEffectiveness.columns.role")}</th>
                <th>{$_("admin.promptEffectiveness.columns.usage")}</th>
                <th>{$_("admin.promptEffectiveness.columns.feedback")}</th>
                <th>{$_("admin.promptEffectiveness.columns.thumbsUp")}</th>
                <th>{$_("admin.promptEffectiveness.columns.thumbsDown")}</th>
                <th>{$_("admin.promptEffectiveness.columns.rating")}</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredMetrics as m (m.prompt_id)}
                {@const up = Math.round(m.feedback_count * m.average_rating)}
                {@const down = m.feedback_count - up}
                <tr>
                  <td><span class="prompt-name">{m.name}</span></td>
                  <td><span class="role-badge">{roleMap[m.role_id] || $_("admin.promptEffectiveness.unknownRole")}</span></td>
                  <td>{formatNumber(m.usage_count)}</td>
                  <td>{formatNumber(m.feedback_count)}</td>
                  <td><span class="positive-text">{formatNumber(up)}</span></td>
                  <td><span class="negative-text">{formatNumber(down)}</span></td>
                  <td>
                    <div class="rating-bar-cell">
                      <div class="rating-bar"><div class="rating-fill" style="width: {m.average_rating * 100}%; background: {ratingColor(m.average_rating)}"></div></div>
                      <span class="rating-text" style="color: {ratingColor(m.average_rating)}">{ratingPercent(m.average_rating)}</span>
                    </div>
                  </td>
                </tr>
              {/each}
              {#if filteredMetrics.length === 0}
                <tr><td colspan="7" class="empty-row">{$_("admin.promptEffectiveness.noData")}</td></tr>
              {/if}
            </tbody>
          </table>
        </AdminTableCard>

      {:else if activeTab === "rankings"}
        <div class="rankings-grid">
          <!-- Most Effective -->
          <AdminPanelCard>
            <h3 class="panel-heading green">{$_("admin.promptEffectiveness.mostEffective")}</h3>
            <div class="ranking-list">
              {#each mostEffective as prompt, i (prompt.prompt_id)}
                <div class="ranking-item">
                  <span class="rank rank-top">{i + 1}</span>
                  <div class="ranking-info">
                    <span class="prompt-name">{prompt.name}</span>
                    <span class="prompt-role">{roleMap[prompt.role_id] || $_("admin.promptEffectiveness.unknownRole")}</span>
                  </div>
                  <div class="ranking-meta">
                    <div class="mini-bar"><div class="mini-fill" style="width:{prompt.average_rating * 100}%; background:{ratingColor(prompt.average_rating)}"></div></div>
                    <span class="rating-text" style="color:{ratingColor(prompt.average_rating)}">{ratingPercent(prompt.average_rating)}</span>
                  </div>
                </div>
              {/each}
              {#if mostEffective.length === 0}
                <p class="empty-text">{$_("admin.promptEffectiveness.noData")}</p>
              {/if}
            </div>
          </AdminPanelCard>

          <!-- Least Effective -->
          <AdminPanelCard>
            <h3 class="panel-heading red">{$_("admin.promptEffectiveness.leastEffective")}</h3>
            <div class="ranking-list">
              {#each leastEffective as prompt, i (prompt.prompt_id)}
                <div class="ranking-item">
                  <span class="rank rank-bottom">{i + 1}</span>
                  <div class="ranking-info">
                    <span class="prompt-name">{prompt.name}</span>
                    <span class="prompt-role">{roleMap[prompt.role_id] || $_("admin.promptEffectiveness.unknownRole")}</span>
                  </div>
                  <div class="ranking-meta">
                    <div class="mini-bar"><div class="mini-fill" style="width:{prompt.average_rating * 100}%; background:{ratingColor(prompt.average_rating)}"></div></div>
                    <span class="rating-text" style="color:{ratingColor(prompt.average_rating)}">{ratingPercent(prompt.average_rating)}</span>
                  </div>
                </div>
              {/each}
              {#if leastEffective.length === 0}
                <p class="empty-text">{$_("admin.promptEffectiveness.noData")}</p>
              {/if}
            </div>
          </AdminPanelCard>
        </div>

      {:else if activeTab === "adoption"}
        {#if departmentAdoption.length > 0}
          <AdminTableCard minWidth="600px">
            <table>
              <thead>
                <tr>
                  <th>{$_("admin.promptEffectiveness.columns.department")}</th>
                  <th>{$_("admin.promptEffectiveness.columns.members")}</th>
                  <th>{$_("admin.promptEffectiveness.columns.promptsUsed")}</th>
                  <th>{$_("admin.promptEffectiveness.columns.totalUsage")}</th>
                  <th>{$_("admin.promptEffectiveness.columns.adoptionRate")}</th>
                </tr>
              </thead>
              <tbody>
                {#each paginatedDepartmentAdoption() as dept}
                  <tr>
                    <td><span class="dept-name">{dept.name}</span></td>
                    <td>{dept.memberCount}</td>
                    <td>{dept.promptsUsed}</td>
                    <td>{formatNumber(dept.totalUsage)}</td>
                    <td>
                      <div class="adoption-cell">
                        <div class="adoption-bar"><div class="adoption-fill" style="width: {dept.adoptionRate}%"></div></div>
                        <span class="adoption-text">{dept.adoptionRate}%</span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </AdminTableCard>

          <!-- Pagination -->
          {#if adoptionTotalPages > 1}
            <nav class="pagination" aria-label={$_('admin.common.pagination')}>
              <button
                class="btn"
                onclick={() => handleAdoptionPageChange(adoptionCurrentPage - 1)}
                disabled={adoptionCurrentPage === 0}
                aria-label={$_('admin.common.previousPage')}
              >
                {$_('admin.common.previous')}
              </button>
              <span class="pagination-info" role="status" aria-live="polite">
                Page {formatNumber(adoptionCurrentPage + 1)} of {formatNumber(adoptionTotalPages)} ({departmentAdoption.length} departments)
              </span>
              <button
                class="btn"
                onclick={() => handleAdoptionPageChange(adoptionCurrentPage + 1)}
                disabled={adoptionCurrentPage >= adoptionTotalPages - 1}
                aria-label={$_('admin.common.nextPage')}
              >
                {$_('admin.common.next')}
              </button>
            </nav>
          {/if}
        {:else}
          <AdminPanelCard>
            <p class="empty-text">{$_("admin.promptEffectiveness.noDepartments")}</p>
          </AdminPanelCard>
        {/if}

      {:else if activeTab === "compare"}
        <AdminPanelCard>
          <p class="ab-description">{$_("admin.promptEffectiveness.abTest.description")}</p>
          <div class="ab-selectors">
            <div class="ab-selector">
              <label for="ab-variant-a" class="ab-label">{$_("admin.promptEffectiveness.abTest.variantA")}</label>
              <select id="ab-variant-a" class="filter-select" bind:value={abVariantA}>
                <option value="">{$_("admin.promptEffectiveness.abTest.selectPrompt")}</option>
                {#each metrics as m}
                  <option value={m.prompt_id}>{m.name}</option>
                {/each}
              </select>
            </div>
            <div class="ab-vs">vs</div>
            <div class="ab-selector">
              <label for="ab-variant-b" class="ab-label">{$_("admin.promptEffectiveness.abTest.variantB")}</label>
              <select id="ab-variant-b" class="filter-select" bind:value={abVariantB}>
                <option value="">{$_("admin.promptEffectiveness.abTest.selectPrompt")}</option>
                {#each metrics as m}
                  <option value={m.prompt_id}>{m.name}</option>
                {/each}
              </select>
            </div>
          </div>

          {#if variantAMetric && variantBMetric}
            {@const diff = variantAMetric.average_rating - variantBMetric.average_rating}
            {@const diffPercent = (diff * 100).toFixed(1)}
            <div class="ab-results">
              <div class="ab-card">
                <div class="ab-card-header">
                  <span class="ab-badge">A</span>
                  <h4 class="ab-card-title">{variantAMetric.name}</h4>
                </div>
                <div class="ab-stats">
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.usage")}</span><span class="ab-stat-value">{formatNumber(variantAMetric.usage_count)}</span></div>
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.feedback")}</span><span class="ab-stat-value">{formatNumber(variantAMetric.feedback_count)}</span></div>
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.rating")}</span><span class="ab-stat-value" style="color: {ratingColor(variantAMetric.average_rating)}">{ratingPercent(variantAMetric.average_rating)}</span></div>
                </div>
              </div>

              <div class="ab-comparison">
                <div class="ab-diff" class:positive={diff > 0} class:negative={diff < 0}>
                  {#if diff > 0}
                    A +{diffPercent}%
                  {:else if diff < 0}
                    B +{Math.abs(Number(diffPercent))}%
                  {:else}
                    {$_("admin.promptEffectiveness.abTest.tied")}
                  {/if}
                </div>
              </div>

              <div class="ab-card">
                <div class="ab-card-header">
                  <span class="ab-badge b">B</span>
                  <h4 class="ab-card-title">{variantBMetric.name}</h4>
                </div>
                <div class="ab-stats">
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.usage")}</span><span class="ab-stat-value">{formatNumber(variantBMetric.usage_count)}</span></div>
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.feedback")}</span><span class="ab-stat-value">{formatNumber(variantBMetric.feedback_count)}</span></div>
                  <div class="ab-stat"><span class="ab-stat-label">{$_("admin.promptEffectiveness.columns.rating")}</span><span class="ab-stat-value" style="color: {ratingColor(variantBMetric.average_rating)}">{ratingPercent(variantBMetric.average_rating)}</span></div>
                </div>
              </div>
            </div>
          {:else if abVariantA || abVariantB}
            <p class="ab-hint">{$_("admin.promptEffectiveness.abTest.selectBoth")}</p>
          {/if}
        </AdminPanelCard>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Layout */
  .pe-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-2xl) var(--space-3xl);
    overflow-y: auto;
    gap: var(--space-lg);
  }

  /* Header */
  .pe-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pe-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .pe-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  /* Filter Bar */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
  }

  .filter-bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Filters */
  .filter-select {
    padding: 8px 12px;
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .filter-select.compact {
    min-width: 160px;
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--brand);
  }

  .btn-refresh {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .btn-refresh:hover {
    color: var(--brand);
    border-color: var(--brand);
  }

  .btn-refresh svg {
    flex-shrink: 0;
  }

  /* KPI Cards */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-md);
  }

  .kpi-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .kpi-card:hover {
    box-shadow: var(--glass-shadow-emphasis);
    transform: translateY(-1px);
  }

  .kpi-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .kpi-icon.usage {
    background: color-mix(in oklab, var(--brand) 15%, var(--button-bg));
    color: var(--brand);
  }

  .kpi-icon.feedback {
    background: color-mix(in oklab, #8b5cf6 15%, var(--button-bg));
    color: #8b5cf6;
  }

  .kpi-icon.positive {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
  }

  .kpi-icon.negative {
    background: color-mix(in oklab, var(--brand-red) 15%, var(--button-bg));
    color: var(--brand-red);
  }

  .kpi-icon.rating {
    background: color-mix(in oklab, #f59e0b 15%, var(--button-bg));
    color: #f59e0b;
  }

  .kpi-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .kpi-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .kpi-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .positive-text { color: var(--brand-green); }
  .negative-text { color: var(--brand-red); }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    gap: 2px;
    background: var(--button-bg);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md);
    padding: 4px;
    overflow-x: auto;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .tab:hover {
    color: var(--text-primary);
    background: rgba(var(--glass-tint), 0.05);
  }

  .tab.active {
    background: rgba(var(--glass-tint), 0.1);
    color: var(--brand);
    font-weight: 600;
  }

  .tab svg { flex-shrink: 0; }

  /* Tab Panel */
  .tab-panel {
    flex: 1;
    min-height: 0;
  }

  /* Rankings */
  .rankings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
  }

  .panel-heading {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--space-md) 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-heading.green::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand-green);
  }

  .panel-heading.red::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand-red);
  }

  .ranking-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ranking-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    transition: background 0.15s;
  }

  .ranking-item:hover {
    background: rgba(var(--glass-tint), 0.04);
  }

  .rank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .rank-top {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
  }

  .rank-bottom {
    background: color-mix(in oklab, var(--brand-red) 15%, var(--button-bg));
    color: var(--brand-red);
  }

  .ranking-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .ranking-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    width: 130px;
  }

  .mini-bar {
    flex: 1;
    height: 6px;
    background: rgba(var(--glass-tint), 0.08);
    border-radius: 3px;
    overflow: hidden;
  }

  .mini-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  .prompt-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prompt-role {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .empty-text {
    color: var(--text-secondary);
    font-size: 13px;
    text-align: center;
    margin: var(--space-lg) 0;
    font-style: italic;
  }

  /* Table styles */
  .role-badge {
    display: inline-flex;
    padding: 2px 8px;
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .rating-bar-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rating-bar {
    flex: 1;
    height: 6px;
    background: rgba(var(--glass-tint), 0.08);
    border-radius: 3px;
    overflow: hidden;
    min-width: 50px;
    max-width: 80px;
  }

  .rating-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  .rating-text {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .empty-row {
    text-align: center;
    color: var(--text-secondary);
    font-style: italic;
    padding: var(--space-xl) !important;
  }

  /* Department adoption */
  .dept-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-primary);
  }

  .adoption-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .adoption-bar {
    flex: 1;
    height: 6px;
    background: rgba(var(--glass-tint), 0.08);
    border-radius: 3px;
    overflow: hidden;
    min-width: 50px;
    max-width: 100px;
  }

  .adoption-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--brand);
    transition: width 0.4s ease;
  }

  .adoption-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--brand);
    white-space: nowrap;
  }

  /* Pagination Styles */
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

  .pagination .btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--button-bg);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pagination .btn:hover:not(:disabled) {
    background: var(--btn-secondary);
    border-color: var(--glass-stroke-light);
  }

  .pagination .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination .btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* A/B Test */
  .ab-description {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0 0 var(--space-lg) 0;
  }

  .ab-selectors {
    display: flex;
    align-items: flex-end;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .ab-selector {
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
    min-width: 180px;
  }

  .ab-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ab-vs {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-secondary);
    padding-bottom: 8px;
  }

  .ab-results {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--space-md);
    margin-top: var(--space-xl);
    align-items: stretch;
  }

  .ab-card {
    padding: var(--space-lg);
    background: rgba(var(--glass-tint), 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-md);
  }

  .ab-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: var(--space-md);
  }

  .ab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in oklab, var(--brand) 20%, var(--button-bg));
    color: var(--brand);
  }

  .ab-badge.b {
    background: color-mix(in oklab, #8b5cf6 20%, var(--button-bg));
    color: #8b5cf6;
  }

  .ab-card-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .ab-stats {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ab-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ab-stat-label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .ab-stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .ab-comparison {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ab-diff {
    padding: 6px 14px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .ab-diff.positive {
    background: color-mix(in oklab, var(--brand-green) 15%, var(--button-bg));
    color: var(--brand-green);
  }

  .ab-diff.negative {
    background: color-mix(in oklab, var(--brand-red) 15%, var(--button-bg));
    color: var(--brand-red);
  }

  .ab-hint {
    font-size: 13px;
    color: var(--text-secondary);
    font-style: italic;
    margin: var(--space-lg) 0 0 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .pe-container {
      padding: var(--space-lg);
    }

    .filter-bar {
      flex-wrap: wrap;
    }

    .filter-bar-left {
      width: 100%;
    }

    .filter-select.compact {
      flex: 1;
      min-width: 0;
    }

    .rankings-grid {
      grid-template-columns: 1fr;
    }

    .kpi-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .kpi-value {
      font-size: 1.1rem;
    }

    .kpi-icon {
      width: 34px;
      height: 34px;
    }

    .ab-results {
      grid-template-columns: 1fr;
    }

    .ab-selectors {
      flex-direction: column;
    }

    .ab-vs {
      text-align: center;
      padding: 0;
    }
  }

  @media (max-width: 480px) {
    .pe-container {
      padding: var(--space-md);
    }

    .pe-title {
      font-size: 1.3rem;
    }

    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .tab {
      padding: 6px 10px;
      font-size: 12px;
    }
  }
</style>
