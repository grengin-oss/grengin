<script lang="ts">
  import { _ } from "svelte-i18n";
  import {
    getThemeState,
    setThemePreference,
    type ThemePreference,
  } from "$lib/theme.svelte.js";

  interface ThemeOption {
    id: ThemePreference;
    labelKey: string;
    descriptionKey: string;
  }

  const themeState = getThemeState();

  const themeOptions: ThemeOption[] = [
    {
      id: "light",
      labelKey: "appearanceSettings.theme.light",
      descriptionKey: "appearanceSettings.theme.lightDescription",
    },
    {
      id: "system",
      labelKey: "appearanceSettings.theme.system",
      descriptionKey: "appearanceSettings.theme.systemDescription",
    },
    {
      id: "dark",
      labelKey: "appearanceSettings.theme.dark",
      descriptionKey: "appearanceSettings.theme.darkDescription",
    },
  ];

  function handleThemeSelect(preference: ThemePreference): void {
    setThemePreference(preference);
  }
</script>

<section class="appearance-settings" aria-labelledby="appearance-heading">
  <div class="section-header">
    <div>
      <h2 id="appearance-heading">{$_("appearanceSettings.title")}</h2>
      <p>{$_("appearanceSettings.subtitle")}</p>
    </div>
  </div>

  <div
    class="theme-options"
    role="radiogroup"
    aria-label={$_("appearanceSettings.theme.label")}
  >
    {#each themeOptions as option (option.id)}
      <button
        type="button"
        class="theme-option"
        class:theme-option--active={themeState.preference === option.id}
        role="radio"
        aria-checked={themeState.preference === option.id}
        onclick={() => handleThemeSelect(option.id)}
      >
        <span class={`theme-swatch theme-swatch--${option.id}`} aria-hidden="true"></span>
        <span class="theme-copy">
          <span class="theme-label">{$_(option.labelKey)}</span>
          <span class="theme-description">{$_(option.descriptionKey)}</span>
        </span>
      </button>
    {/each}
  </div>
</section>

<style>
  .appearance-settings {
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

  .theme-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-lg);
  }

  .theme-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-md);
    min-height: 5.5rem;
    padding: var(--space-lg);
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    background: var(--surface-card);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }

  .theme-option:hover {
    border-color: color-mix(in oklab, var(--brand) 35%, var(--surface-border));
    background: var(--surface-card-interactive);
    transform: translateY(-1px);
  }

  .theme-option:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .theme-option--active {
    border-color: color-mix(in oklab, var(--brand) 65%, var(--surface-border));
    background: var(--surface-accent);
  }

  .theme-swatch {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid var(--surface-border);
    box-shadow: inset 0 0 0 0.25rem rgba(var(--brand-rgb), 0.1);
  }

  .theme-swatch--light {
    background: linear-gradient(135deg, #ffffff 0 50%, #d9e6f7 50% 100%);
  }

  .theme-swatch--system {
    background: linear-gradient(135deg, #ffffff 0 50%, #111827 50% 100%);
  }

  .theme-swatch--dark {
    background: linear-gradient(135deg, #111827 0 50%, #2d906b 50% 100%);
  }

  .theme-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--space-xs);
  }

  .theme-label {
    color: var(--text-primary);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .theme-description {
    color: var(--text-secondary);
    font-size: 0.84rem;
    line-height: 1.35;
    font-weight: 500;
  }

  @media (max-width: 900px) {
    .theme-options {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .appearance-settings {
      padding: var(--space-lg);
    }

    .theme-option {
      min-height: 5rem;
      padding: var(--space-md);
    }
  }
</style>
