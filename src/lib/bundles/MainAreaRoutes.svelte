<script lang="ts">
  import { useLocation } from 'svelte-routing';
  import LazyLoad from '$lib/components/LazyLoad.svelte';

  const location = useLocation();

  function loadUserApp() {
    return import('./UserApp.svelte');
  }

  function loadAdminApp() {
    return import('./AdminApp.svelte');
  }
</script>

{#if $location.pathname.startsWith('/admin')}
  <LazyLoad loader={loadAdminApp} />
{:else}
  <LazyLoad loader={loadUserApp} />
{/if}
