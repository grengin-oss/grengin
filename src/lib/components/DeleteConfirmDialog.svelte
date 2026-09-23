<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  The destructive confirm in the redesigned dialog family: a 6px gradient rule,
  a red trash tile beside a title-and-subtitle heading, the consequence in the
  body, and a pinned footer whose actions sit on the end edge.

  It is content-agnostic — callers pass already-localised strings and do the
  work themselves, reporting progress through `isBusy`. Chat deletion and both
  project-deletion entry points had grown their own copy of this markup and
  ~60 lines of near-identical CSS each; this is the one implementation.
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import Modal from "$lib/admin/components/Modal.svelte";

  interface Props {
    /** Dialog heading, e.g. "Delete Project". */
    title: string;
    /** Second line under the title — normally the name of the thing at risk. */
    subtitle?: string;
    /** The consequence, spelled out. */
    message: string;
    /** Danger button at rest. */
    confirmLabel: string;
    /** Danger button while `isBusy`. */
    busyLabel: string;
    /** Cancel button; falls back to the shared label. */
    cancelLabel?: string;
    /** True while the caller's request is in flight. */
    isBusy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    title,
    subtitle = undefined,
    message,
    confirmLabel,
    busyLabel,
    cancelLabel = undefined,
    isBusy = false,
    onCancel,
    onConfirm,
  }: Props = $props();

  function handleClose() {
    if (isBusy) return;
    onCancel();
  }
</script>

<Modal
  isOpen={true}
  {title}
  {subtitle}
  onclose={handleClose}
  variant="access-control"
>
  {#snippet headerIcon()}
    <span class="del-tile" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M2.5 5h15M8 5V3.5A1.5 1.5 0 0 1 9.5 2h1A1.5 1.5 0 0 1 12 3.5V5m2.5 0-.6 10.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8L5.5 5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  {/snippet}

  <p class="confirm-text">{message}</p>

  {#snippet footer()}
    <span></span>
    <div class="confirm-actions">
      <button
        class="btn-cancel"
        type="button"
        onclick={handleClose}
        disabled={isBusy}
      >
        {cancelLabel ?? $_("common.cancel")}
      </button>
      <button
        class="btn-danger"
        type="button"
        onclick={onConfirm}
        disabled={isBusy}
      >
        {#if isBusy}
          <span class="spinner" aria-hidden="true"></span>
        {/if}
        <span>{isBusy ? busyLabel : confirmLabel}</span>
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  /* The dialog renders in the shared #modal-portal, outside this component's
     tree; Svelte stamps its scope class on the markup, so these rules follow
     it there. Only global --gx-* tokens are used.

     app.css paints every bare <button> as a glass pill — both actions are
     flat, so that is switched off first. */
  button {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    color: inherit;
    font: inherit;
    line-height: normal;
    cursor: pointer;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: none;
  }

  button:hover,
  button:active {
    transform: none;
    box-shadow: none;
    background: none;
  }

  .del-tile {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gx-org-danger-bg);
    color: var(--gx-org-danger);
  }

  .confirm-text {
    margin: 0;
    font-family: var(--gx-font);
    font-weight: 400;
    font-size: 14px;
    line-height: 1.6;
    color: var(--gx-ac-slate-600);
  }

  .confirm-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    margin-inline-start: auto;
  }

  .btn-cancel,
  .btn-danger {
    height: 37px;
    padding: 10px 16px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 14px;
    line-height: 100%;
    transition: background-color 120ms ease;
  }

  .btn-cancel {
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    color: var(--gx-ac-slate-600);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-org-track);
  }

  .btn-danger {
    background: var(--gx-org-danger);
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--gx-org-danger) 88%, black);
  }

  .btn-cancel:disabled,
  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-cancel:focus-visible,
  .btn-danger:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 2px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
