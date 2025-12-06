<script lang="ts">
  // Basic admin dashboard placeholder
</script>

<div class="admin-page">
  <div class="admin-header">
    <h1>Admin Dashboard</h1>
    <p class="subtitle">Welcome to the admin panel</p>
  </div>

  <div class="admin-content">
    <div class="placeholder-card">
      <h2>Admin Features Coming Soon</h2>
      <p>This is a placeholder for the admin dashboard. The following features will be available:</p>
      <ul>
        <li>User Management</li>
        <li>Usage Statistics</li>
        <li>Settings</li>
        <li>Audit Log</li>
      </ul>
    </div>
  </div>
</div>

<style>
  .admin-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .admin-header {
    margin-bottom: 2rem;
  }

  .admin-header h1 {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    color: var(--text-secondary);
    margin: 0;
  }

  .admin-content {
    display: grid;
    gap: 1.5rem;
  }

  .placeholder-card {
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    padding: 2rem;
  }

  .placeholder-card h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
  }

  .placeholder-card p {
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
  }

  .placeholder-card ul {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--text-secondary);
  }

  .placeholder-card li {
    margin: 0.5rem 0;
  }
</style>
