<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { locale } from 'svelte-i18n';
  import { SUPPORTED_LOCALES, switchLocale, type SupportedLocale } from '$lib/i18n';

  let isOpen = $state(false);
  let isSwitching = $state(false);

  async function setLanguage(lang: SupportedLocale) {
    if (isSwitching) return;
    isSwitching = true;
    try {
      await switchLocale(lang);
      locale.set(lang);
      localStorage.setItem('locale', lang);
    } finally {
      isSwitching = false;
      isOpen = false;
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  $effect(() => {
    const savedLocale = localStorage.getItem('locale');
    if (savedLocale && savedLocale in SUPPORTED_LOCALES) {
      locale.set(savedLocale);
    }
  });
</script>

<div class="language-switcher">
  <button class="language-button" onclick={toggleDropdown}>
    <span class="language-icon">🌐</span>
    <span class="current-language">
      {SUPPORTED_LOCALES[$locale as SupportedLocale] || 'English'}
    </span>
    <span class="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
  </button>

  {#if isOpen}
    <div class="language-dropdown">
      {#each Object.entries(SUPPORTED_LOCALES) as [code, name]}
        <button
          class="language-option"
          class:active={$locale === code}
          onclick={() => setLanguage(code as SupportedLocale)}
        >
          {name}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .language-switcher {
    position: relative;
    display: inline-block;
  }

  .language-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-bg-secondary, #f5f5f5);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .language-button:hover {
    background: var(--color-bg-hover, #e5e5e5);
  }

  .language-icon {
    font-size: 1.125rem;
  }

  .current-language {
    font-weight: 500;
  }

  .dropdown-arrow {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .language-dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    inset-inline-end: 0;
    min-width: 180px;
    background: white;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    overflow: hidden;
  }

  .language-option {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    text-align: start;
    background: white;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .language-option:hover {
    background: var(--color-bg-hover, #f5f5f5);
  }

  .language-option.active {
    background: var(--color-primary-light, #e3f2fd);
    font-weight: 600;
  }
</style>
