<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
</script>

<section class="forbidden">
  <div class="forbidden-card surface-elevated rounded-2xl">
    <div class="icon-badge surface-accent rounded-xl" aria-hidden="true">
      <img
        src="/src/assets/ic_forbidden.webp"
        alt={$_("errors.forbidden.iconAlt")}
      />
    </div>
    <p class="code">403</p>
    <h1>{$_("errors.forbidden.title")}</h1>
    <p class="message">
      {$_("errors.forbidden.message")}
    </p>
    <a class="btn-glass" href="/">{$_("errors.forbidden.back")}</a>
  </div>
</section>

<style>
  .forbidden {
    min-height: calc(100vh - 120px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl) var(--space-lg);
  }

  .forbidden-card {
    width: min(720px, 100%);
    padding: clamp(var(--space-xl), 4vw, var(--space-2xl));
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    text-align: center;
    align-items: center;
    box-shadow: var(--shadow-lg);
  }

  .icon-badge {
    width: 120px;
    height: 120px;
    display: grid;
    place-items: center;
    font-size: 1.4rem;
  }

  .icon-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }

  .code {
    font-size: clamp(2.5rem, 6vw, 3.5rem);
    font-weight: 700;
    margin: 0;
    color: var(--text-secondary);
    letter-spacing: 0.1em;
  }

  h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(1.4rem, 3vw, 2rem);
  }

  .message {
    margin: 0;
    color: var(--text-secondary);
    max-width: 40ch;
  }

  @media (max-width: 480px) {
    .forbidden {
      padding: var(--space-xl) var(--space-md);
    }

    .icon-badge {
      width: 64px;
      height: 64px;
    }

    .icon-badge img {
      width: 36px;
      height: 36px;
    }
  }
</style>
