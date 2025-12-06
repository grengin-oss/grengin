<script lang="ts">
  import AdminLayout from './components/AdminLayout.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import Users from './pages/Users.svelte';
  import Usage from './pages/Usage.svelte';
  import Settings from './pages/Settings.svelte';
  import AuditLog from './pages/AuditLog.svelte';

  let currentPage = $state<string>('dashboard');

  function handleNavigate(page: string) {
    currentPage = page;
  }
</script>

<AdminLayout onnavigate={handleNavigate}>
  {#snippet children()}
    {#if currentPage === 'dashboard'}
      <Dashboard />
    {:else if currentPage === 'users'}
      <Users />
    {:else if currentPage === 'usage'}
      <Usage />
    {:else if currentPage === 'settings'}
      <Settings />
    {:else if currentPage === 'audit-log'}
      <AuditLog />
    {:else}
      <Dashboard />
    {/if}
  {/snippet}
</AdminLayout>

