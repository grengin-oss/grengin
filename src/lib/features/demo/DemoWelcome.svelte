<script lang="ts">
  /**
   * Interactive Demo — welcome notification (spec §2).
   *
   * ADDITIVE FILE — new to the demo layer; does not modify any existing webapp
   * component. Mounted once (next to GlobalTopBar) while the demo is active.
   *
   * 2–3 seconds after the page loads, shows a one-time toast with the exact
   * message from the spec. Fires once per page load.
   */
  import { onMount } from 'svelte';
  import { toast } from '$lib/components/Toaster.svelte';

  // Exact wording from spec §2.
  const WELCOME_MESSAGE =
    'Welcome to the grengin demo. its a demo will have limited feature, install grengin to fully experience grengin.';

  onMount(() => {
    const timer = setTimeout(() => {
      toast(WELCOME_MESSAGE, { icon: '✨', duration: 8000, position: 'top-center' });
    }, 2500);
    return () => clearTimeout(timer);
  });
</script>
