<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    LineController,
    BarController,
    DoughnutController,
    LineElement,
    BarElement,
    ArcElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';

  // Register Chart.js components
  Chart.register(
    LineController,
    BarController,
    DoughnutController,
    LineElement,
    BarElement,
    ArcElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Title,
    Tooltip,
    Legend
  );

  interface Props {
    type: 'line' | 'bar' | 'doughnut';
    data: any;
    options?: any;
  }

  let { type, data, options = {} }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: {
              family: "'Coustard', -apple-system, BlinkMacSystemFont, system-ui, serif",
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 22, 0.9)',
          titleColor: 'rgba(255, 255, 255, 0.95)',
          bodyColor: 'rgba(255, 255, 255, 0.7)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
        },
      },
      scales: type !== 'doughnut' ? {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
          },
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
          },
        },
      } : undefined,
    };

    chart = new Chart(ctx, {
      type,
      data,
      options: { ...defaultOptions, ...options },
    });

    return () => {
      chart?.destroy();
    };
  });

  $effect(() => {
    if (chart && data) {
      chart.data = data;
      chart.update();
    }
  });
</script>

<div class="chart-wrapper">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-wrapper {
    width: 100%;
    height: 100%;
    min-height: 300px;
  }
</style>

