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
   *
   * Each series picks its own mark, so one card can mix them the way the
   * design's four modes do: a line for Multi-Metric, bars behind a line for
   * Usage Growth, grouped bars for API Reliability, a filled area for Cost.
   */
  interface Series {
    key: string;
    label: string;
    color: string;
    values: number[];
    axis?: "left" | "right";
    /** Mark used for this series. Defaults to `line`. */
    kind?: "line" | "area" | "bar";
    /**
     * Draw the stroke as a curve rather than straight segments. Defaults to
     * true for lines and areas, matching the design's `pointsToSmoothPath`.
     */
    smooth?: boolean;
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
  /** Bars never grow past this on screen, however wide the card gets. */
  const MAX_BAR_PX = 16;
  /** Gap between the bars of one group (Success next to Errors). */
  const BAR_GAP_PX = 3;
  /** The design's bars are divs with border-radius: 3px. */
  const BAR_RADIUS_PX = 3;

  let plotEl = $state<HTMLDivElement | null>(null);
  let plotWidth = $state(0);
  let hoverIndex = $state<number | null>(null);

  const pointCount = $derived(
    Math.max(...series.map((s) => s.values.length), 0),
  );
  const plotted = $derived(series.filter((s) => !s.tooltipOnly));
  const leftSeries = $derived(
    plotted.filter((s) => (s.axis ?? "left") === "left"),
  );
  const rightSeries = $derived(plotted.filter((s) => s.axis === "right"));

  /** Bars share one band per point, so they need to know the whole group. */
  const barSeries = $derived(plotted.filter((s) => s.kind === "bar"));
  const curveSeries = $derived(plotted.filter((s) => s.kind !== "bar"));

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
    return Array.from({ length: Y_STEPS + 1 }, (_, i) =>
      fmt((max * (Y_STEPS - i)) / Y_STEPS),
    );
  }

  const leftTicks = $derived(ticks(leftMax, leftSeries[0]?.format));
  const rightTicks = $derived(
    rightSeries.length > 0 ? ticks(rightMax, rightSeries[0]?.format) : [],
  );

  function xFor(index: number): number {
    if (pointCount <= 1) return VIEW_W / 2;
    return (index / (pointCount - 1)) * VIEW_W;
  }

  function yFor(value: number, max: number): number {
    if (max <= 0) return height - 2;
    const usable = height - 8;
    return height - 4 - (Math.min(value, max) / max) * usable;
  }

  /** Baseline the bars stand on and the areas close against. */
  const baseline = $derived(height - 4);

  type Point = [number, number];

  function coordsFor(item: Series): Point[] {
    const max = item.axis === "right" ? rightMax : leftMax;
    return item.values.map((value, index) => [xFor(index), yFor(value, max)]);
  }

  function straightPath(points: Point[]): string {
    return points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
      .join(" ");
  }

  /**
   * Catmull-Rom converted to cubic Béziers at 1/6 tension — the same curve as
   * `pointsToSmoothPath` in usage-analytics-overview.html. Control points are
   * derived from each point's neighbours, so the stroke passes through every
   * data point rather than being smoothed away from it.
   */
  function smoothPath(points: Point[]): string {
    if (points.length < 2) return straightPath(points);
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const previous = points[i - 1] ?? points[i];
      const start = points[i];
      const end = points[i + 1];
      const next = points[i + 2] ?? end;
      const c1x = start[0] + (end[0] - previous[0]) / 6;
      const c1y = start[1] + (end[1] - previous[1]) / 6;
      const c2x = end[0] - (next[0] - start[0]) / 6;
      const c2y = end[1] - (next[1] - start[1]) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end[0]} ${end[1]}`;
    }
    return d;
  }

  function isSmooth(item: Series): boolean {
    return item.smooth ?? item.kind !== "bar";
  }

  function strokePathFor(item: Series): string {
    const points = coordsFor(item);
    return isSmooth(item) ? smoothPath(points) : straightPath(points);
  }

  /** The stroke, then down to the baseline and back to close the fill. */
  function areaPathFor(item: Series): string {
    const points = coordsFor(item);
    if (points.length < 2) return "";
    const last = points[points.length - 1][0];
    const first = points[0][0];
    return `${strokePathFor(item)} L ${last} ${baseline} L ${first} ${baseline} Z`;
  }

  /**
   * Bars sit in a band per point, sharing it between the bar series so
   * Success and Errors read as a pair. Edge bands are nudged inward so the
   * first and last bar are not clipped by the viewBox.
   */
  const barBand = $derived(pointCount > 0 ? VIEW_W / pointCount : VIEW_W);

  /**
   * The viewBox is stretched horizontally (preserveAspectRatio="none"), so a
   * width in viewBox units is not a width in pixels. Converting through the
   * measured plot width is what lets the cap below be a real 16px.
   */
  const unitsPerPixel = $derived(plotWidth > 0 ? VIEW_W / plotWidth : 0);

  const barGap = $derived(BAR_GAP_PX * unitsPerPixel);

  const barWidth = $derived.by(() => {
    const count = barSeries.length;
    if (count === 0) return 0;
    const available = barBand * 0.62;
    if (unitsPerPixel <= 0) return available / count;
    /** The gaps come out of the band first, so dense ranges still show them. */
    const share = Math.max(0, available - barGap * (count - 1)) / count;
    return Math.min(share, MAX_BAR_PX * unitsPerPixel);
  });

  /**
   * Only the horizontal axis is stretched, so the corner radius needs its own
   * x value to come out as 3px both ways rather than as an ellipse.
   */
  const barRadiusX = $derived(
    unitsPerPixel > 0 ? BAR_RADIUS_PX * unitsPerPixel : BAR_RADIUS_PX,
  );

  /** Derived from the capped width so a Success/Errors pair stays centred. */
  const barGroupWidth = $derived(
    barWidth * barSeries.length + barGap * Math.max(0, barSeries.length - 1),
  );

  function barX(seriesIndex: number, index: number): number {
    const start = xFor(index) - barGroupWidth / 2;
    const clamped = Math.min(
      Math.max(start, 0),
      Math.max(0, VIEW_W - barGroupWidth),
    );
    return clamped + seriesIndex * (barWidth + barGap);
  }

  function barTop(item: Series, value: number): number {
    return yFor(value, item.axis === "right" ? rightMax : leftMax);
  }

  /** Evenly spaced label slots, always keeping the first and last point. */
  /* Roughly what one "04 Sept"-style label needs before neighbours collide. */
  const PX_PER_TICK = 52;

  /* `maxTicks` is the ceiling the caller asks for; on a narrow card there is
     physically no room for that many, and the labels used to spill out past
     the card's right edge (the axis row is a nowrap flex row). Thin them to
     whatever the measured plot width can actually hold. */
  const effectiveMaxTicks = $derived(
    plotWidth > 0
      ? Math.max(2, Math.min(maxTicks, Math.floor(plotWidth / PX_PER_TICK)))
      : maxTicks,
  );

  const tickIndices = $derived.by(() => {
    if (pointCount === 0) return [];
    const ticks = effectiveMaxTicks;
    if (pointCount <= ticks)
      return Array.from({ length: pointCount }, (_, i) => i);
    const step = (pointCount - 1) / (ticks - 1);
    return Array.from({ length: ticks }, (_, i) => Math.round(i * step));
  });

  function formatValue(item: Series, value: number): string {
    return item.format ? item.format(value) : String(Math.round(value));
  }

  function handleMove(event: MouseEvent) {
    if (!plotEl || pointCount === 0) return;
    const rect = plotEl.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    hoverIndex = Math.round(ratio * (pointCount - 1));
  }

  const hoverLeftPercent = $derived(
    hoverIndex === null || pointCount <= 1
      ? 0
      : (hoverIndex / (pointCount - 1)) * 100,
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
    bind:clientWidth={plotWidth}
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
      <!-- areas sit furthest back so a line drawn over them stays readable -->
      {#each curveSeries as item (item.key)}
        {#if item.kind === "area" && item.values.length > 1}
          <path
            d={areaPathFor(item)}
            fill={item.color}
            fill-opacity="0.12"
            stroke="none"
          />
        {/if}
      {/each}

      {#each barSeries as item, seriesIndex (item.key)}
        {#each item.values as value, index (index)}
          {@const top = barTop(item, value)}
          <rect
            x={barX(seriesIndex, index)}
            y={top}
            width={barWidth}
            height={Math.max(0, baseline - top)}
            rx={barRadiusX}
            ry={BAR_RADIUS_PX}
            fill={item.color}
            fill-opacity={hoverIndex === null || hoverIndex === index
              ? 1
              : 0.45}
          />
        {/each}
      {/each}

      {#each curveSeries as item (item.key)}
        <path
          d={strokePathFor(item)}
          fill="none"
          stroke={item.color}
          stroke-width="4"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      {#each curveSeries as item (item.key)}
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
      <!-- bar charts mark the hovered band by dimming the others instead -->
      {#if hoverIndex !== null && curveSeries.length > 0}
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
        <span class="chart-tooltip__date"
          >{(tooltipLabels ?? labels)[hoverIndex] ?? ""}</span
        >
        {#each series as item (item.key)}
          <span class="chart-tooltip__row">
            <span class="chart-tooltip__dot" style="background: {item.color}"
            ></span>
            <span class="chart-tooltip__label">{item.label}</span>
            <span class="chart-tooltip__value"
              >{formatValue(item, item.values[hoverIndex] ?? 0)}</span
            >
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
    /* The row must be allowed to shrink inside the card, otherwise its
       nowrap children set a min-content floor wider than the viewport. */
    min-width: 0;
  }

  /* The 44px gutters exist to clear the y-axis tick labels on a wide card.
     On a phone they cost more than a quarter of the screen. */
  @media (max-width: 560px) {
    .x-axis-row {
      padding: 0 8px;
      gap: 8px;
    }
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
