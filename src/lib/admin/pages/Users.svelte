<script lang="ts">
  // Admin Users page placeholder
</script>

<div class="admin-page">
  <div class="admin-header">
    <h1>User Management</h1>
    <p class="subtitle">Manage users and their permissions</p>
  </div>

  <div class="admin-content">
    <div class="placeholder-card">
      <h2>Users List</h2>
      <p>User management functionality coming soon. This page will allow you to:</p>
      <ul>
        <li>View all registered users</li>
        <li>Edit user roles and permissions</li>
        <li>Enable/disable user accounts</li>
        <li>View user activity history</li>
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
