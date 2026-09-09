<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  usage-analytics-overview.html ".vdt", transcribed: the data table behind every
  chart's "View Data Table" button. A summary strip, one row per data point with
  a bar under each number, the period's peak row tinted, and a footer that
  splits the covered range from the Export / Close actions. Every chart on the
  page renders through this one component, so they all read the same.
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import Modal from "../Modal.svelte";
  import type { TimeseriesDataPoint } from "../../types.js";

  interface TableColumn {
    id: string;
    label: string;
    value: (row: TimeseriesDataPoint) => string | number;
    /**
     * The magnitude behind the cell. Columns that have one are right-aligned,
     * carry a bar scaled against the column's own maximum, and can mark the
     * peak row; the label column (Date) leaves it out.
     */
    numeric?: (row: TimeseriesDataPoint) => number;
    /** Bar colour — the series colour the chart draws that metric in. */
    color?: string;
  }

  interface SummaryStat {
    label: string;
    value: string;
  }

  interface Props {
    title: string;
    /** Second header line, e.g. "Data table view · 30 days shown". */
    subtitle: string;
    /** Screen-reader caption for the table. */
    caption: string;
    rows: TimeseriesDataPoint[];
    columns: TableColumn[];
    /** The summary strip above the table. */
    stats?: SummaryStat[];
    /** Column whose maximum marks the "Peak" row; defaults to the first numeric one. */
    peakColumnId?: string;
    /** Footer caption — the period the rows cover. */
    rangeCaption?: string;
    onClose: () => void;
  }

  let {
    title,
    subtitle,
    caption,
    rows,
    columns,
    stats = [],
    peakColumnId,
    rangeCaption = "",
    onClose,
  }: Props = $props();

  const peakColumn = $derived(
    columns.find((column) => column.id === peakColumnId && column.numeric) ??
      columns.find((column) => column.numeric),
  );

  /** Bars are scaled per column, so a small metric still reads across the rows. */
  const maxima = $derived(
    new Map(
      columns
        .filter((column) => column.numeric)
        .map((column) => [
          column.id,
          Math.max(0, ...rows.map((row) => column.numeric?.(row) ?? 0)),
        ]),
    ),
  );

  const peakIndex = $derived.by(() => {
    const column = peakColumn;
    if (!column?.numeric || rows.length < 2) return -1;
    const max = maxima.get(column.id) ?? 0;
    if (max <= 0) return -1;
    const index = rows.findIndex((row) => column.numeric?.(row) === max);
    // A flat series has no peak worth calling out.
    return rows.every((row) => column.numeric?.(row) === max) ? -1 : index;
  });

  function barWidth(column: TableColumn, row: TimeseriesDataPoint): number {
    const max = maxima.get(column.id) ?? 0;
    if (max <= 0) return 0;
    const value = column.numeric?.(row) ?? 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  }

  function csvCell(value: string | number): string {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const lines = [
      columns.map((column) => csvCell(column.label)).join(","),
      ...rows.map((row) =>
        columns.map((column) => csvCell(column.value(row))).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
</script>

<Modal
  isOpen={true}
  variant="chart-data"
  {title}
  {subtitle}
  onclose={onClose}
  restoreFocusOnClose={false}
>
  {#snippet headerIcon()}
    <span class="vdt-icon-badge" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 16.5h14"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
        <rect x="4.4" y="9" width="3" height="5.5" rx="1" fill="currentColor" />
        <rect
          x="8.9"
          y="5.5"
          width="3"
          height="9"
          rx="1"
          fill="currentColor"
          opacity="0.75"
        />
        <rect
          x="13.4"
          y="7.5"
          width="3"
          height="7"
          rx="1"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </span>
  {/snippet}

  {#snippet children()}
    <div
      class="vdt-content"
      role="region"
      aria-label={$_("analytics.charts.accessibility.dataTableRegion", {
        values: { chartName: title },
      })}
    >
      {#if stats.length > 0}
        <div class="vdt-stats">
          {#each stats as stat (stat.label)}
            <div class="vdt-stat">
              <span class="vdt-stat-label">{stat.label}</span>
              <span class="vdt-stat-value">{stat.value}</span>
            </div>
          {/each}
        </div>
      {/if}

      <table class="vdt-table">
        <caption class="sr-only">{caption}</caption>
        <thead>
          <tr>
            {#each columns as column (column.id)}
              <th scope="col" class:vdt-th--num={!!column.numeric}>
                {column.label}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, rowIndex (rowIndex)}
            <tr class:vdt-row--peak={rowIndex === peakIndex}>
              {#each columns as column, columnIndex (column.id)}
                {#if column.numeric}
                  <td class="vdt-td--num">
                    <span class="vdt-num-value">{column.value(row)}</span>
                    <span class="vdt-progress-track" aria-hidden="true">
                      <span
                        class="vdt-progress-fill"
                        style="width: {barWidth(column, row)}%; background: {column.color ??
                          'var(--gx-an-bar-blue)'}"
                      ></span>
                    </span>
                  </td>
                {:else}
                  <td>
                    <div class="vdt-label-cell">
                      <span class="vdt-label-text">{column.value(row)}</span>
                      {#if columnIndex === 0 && rowIndex === peakIndex}
                        <span class="vdt-peak-badge">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M5 .8l1.3 2.7 2.9.4-2.1 2.1.5 2.9L5 7.5 2.4 8.9l.5-2.9L.8 3.9l2.9-.4L5 .8z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>{$_("analytics.charts.dataTable.peak")}</span>
                        </span>
                      {/if}
                    </div>
                  </td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/snippet}

  {#snippet footer()}
    <span class="vdt-footer-range">{rangeCaption}</span>
    <div class="vdt-footer-actions">
      <button class="vdt-export-btn" type="button" onclick={exportCsv}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 1.8v7.4M4.2 6.6L7 9.4l2.8-2.8M2.2 11.4h9.6"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{$_("analytics.charts.dataTable.exportCsv")}</span>
      </button>
      <button class="vdt-close-btn" type="button" onclick={onClose}>
        {$_("analytics.charts.dataTable.close")}
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* app.css paints every bare <button> as a glass pill; the two footer actions
     below are flat, so strip that once here. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .vdt-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: var(--gx-font);
  }

  .vdt-icon-badge {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: var(--gx-vdt-icon-bg);
    color: var(--gx-org-kpi-icon-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ---- summary strip ---- */
  .vdt-stats {
    overflow: hidden;
    border-radius: 12px;
    background: var(--gx-org-track);
    box-shadow: inset 0 0 0 1px var(--gx-an-chip-ring);
    display: flex;
    gap: 1px;
    flex-shrink: 0;
  }

  .vdt-stat {
    flex: 1 1 0;
    min-width: 0;
    background: var(--gx-vdt-surface);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
  }

  .vdt-stat-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--gx-mcp-dim);
    text-transform: uppercase;
  }

  .vdt-stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  /* ---- table ---- */
  .vdt-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }

  /* Header and rows each read as one bordered band, so the cells carry the
     horizontal rules and only the outer cells close the sides. */
  .vdt-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--gx-card);
    border-top: 1px solid var(--gx-an-chip-ring);
    border-bottom: 1px solid var(--gx-an-chip-ring);
    padding: 10px 16px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--gx-an-axis);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .vdt-table th:first-child {
    border-left: 1px solid var(--gx-an-chip-ring);
  }

  .vdt-table th:last-child {
    border-right: 1px solid var(--gx-an-chip-ring);
  }

  .vdt-table th.vdt-th--num {
    text-align: right;
    width: 160px;
  }

  .vdt-table td {
    height: 54px;
    background: var(--gx-card);
    border-bottom: 1px solid var(--gx-vdt-row-hair);
    padding: 8px 16px;
    vertical-align: middle;
  }

  .vdt-table td:first-child {
    border-left: 1px solid var(--gx-vdt-row-hair);
  }

  .vdt-table td:last-child {
    border-right: 1px solid var(--gx-vdt-row-hair);
  }

  .vdt-table tbody tr.vdt-row--peak td {
    background: var(--gx-vdt-peak-bg);
    border-color: var(--gx-vdt-peak-ring);
  }

  .vdt-label-cell {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .vdt-label-text {
    font-size: 14px;
    font-weight: 500;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .vdt-peak-badge {
    border-radius: 99px;
    background: var(--gx-vdt-peak-bg);
    box-shadow: inset 0 0 0 1px var(--gx-vdt-peak-badge-ring);
    color: var(--gx-vdt-peak-fg);
    display: inline-flex;
    gap: 4px;
    padding: 2px 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .vdt-peak-badge span {
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .vdt-td--num {
    text-align: right;
  }

  .vdt-td--num .vdt-num-value {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: var(--gx-slate-900);
    white-space: nowrap;
  }

  .vdt-progress-track {
    display: block;
    width: 90px;
    height: 5px;
    margin-top: 4px;
    margin-left: auto;
    overflow: hidden;
    border-radius: 3px;
    background: var(--gx-an-insight-bg);
  }

  .vdt-progress-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
  }

  /* ---- footer ---- */
  .vdt-footer-range {
    font-family: var(--gx-font);
    font-size: 13px;
    font-weight: 500;
    color: var(--gx-org-slate-350);
    white-space: nowrap;
  }

  .vdt-footer-actions {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }

  .vdt-export-btn,
  .vdt-close-btn {
    height: 37px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    font-family: var(--gx-font);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .vdt-export-btn {
    gap: 8px;
    padding: 10px 16px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
    color: var(--gx-slate-900);
  }

  .vdt-export-btn:hover {
    background: var(--gx-vdt-surface);
  }

  .vdt-close-btn {
    padding: 10px 20px;
    background: var(--gx-vdt-cta);
    color: rgb(255, 255, 255);
  }

  .vdt-close-btn:hover {
    background: var(--gx-vdt-cta-hover);
  }

  .vdt-export-btn:focus-visible,
  .vdt-close-btn:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .vdt-export-btn,
    .vdt-close-btn {
      transition: none;
    }
  }
</style>
