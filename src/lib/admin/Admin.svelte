<script lang="ts">
  import { navigate, useLocation } from 'svelte-routing';
  import AdminLayout from './components/AdminLayout.svelte';
  import Users from './pages/Users.svelte';
  import Usage from './pages/Usage.svelte';
  import Settings from './pages/Settings.svelte';
  import AuditLog from './pages/AuditLog.svelte';
  import Dashboard from './pages/Dashboard.svelte';

  const location = useLocation();
  
  // Map routes to components
  const routes: Record<string, any> = {
    // '/admin/dashboard': Dashboard,
    '/admin/users': Users,
    '/admin/usage': Usage,
    '/admin/settings': Settings,
    '/admin/audit-log': AuditLog,
  };

  const CurrentComponent = $derived(routes[$location.pathname] || Users);

  // Redirect /admin to /admin/users
  $effect(() => {
    if ($location.pathname === '/admin') {
      navigate('/admin/users', { replace: true });
    }
  });
</script>

<AdminLayout>
  {#snippet children()}
    <CurrentComponent />
  {/snippet}
</AdminLayout>

