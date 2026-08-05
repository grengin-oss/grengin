<script lang="ts">
  // The standalone User Management page was merged into the Organization page
  // (ENGG-388). This route now redirects to the Users tab so existing bookmarks
  // and in-product links keep working instead of 404-ing.
  import { onMount } from "svelte";
  import { navigate } from "svelte-routing";

  onMount(() => {
    const url = new URL(window.location.href);
    const target = `/admin/departments?tab=users${url.hash}`;
    navigate(target, { replace: true });
  });
</script>
