<script lang="ts">
  import { _ } from "svelte-i18n";
  import BackendUrlSettings from "$lib/components/BackendUrlSettings.svelte";
</script>

<section class="backend-settings-page" aria-labelledby="backend-settings-heading">
  <div class="section-header">
    <div>
      <h2 id="backend-settings-heading">{$_("backendSettings.title")}</h2>
      <p>{$_("backendSettings.subtitle")}</p>
    </div>
  </div>

  <BackendUrlSettings />
</section>

<style>
  .backend-settings-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
    padding: var(--space-xl);
  }

  .section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-xl);
  }

  .section-header h2 {
    margin: 0 0 var(--space-xs);
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .section-header p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
    font-weight: 500;
  }

  @media (max-width: 480px) {
    .backend-settings-page {
      padding: var(--space-lg);
    }
  }
</style>
