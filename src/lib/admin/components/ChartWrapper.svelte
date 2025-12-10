<script lang="ts">
  import { onMount } from 'svelte';
  import embed, { type VisualizationSpec } from 'vega-embed';

  interface Props {
    spec: VisualizationSpec;
    options?: Record<string, any>;
  }

  let { spec, options = {} }: Props = $props();

  let container: HTMLDivElement;
  let view: any = null;

  const defaultOptions = {
    actions: false,
    renderer: 'svg' as const,
    theme: 'dark' as const,
    config: {
      background: 'transparent',
      axis: {
        labelColor: 'rgba(255, 255, 255, 0.6)',
        titleColor: 'rgba(255, 255, 255, 0.7)',
        gridColor: 'rgba(255, 255, 255, 0.05)',
        domainColor: 'rgba(255, 255, 255, 0.1)',
        tickColor: 'rgba(255, 255, 255, 0.1)',
      },
      legend: {
        labelColor: 'rgba(255, 255, 255, 0.7)',
        titleColor: 'rgba(255, 255, 255, 0.8)',
      },
      title: {
        color: 'rgba(255, 255, 255, 0.95)',
      },
    },
  };

  async function renderChart() {
    if (!container || !spec) return;

    try {
      if (view) {
        view.finalize();
      }
      const result = await embed(container, spec, { ...defaultOptions, ...options });
      view = result.view;
    } catch (err) {
      // Chart rendering failed silently
    }
  }

  onMount(() => {
    renderChart();
    return () => {
      if (view) {
        view.finalize();
      }
    };
  });

  $effect(() => {
    if (spec) {
      renderChart();
    }
  });
</script>

<div class="chart-wrapper" bind:this={container}></div>

<style>
  .chart-wrapper {
    width: 100%;
    height: 100%;
    min-height: 300px;
  }

  .chart-wrapper :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
