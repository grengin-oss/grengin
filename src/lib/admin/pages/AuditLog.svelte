<script lang="ts">
  import PageHeader from '../components/PageHeader.svelte';

  // This is a simplified audit log page
  // In a real implementation, you'd fetch from the audit API
  // and display a filterable table of admin actions

  const mockLogs = [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      admin_email: 'admin@example.com',
      action: 'CREATE_USER',
      resource_type: 'user',
      resource_id: 'user-123',
      details: { email: 'newuser@example.com' },
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      admin_email: 'admin@example.com',
      action: 'UPDATE_SETTINGS',
      resource_type: 'organization',
      resource_id: 'org-1',
      details: { setting: 'require_mfa', value: true },
    },
  ];
</script>

<PageHeader
  title="Audit Log"
  subtitle="View all administrative actions"
/>

<div class="audit-content">
  <div class="table-container">
    <table class="audit-table">
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
        {#each mockLogs as log (log.id)}
          <tr>
            <td>{new Date(log.timestamp).toLocaleString()}</td>
            <td>{log.admin_email}</td>
            <td>
              <span class="action-badge">{log.action}</span>
            </td>
            <td>
              {log.resource_type}
              {#if log.resource_id}
                <code class="resource-id">{log.resource_id}</code>
              {/if}
            </td>
            <td>
              <code class="details">{JSON.stringify(log.details)}</code>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="audit-note">
    Note: Audit logging endpoint needs to be implemented on the backend.
    This is showing mock data.
  </p>
</div>

<style>
  .audit-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .table-container {
    overflow-x: auto;
    background: rgba(var(--glass-tint), 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-lg);
  }

  .audit-table {
    width: 100%;
    border-collapse: collapse;
  }

  .audit-table th,
  .audit-table td {
    padding: var(--space-lg);
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .audit-table th {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.8125rem;
    background: rgba(var(--glass-tint), 0.05);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .audit-note {
    padding: var(--space-lg);
    background: rgba(255, 165, 0, 0.1);
    border: 1px solid rgba(255, 165, 0, 0.3);
    border-radius: var(--radius-md);
    color: #FFA500;
    font-size: 0.875rem;
  }
</style>

