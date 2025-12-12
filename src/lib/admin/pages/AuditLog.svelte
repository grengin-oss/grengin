<script lang="ts">
  import { onMount } from "svelte";
  import AdminTableCard from "../components/AdminTableCard.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import ErrorMessage from "../components/ErrorMessage.svelte";
  import { getAuditLogs } from "../../api/index.js";
  import type { AuditLogEntry } from "../types.js";

  let logs = $state<AuditLogEntry[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let total = $state(0);
  let limit = $state(50);
  let offset = $state(0);

  async function fetchLogs() {
    isLoading = true;
    error = null;

    try {
      const response = await getAuditLogs({ limit, offset });
      logs = response.logs;
      total = response.total;
    } catch (err: any) {
      error = err.message || "Failed to load audit logs";
      console.error("Failed to fetch audit logs:", err);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    fetchLogs();
  });
</script>

<div class="audit-log-container">
  <PageHeader title="Audit Log" subtitle="View all administrative actions" />

  <div class="audit-content">
    {#if isLoading}
      <LoadingSpinner />
    {:else if error}
      <ErrorMessage message={error} onretry={fetchLogs} />
    {:else if logs.length === 0}
      <div class="empty-state">
        <p>No audit logs found.</p>
      </div>
    {:else}
      <AdminTableCard minWidth="900px">
        <table class="admin-table audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log (log.id)}
              <tr>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.admin_email}</td>
                <td>
                  <span class="action-badge">{log.action}</span>
                </td>
                <td>
                  {log.resource_type || "N/A"}
                  {#if log.resource_id}
                    <code class="resource-id">{log.resource_id}</code>
                  {/if}
                </td>
                <td>
                  <code class="details"
                    >{JSON.stringify(log.details || {})}</code
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </AdminTableCard>

      <div class="pagination-info">
        <p>
          Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .audit-log-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    padding: var(--space-3xl);
  }

  .audit-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .action-badge {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    background: rgba(var(--brand-rgb), 0.15);
    color: var(--brand);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .resource-id,
  .details {
    font-family: "SF Mono", Monaco, Menlo, "Ubuntu Mono", monospace;
    font-size: 0.8125rem;
    background: rgba(var(--glass-tint), 0.05);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .empty-state {
    padding: var(--space-3xl);
    text-align: center;
    color: var(--text-secondary);
  }

  .pagination-info {
    padding: var(--space-lg);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
