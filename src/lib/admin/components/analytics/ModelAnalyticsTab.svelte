<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import type { AnalyticsOverview } from "../../types.js";
  import { _ } from "svelte-i18n";

  interface Props {
    /** Model rows come from /admin/analytics/overview's top_models. */
    overviewData: AnalyticsOverview | null;
    isLoading: boolean;
    /** Selected range, e.g. "Last 30 days" — the section caption in the design. */
    rangeLabel: string;
    error: string | null;
    onRetry: () => void;
  }

  let { overviewData, isLoading, rangeLabel, error, onRetry }: Props = $props();

  const models = $derived(overviewData?.top_models ?? []);

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      const val = num / 1000000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "M";
    } else if (num >= 1000) {
      const val = num / 1000;
      return (val % 1 === 0 ? val.toString() : val.toFixed(1)) + "K";
    }
    return Math.round(num).toString();
  }

  function formatCurrency(num: number): string {
    return "$" + (num ?? 0).toFixed(2);
  }

  /** The design writes latency in seconds ("1.2s"); sub-second stays in ms. */
  function formatLatency(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || Number.isNaN(ms) || ms <= 0)
      return "—";
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  }
</script>

{#if isLoading}
  <div
    class="loading-container"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <LoadingSpinner />
  </div>
{:else if error}
  <div class="error-state" role="alert">
    <p class="error-message">{error}</p>
    <button type="button" class="retry-btn" onclick={onRetry}>
      {$_("analytics.retry")}
    </button>
  </div>
{:else}
  <div class="analytics-content">
    <section class="section" aria-label={$_("analytics.byModel.title")}>
      <div class="section-head">
        <h2 class="section-title">{$_("analytics.byModel.title")}</h2>
        <span class="section-sub">{rangeLabel}</span>
      </div>

      <div
        class="table-container"
        role="table"
        aria-label={$_("analytics.aria.modelTableCaption")}
      >
        <div class="table-header" role="row">
          <span role="columnheader">{$_("analytics.byModel.model")}</span>
          <span role="columnheader"
            >{$_("analytics.byModel.totalRequests")}</span
          >
          <span role="columnheader">{$_("analytics.byModel.avgLatency")}</span>
          <span role="columnheader">{$_("analytics.byModel.cost")}</span>
        </div>

        {#if models.length === 0}
          <div class="empty-row" role="row">
            <span role="cell">{$_("analytics.byModel.noData")}</span>
          </div>
        {:else}
          {#each models as model (model.model_name + model.model_provider)}
            <div class="model-row" role="row">
              <div role="cell">
                <span class="model-name">{model.model_name}</span>
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatNumber(model.total_requests)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value"
                  >{formatLatency(model.average_latency)}</span
                >
              </div>
              <div role="cell">
                <span class="table-value--cost"
                  >{formatCurrency(model.total_cost)}</span
                >
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  /* app.css's global button rule blurs what sits behind it, which erases the
     hairlines this design draws under its buttons. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .analytics-content {
    display: flex;
    flex-direction: column;
    gap: 28px;
    font-family: var(--gx-font);
  }

  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 64px 20px;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    padding: 48px 24px;
    border-radius: 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-an-ring);
  }

  .error-message {
    margin: 0;
    font-size: 13px;
    color: var(--gx-an-sub);
  }

  .retry-btn {
    height: 33px;
    border: 0;
    border-radius: 8px;
    background: var(--gx-org-brand);
    box-shadow: none;
    padding: 0 14px;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: #fff;
    cursor: pointer;
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--gx-an-blue);
    outline-offset: 2px;
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
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--gx-an-table-ring);
  }

  .table-header {
    min-height: 41px;
    background: var(--gx-an-thead-bg);
    border: 1px solid var(--gx-an-ring);
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .table-header > span {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }

  .model-row {
    min-height: 41px;
    background: var(--gx-card);
    border: 1px solid var(--gx-an-ring);
    border-top: none;
    display: flex;
    padding: 12px 16px;
    align-items: center;
    gap: 12px;
  }

  .model-row > div {
    flex: 1;
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

  .table-value--cost {
    font-weight: 700;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-ink);
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

  @media (max-width: 768px) {
    .table-header,
    .model-row {
      font-size: 12px;
    }
  }
</style>
