<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  /**
   * The plot from usage-analytics-overview.html: a 32px y-axis column, four
   * grid lines, a 208px stretched viewBox with 2.2px lines and 4px dots, and
   * an x-axis row that ends in the axis label. Series carrying a different
   * unit (tokens next to requests) opt into a second, right-hand axis.
   */
  interface Series {
    key: string;
    label: string;
    color: string;
    values: number[];
    axis?: "left" | "right";
    /** Included in the tooltip but not plotted (the design's multi-metric card). */
    tooltipOnly?: boolean;
    /** Tooltip / axis formatter. */
    format?: (value: number) => string;
  }

  interface Props {
    series: Series[];
    /** One label per data point; the axis thins them to `maxTicks`. */
    labels: string[];
    /** Full labels used by the tooltip (defaults to `labels`). */
    tooltipLabels?: string[];
    axisLabel: string;
    height?: number;
    maxTicks?: number;
  }

  let {
    series,
    labels,
    tooltipLabels,
    axisLabel,
    height = 208,
    maxTicks = 6,
  }: Props = $props();

  const VIEW_W = 1000;
  const Y_STEPS = 3;

  let plotEl = $state<HTMLDivElement | null>(null);
  let hoverIndex = $state<number | null>(null);

  const pointCount = $derived(Math.max(...series.map((s) => s.values.length), 0));
  const plotted = $derived(series.filter((s) => !s.tooltipOnly));
  const leftSeries = $derived(plotted.filter((s) => (s.axis ?? "left") === "left"));
  const rightSeries = $derived(plotted.filter((s) => s.axis === "right"));

  /**
   * Axis top that divides into Y_STEPS round ticks, so the column reads
   * 30 / 20 / 10 / 0 like the design rather than 50 / 33 / 17 / 0.
   */
  function niceMax(raw: number): number {
    if (!Number.isFinite(raw) || raw <= 0) return Y_STEPS;
    const rawStep = raw / Y_STEPS;
    const exponent = Math.floor(Math.log10(rawStep));
    const magnitude = Math.pow(10, exponent);
    const candidates = [1, 2, 2.5, 5, 10];
    for (const candidate of candidates) {
      const step = candidate * magnitude;
      if (step * Y_STEPS >= raw) return step * Y_STEPS;
    }
    return 10 * magnitude * Y_STEPS;
  }

  function axisMax(group: Series[]): number {
    const peak = Math.max(0, ...group.flatMap((s) => s.values));
    return niceMax(peak);
  }

  const leftMax = $derived(axisMax(leftSeries));
  const rightMax = $derived(rightSeries.length > 0 ? axisMax(rightSeries) : 0);

  function ticks(max: number, format?: (value: number) => string): string[] {
    const fmt = format ?? ((value: number) => String(Math.round(value)));
    return Array.from({ length: Y_STEPS + 1 }, (_, i) => fmt((max * (Y_STEPS - i)) / Y_STEPS));
  }

  const leftTicks = $derived(ticks(leftMax, leftSeries[0]?.format));
  const rightTicks = $derived(rightSeries.length > 0 ? ticks(rightMax, rightSeries[0]?.format) : []);

  function xFor(index: number): number {
    if (pointCount <= 1) return VIEW_W / 2;
    return (index / (pointCount - 1)) * VIEW_W;
  }

  function yFor(value: number, max: number): number {
    if (max <= 0) return height - 2;
    const usable = height - 8;
    return height - 4 - (Math.min(value, max) / max) * usable;
  }

  function pointsFor(item: Series): string {
    const max = item.axis === "right" ? rightMax : leftMax;
    return item.values.map((value, index) => `${xFor(index)},${yFor(value, max)}`).join(" ");
  }

  /** Evenly spaced label slots, always keeping the first and last point. */
  const tickIndices = $derived.by(() => {
    if (pointCount === 0) return [];
    if (pointCount <= maxTicks) return Array.from({ length: pointCount }, (_, i) => i);
    const step = (pointCount - 1) / (maxTicks - 1);
    return Array.from({ length: maxTicks }, (_, i) => Math.round(i * step));
  });

  function formatValue(item: Series, value: number): string {
    return item.format ? item.format(value) : String(Math.round(value));
  }

  function handleMove(event: MouseEvent) {
    if (!plotEl || pointCount === 0) return;
    const rect = plotEl.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    hoverIndex = Math.round(ratio * (pointCount - 1));
  }

  const hoverLeftPercent = $derived(
    hoverIndex === null || pointCount <= 1 ? 0 : (hoverIndex / (pointCount - 1)) * 100,
  );
</script>

<div class="chart-area">
  <div class="y-axis" aria-hidden="true">
    {#each leftTicks as tick, index (index)}
      <span>{tick}</span>
    {/each}
  </div>

  <div
    class="plot-container"
    bind:this={plotEl}
    onmousemove={handleMove}
    onmouseleave={() => (hoverIndex = null)}
    role="presentation"
  >
    <div class="grid-lines" aria-hidden="true">
      {#each Array(Y_STEPS + 1) as _, index (index)}
        <span class="grid-line"></span>
      {/each}
    </div>

    <svg
      width="100%"
      {height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#each plotted as item (item.key)}
        <polyline
          points={pointsFor(item)}
          fill="none"
          stroke={item.color}
          stroke-width="2.2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      {#each plotted as item (item.key)}
        {#each item.values as value, index (index)}
          <circle
            cx={xFor(index)}
            cy={yFor(value, item.axis === "right" ? rightMax : leftMax)}
            r="4"
            fill="var(--gx-card)"
            stroke={item.color}
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        {/each}
      {/each}
      {#if hoverIndex !== null}
        <line
          x1={xFor(hoverIndex)}
          y1="0"
          x2={xFor(hoverIndex)}
          y2={height}
          stroke="var(--gx-an-grid)"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      {/if}
    </svg>

    {#if hoverIndex !== null}
      <div
        class="chart-tooltip"
        class:chart-tooltip--flip={hoverLeftPercent > 60}
        style="inset-inline-start: {hoverLeftPercent}%"
      >
        <span class="chart-tooltip__date">{(tooltipLabels ?? labels)[hoverIndex] ?? ""}</span>
        {#each series as item (item.key)}
          <span class="chart-tooltip__row">
            <span class="chart-tooltip__dot" style="background: {item.color}"></span>
            <span class="chart-tooltip__label">{item.label}</span>
            <span class="chart-tooltip__value">{formatValue(item, item.values[hoverIndex] ?? 0)}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if rightTicks.length > 0}
    <div class="y-axis y-axis--right" aria-hidden="true">
      {#each rightTicks as tick, index (index)}
        <span>{tick}</span>
      {/each}
    </div>
  {/if}
</div>

<div class="x-axis-row">
  <div class="x-axis-dates">
    {#each tickIndices as index (index)}
      <span>{labels[index] ?? ""}</span>
    {/each}
  </div>
  <span class="x-axis-label">{axisLabel}</span>
</div>

<style>
  .chart-area {
    display: flex;
    gap: 12px;
    font-family: var(--gx-font);
  }

  .y-axis {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .y-axis span {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    text-align: end;
    color: var(--gx-an-axis);
  }

  .y-axis--right span {
    text-align: start;
  }

  .plot-container {
    position: relative;
    flex-grow: 1;
    min-width: 0;
  }

  .grid-lines {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .grid-line {
    height: 1px;
    background: var(--gx-an-grid);
  }

  svg {
    display: block;
    position: relative;
  }

  .x-axis-row {
    display: flex;
    padding: 0 44px;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-family: var(--gx-font);
  }

  .x-axis-dates {
    display: flex;
    justify-content: space-between;
    flex-grow: 1;
    min-width: 0;
    gap: 8px;
  }

  .x-axis-dates span {
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-an-axis);
    white-space: nowrap;
  }

  .x-axis-label {
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    text-align: end;
    color: var(--gx-an-axis);
    flex-shrink: 0;
  }

  .chart-tooltip {
    position: absolute;
    top: 8px;
    transform: translateX(8px);
    min-width: 132px;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow:
      inset 0 0 0 1px var(--gx-an-ring),
      var(--gx-an-card-shadow);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
    z-index: 2;
  }

  .chart-tooltip--flip {
    transform: translateX(calc(-100% - 8px));
  }

  .chart-tooltip__date {
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-an-strong);
  }

  .chart-tooltip__row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .chart-tooltip__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chart-tooltip__label {
    flex-grow: 1;
    font-weight: 400;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-an-axis);
    white-space: nowrap;
  }

  .chart-tooltip__value {
    font-weight: 600;
    font-size: 11px;
    line-height: 100%;
    color: var(--gx-an-strong);
    white-space: nowrap;
  }
</style>
