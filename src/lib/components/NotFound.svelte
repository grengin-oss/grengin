<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import { navigate } from "svelte-routing";
  import { setPageTitle } from "../utils/pageTitle";

  let { admin = false }: { admin?: boolean } = $props();

  const homeHref = $derived(admin ? "/admin" : "/");
  // Shown so a user can tell (and report) exactly which link was broken.
  const requestedPath = window.location.pathname + window.location.search;
  // "Go back" only makes sense when there is an in-app page to return to.
  const canGoBack = window.history.length > 1;

  $effect(() => {
    setPageTitle($_("errors.notFound.title"));
  });

  function goHome(event: MouseEvent) {
    // Let modified clicks (new tab / window) behave like a normal link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(homeHref);
  }
</script>

<section class="not-found" aria-labelledby="not-found-title">
  <div class="panel">
    <div class="mark" aria-hidden="true">
      <span class="mark-code">404</span>
      <span class="mark-icon">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 18l-5.5 2.5V6L9 3.5l6 2.5 5.5-2.5V18L15 20.5 9 18z" />
          <path d="M9 3.5V18M15 6v6" />
          <path d="M17.5 14.5l3 3m0-3l-3 3" />
        </svg>
      </span>
    </div>

    <p class="eyebrow">{$_("errors.notFound.eyebrow")}</p>
    <h1 id="not-found-title">{$_("errors.notFound.title")}</h1>
    <p class="message">{$_("errors.notFound.message")}</p>

    <div class="requested">
      <span class="requested-label">{$_("errors.notFound.requestedUrl")}</span>
      <code class="requested-path" title={requestedPath}>{requestedPath}</code>
    </div>

    <div class="actions">
      <a class="action action--primary" href={homeHref} onclick={goHome}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {#if admin}
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          {:else}
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          {/if}
        </svg>
        {admin ? $_("errors.notFound.backAdmin") : $_("errors.notFound.back")}
      </a>
      {#if canGoBack}
        <button type="button" class="action action--secondary" onclick={() => history.back()}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {$_("errors.notFound.goBack")}
        </button>
      {/if}
    </div>
  </div>
</section>

<style>
  .not-found {
    min-height: calc(100vh - 120px);
    min-height: calc(100dvh - 120px);
    display: grid;
    place-items: center;
    padding: 48px 24px;
    font-family: var(--gx-font);
  }

  .panel {
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  /* ---- mark: oversized outlined code with a small map badge ---- */
  .mark {
    position: relative;
    margin-bottom: 28px;
    line-height: 1;
  }

  .mark-code {
    display: block;
    font-family: var(--gx-font-display);
    font-size: clamp(88px, 16vw, 132px);
    font-weight: 800;
    letter-spacing: -0.04em;
    /* A soft fill that fades out downward, not an outline: text-stroke on a
       display face draws the overlapping inner contours of each glyph. */
    background: linear-gradient(
      180deg,
      var(--gx-hair-strong) 0%,
      color-mix(in oklab, var(--gx-hair-strong) 25%, transparent) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    user-select: none;
  }

  .mark-icon {
    position: absolute;
    right: -10px;
    bottom: 6px;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--gx-card);
    color: var(--gx-org-brand);
    border: 1px solid var(--gx-hair);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }

  /* ---- copy ---- */
  .eyebrow {
    margin: 0 0 10px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--gx-org-brand-tint);
    color: var(--gx-org-brand);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--gx-ink);
    font-family: var(--gx-font-display);
    font-size: clamp(24px, 3.4vw, 30px);
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .message {
    margin: 12px 0 0;
    max-width: 44ch;
    color: var(--gx-muted);
    font-size: 15px;
    line-height: 1.6;
  }

  /* ---- requested URL ---- */
  .requested {
    margin-top: 24px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: 1px solid var(--gx-hair);
    border-radius: 10px;
    background: var(--gx-card);
    text-align: start;
  }

  .requested-label {
    flex-shrink: 0;
    color: var(--gx-dim);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .requested-path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0;
    border: 0;
    background: none;
    color: var(--gx-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }

  /* ---- actions ---- */
  .actions {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 42px;
    padding: 0 18px;
    border-radius: 10px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .action--primary {
    border: 1px solid transparent;
    background: var(--gx-org-brand);
    color: #fff;
  }

  .action--primary:hover {
    background: var(--gx-org-brand-hover);
  }

  /* app.css paints every bare <button> as a glass pill; reset that here. */
  .action--secondary {
    border: 1px solid var(--gx-hair-strong);
    background: var(--gx-card);
    color: var(--gx-ink);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .action--secondary:hover {
    background: var(--gx-fill-soft);
    transform: none;
    box-shadow: none;
  }

  .action:focus-visible {
    outline: 2px solid var(--gx-org-brand);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    .not-found {
      padding: 32px 16px;
    }

    .requested {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .requested-path {
      max-width: 100%;
    }

    .actions {
      width: 100%;
      flex-direction: column;
    }

    .action {
      width: 100%;
    }
  }
</style>
