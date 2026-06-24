<script lang="ts">
  import { _ } from "svelte-i18n";
  import Modal from "../Modal.svelte";
  import type { TimeseriesDataPoint } from "../../types.js";

  interface TableColumn {
    id: string;
    label: string;
    value: (row: TimeseriesDataPoint) => string | number;
  }

  interface Props {
    title: string;
    caption: string;
    rows: TimeseriesDataPoint[];
    columns: TableColumn[];
    onClose: () => void;
  }

  let { title, caption, rows, columns, onClose }: Props = $props();
</script>

<Modal
  isOpen={true}
  title={`${title} - ${$_("analytics.charts.accessibility.viewDataTable")}`}
  onclose={onClose}
  restoreFocusOnClose={false}
>
  <div
    class="data-table-content"
    role="region"
    aria-label={$_("analytics.charts.accessibility.dataTableRegion", { values: { chartName: title } })}
  >
    <table>
      <caption class="sr-only">{caption}</caption>
      <thead>
        <tr>
          {#each columns as column}
            <th scope="col">{column.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row}
          <tr>
            {#each columns as column}
              <td>{column.value(row)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Modal>

<style>
  .data-table-content {
    overflow: auto;
    max-height: calc(80vh - 6.5rem);
    padding: 0;
  }

  .data-table-content table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table-content thead {
    background: var(--btn-secondary);
    border-bottom: 1px solid var(--glass-stroke-dark);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .data-table-content th {
    padding: var(--space-md) var(--space-lg);
    text-align: left;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .data-table-content td {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--glass-stroke-dark);
    font-size: 0.9375rem;
    color: var(--text-primary);
  }

  .data-table-content tbody tr {
    transition: background 0.2s ease;
  }

  .data-table-content tbody tr:hover {
    background: var(--btn-tertiary);
  }
</style>
